import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireSignupEventHostAdmin, mockRequireEventManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireSignupEventHostAdmin: vi.fn(),
  mockRequireEventManager: vi.fn(),
  mockPrisma: {
    signupEvent: { findUnique: vi.fn() },
    eventManager: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    user: { findFirst: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSignupEventHostAdmin: (...args: unknown[]) => mockRequireSignupEventHostAdmin(...args),
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import { addEventManager, removeEventManager } from "@/lib/actions/event-managers";

const EVENT_ID = "cldevent0000000000000001";
const MANAGER_ID = "cldmgr000000000000000001";

const hostFields = {
  hostOrganizationId: null,
  hostLeagueId: "league-1",
  hostTeamId: null,
};

describe("addEventManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.signupEvent.findUnique.mockResolvedValue(hostFields);
    mockRequireSignupEventHostAdmin.mockResolvedValue("admin-1");
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("grants management to an existing account and audit-logs it", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "user-9",
      name: "Mite Delegate",
      email: "delegate@example.com",
    });
    mockPrisma.eventManager.findUnique.mockResolvedValue(null);
    mockPrisma.eventManager.create.mockResolvedValue({ id: MANAGER_ID });

    const result = await addEventManager({ eventId: EVENT_ID, email: "Delegate@Example.com" });

    expect(result).toEqual({ success: true, data: { managerId: MANAGER_ID } });
    // Grants require HOST-ADMIN rights, not mere event management.
    expect(mockRequireSignupEventHostAdmin).toHaveBeenCalledWith({
      organizationId: null,
      leagueId: "league-1",
      teamId: null,
    });
    expect(mockPrisma.eventManager.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { eventId: EVENT_ID, userId: "user-9", grantedById: "admin-1" },
      })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "signup_event.manager.added",
          resourceId: EVENT_ID,
          resourceType: "SignupEvent",
        }),
      })
    );
  });

  it("rejects grants from non-host-admins (event managers cannot add managers)", async () => {
    mockRequireSignupEventHostAdmin.mockRejectedValue(
      new Error("Unauthorized: You do not have permission to manage events for this host")
    );

    const result = await addEventManager({ eventId: EVENT_ID, email: "delegate@example.com" });

    expect(result.success).toBe(false);
    expect(mockPrisma.eventManager.create).not.toHaveBeenCalled();
  });

  it("requires an existing account", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await addEventManager({ eventId: EVENT_ID, email: "nobody@example.com" });

    expect(result).toEqual({
      success: false,
      error: "No account exists for that email — they need to sign up first.",
    });
  });

  it("rejects duplicate grants", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-9", name: null, email: "d@example.com" });
    mockPrisma.eventManager.findUnique.mockResolvedValue({ id: "existing" });

    const result = await addEventManager({ eventId: EVENT_ID, email: "d@example.com" });

    expect(result).toEqual({
      success: false,
      error: "That person is already a manager of this event.",
    });
  });
});

describe("removeEventManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSignupEventHostAdmin.mockResolvedValue("admin-1");
    mockPrisma.signupEvent.findUnique.mockResolvedValue(hostFields);
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("revokes the grant immediately and audit-logs it", async () => {
    mockPrisma.eventManager.findUnique.mockResolvedValue({
      id: MANAGER_ID,
      eventId: EVENT_ID,
      user: { id: "user-9", name: "Mite Delegate", email: "delegate@example.com" },
    });
    mockPrisma.eventManager.delete.mockResolvedValue({});

    const result = await removeEventManager({ managerId: MANAGER_ID });

    expect(result).toEqual({ success: true, data: { managerId: MANAGER_ID } });
    expect(mockPrisma.eventManager.delete).toHaveBeenCalledWith({ where: { id: MANAGER_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "signup_event.manager.removed" }),
      })
    );
  });

  it("rejects revocations from non-host-admins", async () => {
    mockPrisma.eventManager.findUnique.mockResolvedValue({
      id: MANAGER_ID,
      eventId: EVENT_ID,
      user: { id: "user-9", name: null, email: "d@example.com" },
    });
    mockRequireSignupEventHostAdmin.mockRejectedValue(
      new Error("Unauthorized: You do not have permission to manage events for this host")
    );

    const result = await removeEventManager({ managerId: MANAGER_ID });

    expect(result.success).toBe(false);
    expect(mockPrisma.eventManager.delete).not.toHaveBeenCalled();
  });
});
