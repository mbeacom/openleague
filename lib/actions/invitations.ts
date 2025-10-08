"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { sendInvitationEmail, sendExistingUserNotification } from "@/lib/email/templates";
import { sendInvitationSchema, sendLeagueInvitationSchema, type SendInvitationInput, type SendLeagueInvitationInput } from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };



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
        select: { name: true },
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
      await prisma.teamMember.create({
        data: {
          userId: existingUser.id,
          teamId: validated.teamId,
          role: "MEMBER",
        },
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

        // Add to league if not already a member
        const existingLeagueUser = await tx.leagueUser.findFirst({
          where: {
            userId: existingUser.id,
            leagueId: validated.leagueId,
          },
        });

        if (!existingLeagueUser) {
          await tx.leagueUser.create({
            data: {
              userId: existingUser.id,
              leagueId: validated.leagueId,
              role: "MEMBER",
            },
          });
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
 * Resend an expired invitation
 */
export async function resendInvitation(
  invitationId: string
): Promise<ActionResult<{ invited: boolean }>> {
  try {
    // Get the invitation first to get the teamId
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        email: true,
        teamId: true,
        team: {
          select: {
            name: true,
            leagueId: true,
          },
        },
      },
    });

    if (!invitation) {
      return {
        success: false,
        error: "Invitation not found",
      };
    }

    // Check authentication and authorization
    const userId = await requireUserId();

    // Check if user is team admin OR league admin
    const isTeamAdmin = await prisma.teamMember.findFirst({
      where: { userId, teamId: invitation.teamId, role: "ADMIN" },
    });

    let isLeagueAdmin = null;
    if (!isTeamAdmin && invitation.team.leagueId) {
      isLeagueAdmin = await prisma.leagueUser.findFirst({
        where: {
          userId,
          leagueId: invitation.team.leagueId,
          role: "LEAGUE_ADMIN",
        },
      });
    }

    if (!isTeamAdmin && !isLeagueAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only team or league admins can resend invitations",
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

    // Send invitation email
    if (inviter) {
      try {
        await sendInvitationEmail({
          email: invitation.email,
          teamName: invitation.team.name,
          inviterName: inviter.name || inviter.email,
          token,
        });
      } catch (error) {
        console.error("Failed to send invitation email:", error);
        // Don't fail the entire operation if email fails
      }
    }

    revalidatePath("/roster");
    if (invitation.team.leagueId) {
      revalidatePath(`/league/${invitation.team.leagueId}/roster`);
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
