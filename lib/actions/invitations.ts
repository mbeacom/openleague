"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  hasVenueStaffRole,
  requireTeamAdmin,
  requireUserId,
  VENUE_STAFF_ADMIN_ROLES,
} from "@/lib/auth/session";
import { ensureLeagueUser } from "@/lib/actions/league";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import {
  sendInvitationEmail,
  sendExistingUserNotification,
  sendLeagueInvitationEmail,
  sendLeagueMemberAddedNotification,
  sendVenueStaffSignupInviteEmail,
} from "@/lib/email/templates";
import { sendInvitationSchema, sendLeagueInvitationSchema, type SendInvitationInput, type SendLeagueInvitationInput } from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// Local schema: lib/utils/validation.ts is owned by a concurrent workstream
// this tier.
const sendLeagueMemberInvitationSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(254, "Email must be less than 254 characters"),
  role: z.enum(["LEAGUE_ADMIN", "TEAM_ADMIN", "MEMBER"]).default("MEMBER"),
});

export type SendLeagueMemberInvitationInput = z.input<typeof sendLeagueMemberInvitationSchema>;

/**
 * Generate a cryptographically secure random token
 */
function generateInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Send an invitation to join a team
 * If the email already has an account, add them directly to the team
 * Otherwise, create an invitation record and send email
 */
export async function sendInvitation(
  input: SendInvitationInput
): Promise<ActionResult<{ invited: boolean; addedDirectly: boolean }>> {
  try {
    // Validate input
    const validated = sendInvitationSchema.parse(input);

    // Check authentication and authorization - only ADMIN can send invitations
    const userId = await requireTeamAdmin(validated.teamId);

    // Fetch team and inviter information once (used in both flows)
    const [team, inviter] = await Promise.all([
      prisma.team.findUnique({
        where: { id: validated.teamId },
        select: { name: true, leagueId: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
    ]);

    if (!team || !inviter) {
      return {
        success: false,
        error: "Internal server error: Team or inviter not found.",
      };
    }

    // Check if email already has an account
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      // Check if user is already a member of the team
      const existingMember = await prisma.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: existingUser.id,
            teamId: validated.teamId,
          },
        },
      });

      if (existingMember) {
        return {
          success: false,
          error: "User is already a member of this team",
        };
      }

      // Add user directly to team as MEMBER
      await prisma.$transaction(async (tx) => {
        await tx.teamMember.create({
          data: {
            userId: existingUser.id,
            teamId: validated.teamId,
            role: "MEMBER",
          },
        });

        // Link unclaimed roster entries matching the invited email to the account
        await tx.player.updateMany({
          where: {
            teamId: validated.teamId,
            email: { equals: validated.email, mode: "insensitive" },
            userId: null,
          },
          data: { userId: existingUser.id },
        });

        // Link unclaimed team official entries the same way
        await tx.teamOfficial.updateMany({
          where: {
            teamId: validated.teamId,
            email: { equals: validated.email, mode: "insensitive" },
            userId: null,
          },
          data: { userId: existingUser.id },
        });

        // League-identity sync: members of league-linked teams get an
        // explicit LeagueUser row.
        if (team.leagueId) {
          await ensureLeagueUser(tx, existingUser.id, team.leagueId, "MEMBER");
        }
      });

      // Send notification email to existing user
      try {
        await sendExistingUserNotification({
          email: validated.email,
          teamName: team.name,
          inviterName: inviter.name || inviter.email,
        });
      } catch (error) {
        console.error("Failed to send notification email:", error);
        // Don't fail the entire operation if email fails
      }

      revalidatePath("/roster");

      return {
        success: true,
        data: {
          invited: true,
          addedDirectly: true,
        },
      };
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email: validated.email,
        teamId: validated.teamId,
        status: "PENDING",
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
    });

    if (existingInvitation) {
      return {
        success: false,
        error: "An invitation has already been sent to this email",
      };
    }

    // Generate unique token
    const token = generateInvitationToken();

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation record
    await prisma.invitation.create({
      data: {
        email: validated.email,
        token,
        status: "PENDING",
        expiresAt,
        teamId: validated.teamId,
        invitedById: userId,
      },
    });

    // Send invitation email
    try {
      await sendInvitationEmail({
        email: validated.email,
        teamName: team.name,
        inviterName: inviter.name || inviter.email,
        token,
      });
    } catch (error) {
      console.error("Failed to send invitation email:", error);
      // Don't fail the entire operation if email fails
    }

    revalidatePath("/roster");

    return {
      success: true,
      data: {
        invited: true,
        addedDirectly: false,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error sending invitation:", error);
    return {
      success: false,
      error: "Failed to send invitation. Please try again.",
    };
  }
}

