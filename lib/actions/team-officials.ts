"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { Prisma, type TeamOfficial } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireTeamMember } from "@/lib/auth/session";
import { ensureLeagueUser } from "@/lib/actions/league";
import { revalidatePath } from "next/cache";
import {
  sendExistingUserNotification,
  sendTeamOfficialInviteEmail,
} from "@/lib/email/templates";
import {
  createTeamOfficialSchema,
  updateTeamOfficialSchema,
  removeTeamOfficialSchema,
  type CreateTeamOfficialInput,
  type UpdateTeamOfficialInput,
  type RemoveTeamOfficialInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// Local schema: lib/utils/validation.ts is owned by a concurrent workstream
// this tier. Mirrors teamOfficialBaseSchema's constraints.
const inviteTeamOfficialSchema = z
  .object({
    teamId: z.string().cuid("Invalid team ID format"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email address")
      .max(254, "Email must be less than 254 characters"),
    name: z.string().trim().min(1, "Name is required").max(100),
    role: z.enum([
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "MANAGER",
      "TREASURER",
      "VOLUNTEER_COORDINATOR",
      "PARENT_VOLUNTEER",
      "OTHER",
    ]),
    roleDetail: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.role !== "OTHER" || !!data.roleDetail, {
    message: "Please describe the role when selecting Other",
    path: ["roleDetail"],
  });

export type InviteTeamOfficialInput = z.input<typeof inviteTeamOfficialSchema>;

function revalidateRosterPaths(teamId: string) {
  revalidatePath("/roster");
  revalidatePath(`/team/${teamId}`);
  revalidatePath(`/team/${teamId}/roster`);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Find the User account matching an official's email, if any.
 * User emails are stored lowercased, but match insensitively to be safe.
 */
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
}

/**
 * Add a team official (coach, manager, treasurer, volunteer, ...).
 * Only ADMIN role can add officials.
 *
 * The role is descriptive taxonomy only (decision D4). Passing
 * `grantTeamAdmin: true` additionally upserts a TeamMember ADMIN row — this
 * requires the email to match an existing User account.
 */
export async function createTeamOfficial(
  input: CreateTeamOfficialInput
): Promise<ActionResult<TeamOfficial>> {
  try {
    const validated = createTeamOfficialSchema.parse(input);
    await requireTeamAdmin(validated.teamId);

    const email = validated.email ? validated.email.toLowerCase() : null;
    const roleDetail = validated.roleDetail || null;
    const linkedUser = email ? await findUserByEmail(email) : null;

    if (validated.grantTeamAdmin && !linkedUser) {
      return {
        success: false,
        error:
          "Team admin access can only be granted when the email matches an existing account",
      };
    }

    const official = await prisma.$transaction(async (tx) => {
      // Soft-removed entries hold the [teamId, email, role] slot — reactivate
      // instead of colliding with the unique constraint.
      const removed = email
        ? await tx.teamOfficial.findFirst({
            where: {
              teamId: validated.teamId,
              email,
              role: validated.role,
              status: "REMOVED",
            },
            select: { id: true },
          })
        : null;

      const row = removed
        ? await tx.teamOfficial.update({
            where: { id: removed.id },
            data: {
              name: validated.name,
              roleDetail,
              status: "ACTIVE",
              userId: linkedUser?.id ?? null,
            },
          })
        : await tx.teamOfficial.create({
            data: {
              teamId: validated.teamId,
              name: validated.name,
              email,
              role: validated.role,
              roleDetail,
              status: "ACTIVE",
              userId: linkedUser?.id ?? null,
            },
          });

      if (validated.grantTeamAdmin && linkedUser) {
        await tx.teamMember.upsert({
          where: {
            userId_teamId: { userId: linkedUser.id, teamId: validated.teamId },
          },
          update: { role: "ADMIN" },
          create: {
            userId: linkedUser.id,
            teamId: validated.teamId,
            role: "ADMIN",
          },
        });

        // League-identity sync: team admins of league-linked teams get an
        // explicit LeagueUser TEAM_ADMIN row.
        const team = await tx.team.findUnique({
          where: { id: validated.teamId },
          select: { leagueId: true },
        });
        if (team?.leagueId) {
          await ensureLeagueUser(tx, linkedUser.id, team.leagueId, "TEAM_ADMIN");
        }
      }

      return row;
    });

    revalidateRosterPaths(validated.teamId);

    return { success: true, data: official };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input", details: error.issues };
    }

    if (isUniqueConstraintError(error)) {
      return {
        success: false,
        error: "An official with this email and role already exists",
      };
    }

    console.error("Error adding team official:", error);
    return {
      success: false,
      error: "Failed to add official. Please try again.",
    };
  }
}

/**
 * Invite someone to join the team as an official (coach, manager, ...).
 * Only ADMIN role can invite.
 *
 * Existing OpenLeague users are linked immediately (ACTIVE entry, fast path).
 * Emails without an account get an INVITED TeamOfficial entry plus a unified
 * Invitation carrying the officialRole payload — at signup acceptance the
 * entry is linked to the new account, they join the team as MEMBER, and
 * league-linked teams also get their LeagueUser row.
 */
export async function inviteTeamOfficial(
  input: InviteTeamOfficialInput
): Promise<ActionResult<{ official: TeamOfficial; invited: boolean; addedDirectly: boolean }>> {
  try {
    const validated = inviteTeamOfficialSchema.parse(input);
    const inviterId = await requireTeamAdmin(validated.teamId);

    const [team, inviter, linkedUser] = await Promise.all([
      prisma.team.findUnique({
        where: { id: validated.teamId },
        select: { name: true },
      }),
      prisma.user.findUnique({
        where: { id: inviterId },
        select: { name: true, email: true },
      }),
      findUserByEmail(validated.email),
    ]);

    if (!team || !inviter) {
      return {
        success: false,
        error: "Internal server error: Team or inviter not found.",
      };
    }

    const roleDetail = validated.roleDetail || null;

    // The [teamId, email, role] slot may be held by a live entry (conflict)
    // or a soft-removed one (reactivate below).
    const existingOfficial = await prisma.teamOfficial.findFirst({
      where: {
        teamId: validated.teamId,
        email: { equals: validated.email, mode: "insensitive" },
        role: validated.role,
      },
      select: { id: true, status: true },
    });

    if (existingOfficial && existingOfficial.status !== "REMOVED") {
      return {
        success: false,
        error: "An official with this email and role already exists",
      };
    }

    const inviterName = inviter.name || inviter.email;

    if (linkedUser) {
      // Fast path: existing account — link the official entry immediately.
      const official = existingOfficial
        ? await prisma.teamOfficial.update({
            where: { id: existingOfficial.id },
            data: {
              name: validated.name,
              roleDetail,
              status: "ACTIVE",
              userId: linkedUser.id,
            },
          })
        : await prisma.teamOfficial.create({
            data: {
              teamId: validated.teamId,
              name: validated.name,
              email: validated.email,
              role: validated.role,
              roleDetail,
              status: "ACTIVE",
              userId: linkedUser.id,
            },
          });

      try {
        await sendExistingUserNotification({
          email: validated.email,
          teamName: team.name,
          inviterName,
        });
      } catch (emailError) {
        console.error("Failed to send official notification email:", emailError);
      }

      revalidateRosterPaths(validated.teamId);
      return {
        success: true,
        data: { official, invited: true, addedDirectly: true },
      };
    }

    // Account-less path: INVITED entry + unified Invitation with the
    // officialRole payload.
    const pendingInvitation = await prisma.invitation.findFirst({
      where: {
        email: validated.email,
        teamId: validated.teamId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (pendingInvitation) {
      return {
        success: false,
        error: "An invitation has already been sent to this email",
      };
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const official = await prisma.$transaction(async (tx) => {
      const row = existingOfficial
        ? await tx.teamOfficial.update({
            where: { id: existingOfficial.id },
            data: {
              name: validated.name,
              roleDetail,
              status: "INVITED",
              userId: null,
            },
          })
        : await tx.teamOfficial.create({
            data: {
              teamId: validated.teamId,
              name: validated.name,
              email: validated.email,
              role: validated.role,
              roleDetail,
              status: "INVITED",
            },
          });

      await tx.invitation.create({
        data: {
          email: validated.email,
          token,
          status: "PENDING",
          expiresAt,
          teamId: validated.teamId,
          officialRole: validated.role,
          invitedById: inviterId,
        },
      });

      return row;
    });

    try {
      await sendTeamOfficialInviteEmail({
        email: validated.email,
        teamName: team.name,
        inviterName,
        role: validated.role,
        token,
      });
    } catch (emailError) {
      console.error("Failed to send official invite email:", emailError);
    }

    revalidateRosterPaths(validated.teamId);
    return {
      success: true,
      data: { official, invited: true, addedDirectly: false },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input", details: error.issues };
    }

    if (isUniqueConstraintError(error)) {
      return {
        success: false,
        error: "An official with this email and role already exists",
      };
    }

    console.error("Error inviting team official:", error);
    return {
      success: false,
      error: "Failed to invite official. Please try again.",
    };
  }
}

/**
 * Update a team official's details.
 * Only ADMIN role can update officials. Changing the email re-resolves the
 * linked User account; `grantTeamAdmin: true` upserts TeamMember ADMIN.
 */
export async function updateTeamOfficial(
  input: UpdateTeamOfficialInput
): Promise<ActionResult<TeamOfficial>> {
  try {
    const validated = updateTeamOfficialSchema.parse(input);
    await requireTeamAdmin(validated.teamId);

    const existing = await prisma.teamOfficial.findUnique({
      where: { id: validated.officialId },
      select: { teamId: true, email: true, userId: true, status: true },
    });

    if (!existing || existing.teamId !== validated.teamId) {
      return { success: false, error: "Official not found" };
    }

    if (existing.status === "REMOVED") {
      return {
        success: false,
        error: "This official was removed. Add them again instead.",
      };
    }

    const email = validated.email ? validated.email.toLowerCase() : null;
    const roleDetail = validated.roleDetail || null;

    // Re-resolve the account link only when the email actually changed
    let userId = existing.userId;
    if (email !== (existing.email?.toLowerCase() ?? null)) {
      userId = email ? (await findUserByEmail(email))?.id ?? null : null;
    }

    if (validated.grantTeamAdmin && !userId) {
      return {
        success: false,
        error:
          "Team admin access can only be granted when the email matches an existing account",
      };
    }

    const official = await prisma.$transaction(async (tx) => {
      const row = await tx.teamOfficial.update({
        where: { id: validated.officialId },
        data: {
          name: validated.name,
          email,
          role: validated.role,
          roleDetail,
          userId,
        },
      });

      if (validated.grantTeamAdmin && userId) {
        await tx.teamMember.upsert({
          where: { userId_teamId: { userId, teamId: validated.teamId } },
          update: { role: "ADMIN" },
          create: { userId, teamId: validated.teamId, role: "ADMIN" },
        });

        // League-identity sync: team admins of league-linked teams get an
        // explicit LeagueUser TEAM_ADMIN row.
        const team = await tx.team.findUnique({
          where: { id: validated.teamId },
          select: { leagueId: true },
        });
        if (team?.leagueId) {
          await ensureLeagueUser(tx, userId, team.leagueId, "TEAM_ADMIN");
        }
      }

      return row;
    });

    revalidateRosterPaths(validated.teamId);

    return { success: true, data: official };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input", details: error.issues };
    }

    if (isUniqueConstraintError(error)) {
      return {
        success: false,
        error: "An official with this email and role already exists",
      };
    }

    console.error("Error updating team official:", error);
    return {
      success: false,
      error: "Failed to update official. Please try again.",
    };
  }
}

/**
 * Remove a team official (soft delete — sets status to REMOVED).
 * Only ADMIN role can remove officials. Does not touch TeamMember rows;
 * revoking team admin access is a separate, explicit operation.
 */
export async function removeTeamOfficial(
  input: RemoveTeamOfficialInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = removeTeamOfficialSchema.parse(input);
    await requireTeamAdmin(validated.teamId);

    const existing = await prisma.teamOfficial.findUnique({
      where: { id: validated.officialId },
      select: { teamId: true, status: true },
    });

    if (!existing || existing.teamId !== validated.teamId) {
      return { success: false, error: "Official not found" };
    }

    if (existing.status !== "REMOVED") {
      await prisma.teamOfficial.update({
        where: { id: validated.officialId },
        data: { status: "REMOVED" },
      });
    }

    revalidateRosterPaths(validated.teamId);

    return { success: true, data: { id: validated.officialId } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input", details: error.issues };
    }

    console.error("Error removing team official:", error);
    return {
      success: false,
      error: "Failed to remove official. Please try again.",
    };
  }
}

/**
 * List a team's officials (excludes soft-removed entries).
 * Any team member can read. Postgres orders the role enum by declaration,
 * so HEAD_COACH sorts first.
 */
export async function getTeamOfficials(
  teamId: string
): Promise<ActionResult<TeamOfficial[]>> {
  try {
    const validatedTeamId = z
      .string()
      .cuid("Invalid team ID format")
      .parse(teamId);
    await requireTeamMember(validatedTeamId);

    const officials = await prisma.teamOfficial.findMany({
      where: {
        teamId: validatedTeamId,
        status: { not: "REMOVED" },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return { success: true, data: officials };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input", details: error.issues };
    }

    console.error("Error loading team officials:", error);
    return {
      success: false,
      error: "Failed to load officials. Please try again.",
    };
  }
}
