import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireVenueStaffRole,
  mockGetUserVenueStaffRole,
  mockSendVenueStaffInviteEmail,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireVenueStaffRole: vi.fn(),
  mockGetUserVenueStaffRole: vi.fn(),
  mockSendVenueStaffInviteEmail: vi.fn(),
  mockPrisma: {
    venueOrganization: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    venueStaff: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireVenueStaffRole: (...args: unknown[]) => mockRequireVenueStaffRole(...args),
  getUserVenueStaffRole: (...args: unknown[]) => mockGetUserVenueStaffRole(...args),
  VENUE_STAFF_ADMIN_ROLES: ["OWNER", "MANAGER"],
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({
  sendVenueStaffInviteEmail: (...args: unknown[]) => mockSendVenueStaffInviteEmail(...args),
}));

import {
  acceptVenueStaffInvite,
  declineVenueStaffInvite,
  inviteVenueStaff,
  removeStaff,
  updateStaffRole,
} from "@/lib/actions/venue-staff";

const ORG_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const INVITER_ID = "clinviterxxxxxxxxxxxxxxxxxxx";
const INVITEE_ID = "clinviteexxxxxxxxxxxxxxxxxxx";
const STAFF_ID = "clstaffxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(INVITER_ID);
  mockRequireVenueStaffRole.mockResolvedValue(INVITER_ID);
  mockGetUserVenueStaffRole.mockResolvedValue("OWNER");
  mockSendVenueStaffInviteEmail.mockResolvedValue(undefined);
  mockPrisma.venueOrganization.findFirst.mockResolvedValue({ id: ORG_ID, name: "North Rink" });
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
    if (where.id === INVITER_ID) {
      return { name: "Owner One", email: "owner@example.com" };
    }
    if (where.email === "invitee@example.com") {
      return { id: INVITEE_ID, email: "invitee@example.com" };
    }
    return null;
  });
  mockPrisma.venueStaff.findFirst.mockResolvedValue(null);
  mockPrisma.venueStaff.create.mockResolvedValue({ id: STAFF_ID });
  mockPrisma.venueStaff.update.mockResolvedValue({ id: STAFF_ID, role: "MANAGER" });
  // Transactions run against the same mock client.
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) =>
    fn(mockPrisma)
  );
});

describe("inviteVenueStaff", () => {
  it("creates an INVITED org-wide row and sends the invite email", async () => {
    const result = await inviteVenueStaff({
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "SCHEDULER",
    });

    expect(result).toEqual({ success: true, data: { staffId: STAFF_ID } });
    expect(mockPrisma.venueStaff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: ORG_ID,
          userId: INVITEE_ID,
          role: "SCHEDULER",
          status: "INVITED",
          invitedById: INVITER_ID,
        },
      })
    );
    expect(mockSendVenueStaffInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "invitee@example.com",
        organizationName: "North Rink",
        role: "SCHEDULER",
        organizationId: ORG_ID,
      })
    );
  });

  it("returns a friendly error when no account matches the email", async () => {
    const result = await inviteVenueStaff({
      organizationId: ORG_ID,
      email: "nobody@example.com",
      role: "VIEWER",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("sign up first");
    }
    expect(mockPrisma.venueStaff.create).not.toHaveBeenCalled();
    expect(mockSendVenueStaffInviteEmail).not.toHaveBeenCalled();
  });

  it("blocks a MANAGER from granting the OWNER role", async () => {
    mockGetUserVenueStaffRole.mockResolvedValue("MANAGER");

    const result = await inviteVenueStaff({
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "OWNER",
    });

    expect(result).toEqual({ success: false, error: "Only an owner can grant the owner role." });
    expect(mockPrisma.venueStaff.create).not.toHaveBeenCalled();
  });

  it("rejects when the person is already active staff", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: STAFF_ID, status: "ACTIVE" });

    const result = await inviteVenueStaff({
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "VIEWER",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueStaff.create).not.toHaveBeenCalled();
    expect(mockPrisma.venueStaff.update).not.toHaveBeenCalled();
  });

  it("reinstates a REMOVED row as a fresh invitation", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: STAFF_ID, status: "REMOVED" });
    mockPrisma.venueStaff.update.mockResolvedValue({ id: STAFF_ID });

    const result = await inviteVenueStaff({
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "MANAGER",
    });

    expect(result).toEqual({ success: true, data: { staffId: STAFF_ID } });
    expect(mockPrisma.venueStaff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STAFF_ID },
        data: expect.objectContaining({ status: "INVITED", role: "MANAGER", joinedAt: null }),
      })
    );
    expect(mockPrisma.venueStaff.create).not.toHaveBeenCalled();
  });

  it("still succeeds when the invite email fails to send", async () => {
    mockSendVenueStaffInviteEmail.mockRejectedValue(new Error("mailchimp down"));

    const result = await inviteVenueStaff({
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "VIEWER",
    });

    expect(result.success).toBe(true);
  });
});

