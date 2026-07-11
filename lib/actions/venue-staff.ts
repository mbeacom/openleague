"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { Prisma, type VenueStaffRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  getUserVenueStaffRole,
  requireUserId,
  requireVenueStaffRole,
  VENUE_STAFF_ADMIN_ROLES,
} from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  sendVenueStaffInviteEmail,
  sendVenueStaffSignupInviteEmail,
} from "@/lib/email/templates";
import { rethrowIfNextRedirectError } from "@/lib/utils/next-errors";

// Schemas are local to this module: lib/utils/validation.ts is owned by a
// concurrent workstream this tier.
const venueStaffRoleSchema = z.enum([
  "OWNER",
  "MANAGER",
  "SCHEDULER",
  "CONTENT_EDITOR",
  "REQUEST_MANAGER",
  "VIEWER",
]);

const inviteVenueStaffSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"),
  role: venueStaffRoleSchema,
});

const staffIdSchema = z.string().cuid("Invalid staff ID format");

const updateStaffRoleSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  staffId: staffIdSchema,
  role: venueStaffRoleSchema,
});

const removeStaffSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  staffId: staffIdSchema,
});

export type InviteVenueStaffInput = z.infer<typeof inviteVenueStaffSchema>;
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleSchema>;
export type RemoveStaffInput = z.infer<typeof removeStaffSchema>;

/** Domain failures whose messages are safe to surface to the UI. */
class VenueStaffActionError extends Error {}

function revalidateStaffPaths(organizationId: string) {
  revalidatePath("/venue-admin");
  revalidatePath(`/venue-admin/${organizationId}/staff`);
}

/**
 * Invite someone to an organization's staff (org-wide row, venueId null).
 * OWNER/MANAGER may invite; only an OWNER can grant OWNER.
 *
 * Existing OpenLeague users get an INVITED VenueStaff row they accept in-app.
 * Emails without an account get a unified Invitation (organization target,
 * venueRole payload); the ACTIVE VenueStaff row is created when they sign up
 * through the invitation link. `staffId` is null on that account-less path.
 */
