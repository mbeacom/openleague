"use server";

import { z } from "zod";
import { Prisma, type TeamOfficial } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireTeamMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
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