describe("acceptVenueStaffInvite / declineVenueStaffInvite", () => {
  it("activates the viewer's own pending invitation with a joinedAt timestamp", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: STAFF_ID, organizationId: ORG_ID });

    const result = await acceptVenueStaffInvite(STAFF_ID);

    expect(result).toEqual({ success: true, data: { organizationId: ORG_ID } });
    expect(mockPrisma.venueStaff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STAFF_ID, userId: INVITER_ID, status: "INVITED" },
      })
    );
    expect(mockPrisma.venueStaff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ACTIVE", joinedAt: expect.any(Date) },
      })
    );
  });

  it("rejects accepting an invitation that isn't the viewer's pending one", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue(null);

    const result = await acceptVenueStaffInvite(STAFF_ID);

    expect(result.success).toBe(false);
    expect(mockPrisma.venueStaff.update).not.toHaveBeenCalled();
  });

  it("declines by marking the row REMOVED", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: STAFF_ID, organizationId: ORG_ID });

    const result = await declineVenueStaffInvite(STAFF_ID);

    expect(result.success).toBe(true);
    expect(mockPrisma.venueStaff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REMOVED" } })
    );
  });
});

describe("updateStaffRole", () => {
  it("refuses to demote the organization's last active owner", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({
      id: STAFF_ID,
      role: "OWNER",
      status: "ACTIVE",
    });
    mockPrisma.venueStaff.count.mockResolvedValue(0);

    const result = await updateStaffRole({ organizationId: ORG_ID, staffId: STAFF_ID, role: "MANAGER" });

    expect(result).toEqual({
      success: false,
      error: "You can't demote the organization's last owner.",
    });
    expect(mockPrisma.venueStaff.update).not.toHaveBeenCalled();
  });

  it("allows demotion when another active owner remains", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({
      id: STAFF_ID,
      role: "OWNER",
      status: "ACTIVE",
    });
    mockPrisma.venueStaff.count.mockResolvedValue(1);
    mockPrisma.venueStaff.update.mockResolvedValue({ id: STAFF_ID, role: "MANAGER" });

    const result = await updateStaffRole({ organizationId: ORG_ID, staffId: STAFF_ID, role: "MANAGER" });

    expect(result).toEqual({ success: true, data: { staffId: STAFF_ID, role: "MANAGER" } });
    expect(mockRequireVenueStaffRole).toHaveBeenCalledWith(ORG_ID, ["OWNER"]);
  });
});

describe("removeStaff", () => {
  it("refuses to remove the organization's last active owner", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({
      id: STAFF_ID,
      role: "OWNER",
      status: "ACTIVE",
    });
    mockPrisma.venueStaff.count.mockResolvedValue(0);

    const result = await removeStaff({ organizationId: ORG_ID, staffId: STAFF_ID });

    expect(result).toEqual({
      success: false,
      error: "You can't remove the organization's last owner.",
    });
    expect(mockPrisma.venueStaff.update).not.toHaveBeenCalled();
  });

  it("revokes a pending invitation without the owner-count guard", async () => {
    mockPrisma.venueStaff.findFirst.mockResolvedValue({
      id: STAFF_ID,
      role: "OWNER",
      status: "INVITED",
    });
    mockPrisma.venueStaff.update.mockResolvedValue({ id: STAFF_ID });

    const result = await removeStaff({ organizationId: ORG_ID, staffId: STAFF_ID });

    expect(result).toEqual({ success: true, data: { staffId: STAFF_ID } });
    expect(mockPrisma.venueStaff.count).not.toHaveBeenCalled();
    expect(mockPrisma.venueStaff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REMOVED" } })
    );
  });
});