/**
 * Send an invitation to join a specific team within a league
 * Only league admins can use this function to invite to any team
 */
export async function sendLeagueInvitation(
  input: SendLeagueInvitationInput
): Promise<ActionResult<{ invited: boolean; addedDirectly: boolean }>> {
  try {
    // Validate input
    const validated = sendLeagueInvitationSchema.parse(input);

    // Check if user is league admin
    const userId = await requireUserId();
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId: validated.leagueId,
        role: "LEAGUE_ADMIN",
      },
    });

    if (!leagueUser) {
      return {
        success: false,
        error: "Unauthorized: Only league admins can send invitations to any team",
      };
    }

    // Verify team belongs to the league
    const team = await prisma.team.findFirst({
      where: {
        id: validated.teamId,
        leagueId: validated.leagueId,
        isActive: true,
      },
      select: { name: true },
    });

    if (!team) {
      return {
        success: false,
        error: "Team not found or does not belong to this league",
      };
    }

    // Get inviter information
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!inviter) {
      return {
        success: false,
        error: "Internal server error: Inviter not found.",
      };
    }

    // Check if email already has an account
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      // Check if user is already a member of the team
      const existingMember = await prisma.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: existingUser.id,
            teamId: validated.teamId,
          },
        },
      });

      if (existingMember) {
        return {
          success: false,
          error: "User is already a member of this team",
        };
      }

      // Add user directly to team as MEMBER and to league if not already
      await prisma.$transaction(async (tx) => {
        // Add to team
        await tx.teamMember.create({
          data: {
            userId: existingUser.id,
            teamId: validated.teamId,
            role: "MEMBER",
          },
        });

        // Link unclaimed roster entries matching the invited email to the account
        await tx.player.updateMany({
          where: {
            teamId: validated.teamId,
            email: { equals: validated.email, mode: "insensitive" },
            userId: null,
          },
          data: { userId: existingUser.id },
        });

        // Link unclaimed team official entries the same way
        await tx.teamOfficial.updateMany({
          where: {
            teamId: validated.teamId,
            email: { equals: validated.email, mode: "insensitive" },
            userId: null,
          },
          data: { userId: existingUser.id },
        });

        // League-identity sync: add to league if not already a member
        await ensureLeagueUser(tx, existingUser.id, validated.leagueId, "MEMBER");
      });

      // Send notification email to existing user
      try {
        await sendExistingUserNotification({
          email: validated.email,
          teamName: team.name,
          inviterName: inviter.name || inviter.email,
        });
      } catch (error) {
        console.error("Failed to send notification email:", error);
        // Don't fail the entire operation if email fails
      }

      revalidatePath("/roster");
      revalidatePath(`/league/${validated.leagueId}/roster`);

      return {
        success: true,
        data: {
          invited: true,
          addedDirectly: true,
        },
      };
    }

    // Check if there's already a pending invitation for this email and team
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email: validated.email,
        teamId: validated.teamId,
        status: "PENDING",
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
    });

    if (existingInvitation) {
      return {
        success: false,
        error: "An invitation has already been sent to this email for this team",
      };
    }

    // Generate unique token
    const token = generateInvitationToken();

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation record
    await prisma.invitation.create({
      data: {
        email: validated.email,
        token,
        status: "PENDING",
        expiresAt,
        teamId: validated.teamId,
        invitedById: userId,
      },
    });

    // Send invitation email
    try {
      await sendInvitationEmail({
        email: validated.email,
        teamName: team.name,
        inviterName: inviter.name || inviter.email,
        token,
      });
    } catch (error) {
      console.error("Failed to send invitation email:", error);
      // Don't fail the entire operation if email fails
    }

    revalidatePath("/roster");
    revalidatePath(`/league/${validated.leagueId}/roster`);

    return {
      success: true,
      data: {
        invited: true,
        addedDirectly: false,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error sending league invitation:", error);
    return {
      success: false,
      error: "Failed to send invitation. Please try again.",
    };
  }
}