export async function inviteVenueStaff(
  input: InviteVenueStaffInput
): Promise<ActionResult<{ staffId: string | null }>> {
  try {
    const validated = inviteVenueStaffSchema.parse(input);
    const inviterId = await requireVenueStaffRole(validated.organizationId, VENUE_STAFF_ADMIN_ROLES);

    if (validated.role === "OWNER") {
      const inviterRole = await getUserVenueStaffRole(inviterId, validated.organizationId);
      if (inviterRole !== "OWNER") {
        return { success: false, error: "Only an owner can grant the owner role." };
      }
    }

    const [organization, inviter, invitee] = await Promise.all([
      prisma.venueOrganization.findFirst({
        where: { id: validated.organizationId, status: { in: ["DRAFT", "ACTIVE"] } },
        select: { id: true, name: true },
      }),
      prisma.user.findUnique({
        where: { id: inviterId },
        select: { name: true, email: true },
      }),
      prisma.user.findUnique({
        where: { email: validated.email },
        select: { id: true, email: true },
      }),
    ]);

    if (!organization) {
      return { success: false, error: "Venue organization not found" };
    }

    if (!invitee) {
      // Account-less invite: create a unified Invitation row carrying the
      // venueRole payload; the VenueStaff row is created at signup acceptance.
      const pendingInvitation = await prisma.invitation.findFirst({
        where: {
          email: validated.email,
          organizationId: validated.organizationId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      if (pendingInvitation) {
        return { success: false, error: "That person already has a pending invitation." };
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.invitation.create({
        data: {
          email: validated.email,
          token,
          status: "PENDING",
          expiresAt,
          organizationId: validated.organizationId,
          venueRole: validated.role,
          invitedById: inviterId,
        },
      });

      try {
        await sendVenueStaffSignupInviteEmail({
          email: validated.email,
          organizationName: organization.name,
          inviterName: inviter?.name || inviter?.email || "A venue administrator",
          role: validated.role,
          token,
        });
      } catch (emailError) {
        console.error("Failed to send venue staff signup invite email:", emailError);
      }

      revalidateStaffPaths(validated.organizationId);
      return { success: true, data: { staffId: null } };
    }

    // Org-wide staff rows use a null venueId; Postgres treats NULLs as
    // distinct in the composite unique, so check for an existing row manually.
    const existing = await prisma.venueStaff.findFirst({
      where: {
        organizationId: validated.organizationId,
        userId: invitee.id,
        venueId: null,
      },
      select: { id: true, status: true },
    });

    if (existing?.status === "ACTIVE") {
      return { success: false, error: "That person is already a staff member of this organization." };
    }
    if (existing?.status === "INVITED") {
      return { success: false, error: "That person already has a pending invitation." };
    }

    // A REMOVED row is reinstated as a fresh invitation.
    const staff = existing
      ? await prisma.venueStaff.update({
          where: { id: existing.id },
          data: {
            role: validated.role,
            status: "INVITED",
            joinedAt: null,
            invitedById: inviterId,
          },
          select: { id: true },
        })
      : await prisma.venueStaff.create({
          data: {
            organizationId: validated.organizationId,
            userId: invitee.id,
            role: validated.role,
            status: "INVITED",
            invitedById: inviterId,
          },
          select: { id: true },
        });

    try {
      await sendVenueStaffInviteEmail({
        email: invitee.email,
        organizationName: organization.name,
        inviterName: inviter?.name || inviter?.email || "A venue administrator",
        role: validated.role,
        organizationId: organization.id,
      });
    } catch (emailError) {
      console.error("Failed to send venue staff invite email:", emailError);
    }

    revalidateStaffPaths(validated.organizationId);
    return { success: true, data: { staffId: staff.id } };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    return { success: false, error: "Failed to invite staff member. Please try again." };
  }
}

/**
 * Accept your own pending staff invitation (INVITED -> ACTIVE + joinedAt).
 */
export async function acceptVenueStaffInvite(
  staffId: string
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const validated = staffIdSchema.parse(staffId);
    const userId = await requireUserId();

    const staff = await prisma.venueStaff.findFirst({
      where: { id: validated, userId, status: "INVITED" },
      select: { id: true, organizationId: true },
    });

    if (!staff) {
      return { success: false, error: "Invitation not found or no longer pending." };
    }

    await prisma.venueStaff.update({
      where: { id: staff.id },
      data: { status: "ACTIVE", joinedAt: new Date() },
    });

    revalidateStaffPaths(staff.organizationId);
    return { success: true, data: { organizationId: staff.organizationId } };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    return { success: false, error: "Failed to accept the invitation. Please try again." };
  }
}

/**
 * Decline your own pending staff invitation (INVITED -> REMOVED).
 */
export async function declineVenueStaffInvite(
  staffId: string
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const validated = staffIdSchema.parse(staffId);
    const userId = await requireUserId();

    const staff = await prisma.venueStaff.findFirst({
      where: { id: validated, userId, status: "INVITED" },
      select: { id: true, organizationId: true },
    });

    if (!staff) {
      return { success: false, error: "Invitation not found or no longer pending." };
    }

    await prisma.venueStaff.update({
      where: { id: staff.id },
      data: { status: "REMOVED" },
    });

    revalidateStaffPaths(staff.organizationId);
    return { success: true, data: { organizationId: staff.organizationId } };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    return { success: false, error: "Failed to decline the invitation. Please try again." };
  }
}

/**
 * Change a staff member's role. Owner-only; the organization must always keep
 * at least one ACTIVE owner, enforced inside a transaction.
 */
export async function updateStaffRole(
  input: UpdateStaffRoleInput
): Promise<ActionResult<{ staffId: string; role: VenueStaffRole }>> {
  try {
    const validated = updateStaffRoleSchema.parse(input);
    await requireVenueStaffRole(validated.organizationId, ["OWNER"]);

    const updated = await prisma.$transaction(async (tx) => {
      const target = await tx.venueStaff.findFirst({
        where: { id: validated.staffId, organizationId: validated.organizationId },
        select: { id: true, role: true, status: true },
      });

      if (!target || target.status === "REMOVED") {
        throw new VenueStaffActionError("Staff member not found.");
      }

      const demotesActiveOwner =
        target.role === "OWNER" && target.status === "ACTIVE" && validated.role !== "OWNER";
      if (demotesActiveOwner) {
        const otherActiveOwners = await tx.venueStaff.count({
          where: {
            organizationId: validated.organizationId,
            role: "OWNER",
            status: "ACTIVE",
            id: { not: target.id },
          },
        });
        if (otherActiveOwners === 0) {
          throw new VenueStaffActionError("You can't demote the organization's last owner.");
        }
      }

      return tx.venueStaff.update({
        where: { id: target.id },
        data: { role: validated.role },
        select: { id: true, role: true },
      });
    });

    revalidateStaffPaths(validated.organizationId);
    return { success: true, data: { staffId: updated.id, role: updated.role } };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    if (error instanceof VenueStaffActionError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update staff role. Please try again." };
  }
}

/**
 * Remove a staff member or revoke a pending invitation (-> REMOVED).
 * Owner-only; the last ACTIVE owner cannot be removed.
 */
export async function removeStaff(
  input: RemoveStaffInput
): Promise<ActionResult<{ staffId: string }>> {
  try {
    const validated = removeStaffSchema.parse(input);
    await requireVenueStaffRole(validated.organizationId, ["OWNER"]);

    const removed = await prisma.$transaction(async (tx) => {
      const target = await tx.venueStaff.findFirst({
        where: { id: validated.staffId, organizationId: validated.organizationId },
        select: { id: true, role: true, status: true },
      });

      if (!target || target.status === "REMOVED") {
        throw new VenueStaffActionError("Staff member not found.");
      }

      if (target.role === "OWNER" && target.status === "ACTIVE") {
        const otherActiveOwners = await tx.venueStaff.count({
          where: {
            organizationId: validated.organizationId,
            role: "OWNER",
            status: "ACTIVE",
            id: { not: target.id },
          },
        });
        if (otherActiveOwners === 0) {
          throw new VenueStaffActionError("You can't remove the organization's last owner.");
        }
      }

      return tx.venueStaff.update({
        where: { id: target.id },
        data: { status: "REMOVED" },
        select: { id: true },
      });
    });

    revalidateStaffPaths(validated.organizationId);
    return { success: true, data: { staffId: removed.id } };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    if (error instanceof VenueStaffActionError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to remove staff member. Please try again." };
  }
}

/**
 * The viewer's pending staff invitations, for surfacing accept/decline on the
 * venue-admin dashboard. Read helper (plain data, not ActionResult), matching
 * getVenueAdminDashboard.
 */
export async function getMyPendingVenueStaffInvites() {
  const userId = await requireUserId();

  try {
    return await prisma.venueStaff.findMany({
      where: {
        userId,
        status: "INVITED",
        organization: { status: { in: ["DRAFT", "ACTIVE"] } },
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
        invitedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    // Mirror getVenueAdminDashboard: tolerate a database that predates the
    // venue management migration.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      console.warn("Venue staff invitations unavailable until venue management migration is applied", {
        code: error.code,
      });
      return [];
    }
    throw error;
  }
}
