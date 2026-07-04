import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireEventManager, mockInviteEmail, mockPrisma } = vi.hoisted(() => ({
  mockRequireEventManager: vi.fn(),
  mockInviteEmail: vi.fn(),
  mockPrisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    eventInvitation: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    signupEvent: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/email/templates", () => ({
  sendEventInvitationEmail: (...args: unknown[]) => mockInviteEmail(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import { canViewSignupEvent, type SignupEventGate } from "@/lib/utils/event-access";
import { sendEventInvitations } from "@/lib/actions/event-invitations";

const EVENT_ID = "cldevent0000000000000001";

function gate(overrides: Partial<SignupEventGate> = {}): SignupEventGate {
  return {
    id: EVENT_ID,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    linkToken: null,
    ...overrides,
  };
}

describe("canViewSignupEvent (visibility gate matrix)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies everything while DRAFT", async () => {
    expect(await canViewSignupEvent(gate({ status: "DRAFT" }), { userId: "user-1" })).toBe(false);
  });

  it("PUBLIC: anyone may view, signed in or not", async () => {
    expect(await canViewSignupEvent(gate(), { userId: null })).toBe(true);
    expect(await canViewSignupEvent(gate(), { userId: "user-1" })).toBe(true);
  });

  it("LINK: only the current token grants access", async () => {
    const linkGate = gate({ visibility: "LINK", linkToken: "current-token" });
    expect(await canViewSignupEvent(linkGate, { userId: "user-1", linkToken: "current-token" })).toBe(true);
    expect(await canViewSignupEvent(linkGate, { userId: "user-1", linkToken: "old-token" })).toBe(false);
    expect(await canViewSignupEvent(linkGate, { userId: "user-1" })).toBe(false);
  });

  it("INVITE_ONLY: requires a signed-in user with a non-revoked invitation", async () => {
    const inviteGate = gate({ visibility: "INVITE_ONLY" });

    expect(await canViewSignupEvent(inviteGate, { userId: null })).toBe(false);

    mockPrisma.user.findUnique.mockResolvedValue({ email: "invited@example.com" });
    mockPrisma.eventInvitation.findFirst.mockResolvedValue({ id: "inv-1" });
    expect(await canViewSignupEvent(inviteGate, { userId: "user-1" })).toBe(true);
    const where = mockPrisma.eventInvitation.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "REVOKED" });

    mockPrisma.eventInvitation.findFirst.mockResolvedValue(null);
    expect(await canViewSignupEvent(inviteGate, { userId: "user-2" })).toBe(false);
  });

  it("PRIVATE: no one passes the public gate", async () => {
    expect(await canViewSignupEvent(gate({ visibility: "PRIVATE" }), { userId: "user-1" })).toBe(false);
  });
});

describe("sendEventInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      title: "Goalie Clinic",
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "PUBLISHED",
      hostOrganization: null,
      hostLeague: { name: "GFHA" },
      hostTeam: null,
    });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.eventInvitation.upsert.mockResolvedValue({ id: "inv-1", token: "tok" });
  });

  it("creates invitations, dedupes addresses, and reports failures", async () => {
    mockInviteEmail.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("smtp down"));

    const result = await sendEventInvitations({
      eventId: EVENT_ID,
      emails: ["a@example.com", "A@example.com", "b@example.com"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sent).toBe(1);
      expect(result.data.skipped).toEqual(["b@example.com"]);
    }
    // Case-normalized duplicate collapses to two unique addresses.
    expect(mockPrisma.eventInvitation.upsert).toHaveBeenCalledTimes(2);
  });

  it("binds invitations to existing accounts", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "user-9", email: "member@example.com" }]);
    mockInviteEmail.mockResolvedValue(undefined);

    await sendEventInvitations({ eventId: EVENT_ID, emails: ["member@example.com"] });

    expect(mockPrisma.eventInvitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ invitedUserId: "user-9" }),
      })
    );
    expect(mockInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ isExistingUser: true }));
  });

  it("refuses invitations for canceled events", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      title: "Goalie Clinic",
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "CANCELED",
      hostOrganization: null,
      hostLeague: null,
      hostTeam: null,
    });

    const result = await sendEventInvitations({ eventId: EVENT_ID, emails: ["a@example.com"] });

    expect(result).toEqual({ success: false, error: "Canceled events cannot send invitations." });
  });

  it("requires event management rights", async () => {
    mockRequireEventManager.mockRejectedValue(
      new Error("Unauthorized: You do not have permission to manage this event")
    );

    const result = await sendEventInvitations({ eventId: EVENT_ID, emails: ["a@example.com"] });

    expect(result.success).toBe(false);
    expect(mockPrisma.eventInvitation.upsert).not.toHaveBeenCalled();
  });
});