/**
 * Invite someone to a league directly (not to a specific team).
 * Only LEAGUE_ADMINs of the league may invite.
 *
 * Existing accounts are added immediately with the requested role. Emails
 * without an account get a unified Invitation (league target) and join as
 * MEMBER at signup acceptance — elevated roles can only be granted to
 * existing accounts (the invitation carries no league-role payload).
 */
export async function sendLeagueMemberInvitation(
  input: SendLeagueMemberInvitationInput
): Promise<ActionResult<{ invited: boolean; addedDirectly: boolean }>> {
  try {
    const validated = sendLeagueMemberInvitationSchema.parse(input);

    const userId = await requireUserId();
    const requesterMembership = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId: validated.leagueId,
        role: "LEAGUE_ADMIN",
      },
    });

    if (!requesterMembership) {
      return {
        success: false,
        error: "Unauthorized: Only league admins can invite league members",
      };
    }

    const [league, inviter] = await Promise.all([
      prisma.league.findFirst({
        where: { id: validated.leagueId, isActive: true },
        select: { name: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
    ]);

    if (!league || !inviter) {
      return { success: false, error: "League not found or inactive" };
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
      select: { id: true },
    });

    if (existingUser) {
      const existingMembership = await prisma.leagueUser.findUnique({
        where: {
          userId_leagueId: {
            userId: existingUser.id,
            leagueId: validated.leagueId,
          },
        },
        select: { id: true },
      });

      if (existingMembership) {
        return {
          success: false,
          error: "User is already a member of this league",
        };
      }

      await ensureLeagueUser(prisma, existingUser.id, validated.leagueId, validated.role);

      try {
        await sendLeagueMemberAddedNotification({
          email: validated.email,
          leagueName: league.name,
          inviterName: inviter.name || inviter.email,
          role: validated.role,
        });
      } catch (error) {
        console.error("Failed to send league notification email:", error);
        // Don't fail the entire operation if email fails
      }

      revalidatePath(`/league/${validated.leagueId}`);
      revalidatePath(`/league/${validated.leagueId}/roster`);

      return { success: true, data: { invited: true, addedDirectly: true } };
    }

    // The Invitation row has no league-role payload, so account-less invites
    // can only grant the default MEMBER role at acceptance.
    if (validated.role !== "MEMBER") {
      return {
        success: false,
        error:
          "Elevated league roles can only be granted to existing accounts. Invite them as a member, or ask them to sign up first.",
      };
    }

    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email: validated.email,
        leagueId: validated.leagueId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return {
        success: false,
        error: "An invitation has already been sent to this email",
      };
    }

    const token = generateInvitationToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.invitation.create({
      data: {
        email: validated.email,
        token,
        status: "PENDING",
        expiresAt,
        leagueId: validated.leagueId,
        invitedById: userId,
      },
    });

    try {
      await sendLeagueInvitationEmail({
        email: validated.email,
        leagueName: league.name,
        inviterName: inviter.name || inviter.email,
        token,
      });
    } catch (error) {
      console.error("Failed to send league invitation email:", error);
      // Don't fail the entire operation if email fails
    }

    revalidatePath(`/league/${validated.leagueId}`);
    revalidatePath(`/league/${validated.leagueId}/roster`);

    return { success: true, data: { invited: true, addedDirectly: false } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error sending league member invitation:", error);
    return {
      success: false,
      error: "Failed to send invitation. Please try again.",
    };
  }
}

