"use server";

import { hash } from "bcryptjs";
import type { Invitation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ensureLeagueUser } from "@/lib/actions/league";
import { issueVerificationToken } from "@/lib/auth/tokens";
import { sendVerificationEmail } from "@/lib/email/templates";
import { signupSchema, type SignupInput } from "@/lib/utils/validation";
import { ZodError } from "zod";

export interface SignupWithInvitationInput extends SignupInput {
  invitationToken?: string;
}

export async function signup(data: SignupWithInvitationInput) {
  try {
    // Validate input
    const validated = signupSchema.parse(data);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return { error: "An account with this email already exists" };
    }

    // Hash password with bcrypt (cost factor 12)
    const passwordHash = await hash(validated.password, 12);

    // A valid invitation sent to this exact address already proves inbox
    // ownership (the signup link arrived in that inbox), so those accounts
    // start verified. Everyone else must click an emailed verification link.
    const invitation = data.invitationToken
      ? await prisma.invitation.findUnique({ where: { token: data.invitationToken } })
      : null;
    const invitationValid =
      invitation !== null && invitation.status === "PENDING" && invitation.expiresAt > new Date();
    const verifiedByInvitation =
      invitationValid && invitation.email.toLowerCase() === validated.email;

    const user = await prisma.user.create({
      data: {
        email: validated.email,
        passwordHash,
        name: validated.name,
        emailVerified: verifiedByInvitation ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
      },
    });

    if (invitationValid && invitation) {
      try {
        // Use transaction to ensure atomicity. The unified Invitation model
        // targets exactly one of team / league / venue organization.
        await prisma.$transaction(async (tx) => {
          await acceptInvitationMemberships(tx, invitation, {
            id: user.id,
            name: user.name,
          });

          // Update invitation status to ACCEPTED
          await tx.invitation.update({
            where: { id: invitation.id },
            data: { status: "ACCEPTED" },
          });
        });
      } catch (inviteError) {
        console.error("Error processing invitation during signup:", inviteError);
        // Don't fail signup if invitation processing fails
      }
    }

    if (!user.emailVerified) {
      try {
        const issued = await issueVerificationToken(user.id, "EMAIL_VERIFICATION");
        if ("raw" in issued) {
          await sendVerificationEmail({ email: user.email, name: user.name, token: issued.raw });
        }
      } catch (emailError) {
        // Signup still succeeds — the login page offers a resend.
        console.error("Error sending verification email during signup:", emailError);
      }
    }

    // Return a clean, serializable success response
    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified !== null,
      }
    };
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return {
        error: "Invalid input",
        details: error.issues.map(issue => ({
          path: issue.path,
          message: issue.message,
        }))
      };
    }

    // Log the full error for debugging
    console.error("Signup error:", error);

    // Return a clean, serializable error response
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during signup";
    return { error: errorMessage };
  }
}

/**
 * Create the membership rows an accepted invitation grants, inside the
 * caller's transaction. The unified Invitation model targets exactly one of:
 * - team: TeamMember MEMBER + link unclaimed Player/TeamOfficial rows;
 *   creates-or-links a TeamOfficial when the invite carries an officialRole;
 *   syncs the LeagueUser row for league-linked teams.
 * - league: LeagueUser MEMBER row.
 * - venue organization: ACTIVE VenueStaff row with the invited venueRole.
 */
async function acceptInvitationMemberships(
  tx: Prisma.TransactionClient,
  invitation: Invitation,
  user: { id: string; name: string | null }
): Promise<void> {
  if (invitation.teamId) {
    // Add user to team as MEMBER
    await tx.teamMember.create({
      data: {
        userId: user.id,
        teamId: invitation.teamId,
        role: "MEMBER",
      },
    });

    // Link unclaimed roster entries matching the invitation email to the new account
    await tx.player.updateMany({
      where: {
        teamId: invitation.teamId,
        email: { equals: invitation.email, mode: "insensitive" },
        userId: null,
      },
      data: { userId: user.id },
    });

    // Link unclaimed team official entries the same way
    await tx.teamOfficial.updateMany({
      where: {
        teamId: invitation.teamId,
        email: { equals: invitation.email, mode: "insensitive" },
        userId: null,
      },
      data: { userId: user.id },
    });

    if (invitation.officialRole) {
      // Official invite: activate the pending TeamOfficial entry for this
      // role, or create one if it no longer exists.
      const official = await tx.teamOfficial.findFirst({
        where: {
          teamId: invitation.teamId,
          email: { equals: invitation.email, mode: "insensitive" },
          role: invitation.officialRole,
        },
        select: { id: true },
      });

      if (official) {
        await tx.teamOfficial.update({
          where: { id: official.id },
          data: { userId: user.id, status: "ACTIVE" },
        });
      } else {
        await tx.teamOfficial.create({
          data: {
            teamId: invitation.teamId,
            name: user.name || invitation.email,
            email: invitation.email.toLowerCase(),
            role: invitation.officialRole,
            status: "ACTIVE",
            userId: user.id,
          },
        });
      }
    }

    // League-identity sync: members of league-linked teams get an explicit
    // LeagueUser row.
    const team = await tx.team.findUnique({
      where: { id: invitation.teamId },
      select: { leagueId: true },
    });
    if (team?.leagueId) {
      await ensureLeagueUser(tx, user.id, team.leagueId, "MEMBER");
    }
  } else if (invitation.leagueId) {
    await ensureLeagueUser(tx, user.id, invitation.leagueId, "MEMBER");
  } else if (invitation.organizationId) {
    // Org-wide staff rows use a null venueId; Postgres treats NULLs as
    // distinct in the composite unique, so look up any existing row manually.
    const existing = await tx.venueStaff.findFirst({
      where: {
        organizationId: invitation.organizationId,
        userId: user.id,
        venueId: null,
      },
      select: { id: true },
    });

    if (existing) {
      await tx.venueStaff.update({
        where: { id: existing.id },
        data: {
          role: invitation.venueRole ?? "VIEWER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
    } else {
      await tx.venueStaff.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.venueRole ?? "VIEWER",
          status: "ACTIVE",
          joinedAt: new Date(),
          invitedById: invitation.invitedById,
        },
      });
    }
  }
}