/**
 * Resend an expired invitation (team, league, or venue-organization target).
 */
export async function resendInvitation(
  invitationId: string
): Promise<ActionResult<{ invited: boolean }>> {
  try {
    // Get the invitation first to resolve its target
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        email: true,
        teamId: true,
        leagueId: true,
        organizationId: true,
        venueRole: true,
        officialRole: true,
        team: {
          select: {
            name: true,
            leagueId: true,
          },
        },
        league: {
          select: { name: true },
        },
        organization: {
          select: { name: true },
        },
      },
    });

    if (!invitation) {
      return {
        success: false,
        error: "Invitation not found",
      };
    }

    // Check authentication and authorization against the invitation's target
    const userId = await requireUserId();

    let authorized = false;
    if (invitation.teamId && invitation.team) {
      // Team target: team admin OR admin of the team's league
      const isTeamAdmin = await prisma.teamMember.findFirst({
        where: { userId, teamId: invitation.teamId, role: "ADMIN" },
      });
      authorized = !!isTeamAdmin;

      if (!authorized && invitation.team.leagueId) {
        const isLeagueAdmin = await prisma.leagueUser.findFirst({
          where: {
            userId,
            leagueId: invitation.team.leagueId,
            role: "LEAGUE_ADMIN",
          },
        });
        authorized = !!isLeagueAdmin;
      }
    } else if (invitation.leagueId) {
      // League target: league admin
      const isLeagueAdmin = await prisma.leagueUser.findFirst({
        where: {
          userId,
          leagueId: invitation.leagueId,
          role: "LEAGUE_ADMIN",
        },
      });
      authorized = !!isLeagueAdmin;
    } else if (invitation.organizationId) {
      // Venue-organization target: active OWNER/MANAGER staff
      authorized = await hasVenueStaffRole(
        userId,
        invitation.organizationId,
        VENUE_STAFF_ADMIN_ROLES
      );
    }

    if (!authorized) {
      return {
        success: false,
        error: "Unauthorized: Only admins of the invitation's target can resend it",
      };
    }

    // Generate new token and expiration
    const token = generateInvitationToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update invitation
    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        token,
        status: "PENDING",
        expiresAt,
      },
    });

    // Get inviter information for email
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    // Send invitation email matching the target
    if (inviter) {
      const inviterName = inviter.name || inviter.email;
      try {
        if (invitation.team) {
          await sendInvitationEmail({
            email: invitation.email,
            teamName: invitation.team.name,
            inviterName,
            token,
          });
        } else if (invitation.league) {
          await sendLeagueInvitationEmail({
            email: invitation.email,
            leagueName: invitation.league.name,
            inviterName,
            token,
          });
        } else if (invitation.organization) {
          await sendVenueStaffSignupInviteEmail({
            email: invitation.email,
            organizationName: invitation.organization.name,
            inviterName,
            role: invitation.venueRole ?? "VIEWER",
            token,
          });
        }
      } catch (error) {
        console.error("Failed to send invitation email:", error);
        // Don't fail the entire operation if email fails
      }
    }

    if (invitation.teamId) {
      revalidatePath("/roster");
      if (invitation.team?.leagueId) {
        revalidatePath(`/league/${invitation.team.leagueId}/roster`);
      }
    } else if (invitation.leagueId) {
      revalidatePath(`/league/${invitation.leagueId}/roster`);
    } else if (invitation.organizationId) {
      revalidatePath(`/venue-admin/${invitation.organizationId}/staff`);
    }

    return {
      success: true,
      data: {
        invited: true,
      },
    };
  } catch (error) {
    console.error("Error resending invitation:", error);
    return {
      success: false,
      error: "Failed to resend invitation. Please try again.",
    };
  }
}
