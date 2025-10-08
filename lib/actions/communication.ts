"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendLeagueMessageSchema, getLeagueMessagesSchema, type SendLeagueMessageInput, type GetLeagueMessagesInput } from "@/lib/utils/validation";
import { notificationService } from "@/lib/services/notification";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

/**
 * Send a targeted message to league members
 */
export async function sendLeagueMessage(
  input: SendLeagueMessageInput
): Promise<ActionResult<{ messageId: string; recipientCount: number }>> {
  try {
    // Validate input
    const validated = sendLeagueMessageSchema.parse(input);

    // Check authentication
    const userId = await requireUserId();

    // Verify user has permission to send messages in this league
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId: validated.leagueId,
        role: { in: ["LEAGUE_ADMIN", "TEAM_ADMIN"] },
      },
      include: {
        league: {
          select: { name: true },
        },
      },
    });

    if (!leagueUser) {
      return {
        success: false,
        error: "Unauthorized: Only league or team admins can send messages",
      };
    }

    // Get sender information
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!sender) {
      return {
        success: false,
        error: "Sender not found",
      };
    }

    // Get recipients based on targeting
    const recipients = await getMessageRecipients(validated.leagueId, validated.targeting);

    if (recipients.length === 0) {
      return {
        success: false,
        error: "No recipients found for the specified targeting criteria",
      };
    }

    // Create message record
    const message = await prisma.leagueMessage.create({
      data: {
        subject: validated.subject,
        content: validated.content,
        messageType: validated.messageType,
        priority: validated.priority,
        leagueId: validated.leagueId,
        senderId: userId,
      },
    });

    // Create targeting records
    const targetingData = [];
    if (validated.targeting.entireLeague) {
      targetingData.push({
        messageId: message.id,
        entireLeague: true,
      });
    }
    if (validated.targeting.divisionIds?.length) {
      for (const divisionId of validated.targeting.divisionIds) {
        targetingData.push({
          messageId: message.id,
          entireLeague: false,
          divisionId,
        });
      }
    }
    if (validated.targeting.teamIds?.length) {
      for (const teamId of validated.targeting.teamIds) {
        targetingData.push({
          messageId: message.id,
          entireLeague: false,
          teamId,
        });
      }
    }

    await prisma.messageTargeting.createMany({
      data: targetingData,
    });

    // Create recipient records
    await prisma.messageRecipient.createMany({
      data: recipients.map((recipient) => ({
        messageId: message.id,
        userId: recipient.id,
        deliveryStatus: "PENDING",
      })),
    });

    // Send notifications using the notification service
    try {
      const notificationType = validated.messageType === "ANNOUNCEMENT" ? "leagueAnnouncements" : "leagueMessages";

      // Send to each recipient individually to respect their preferences
      for (const recipient of recipients) {
        try {
          await notificationService.sendOrBatchNotification(
            recipient.id,
            validated.subject,
            validated.content,
            validated.priority,
            notificationType,
            validated.leagueId,
            message.id
          );
        } catch (error) {
          console.error(`Failed to send notification to user ${recipient.id}:`, error);

          // Update individual recipient status to failed
          await prisma.messageRecipient.updateMany({
            where: {
              messageId: message.id,
              userId: recipient.id,
            },
            data: { deliveryStatus: "FAILED" },
          });
        }
      }

      // Update delivery status to sent for successful recipients
      await prisma.messageRecipient.updateMany({
        where: {
          messageId: message.id,
          deliveryStatus: "PENDING",
        },
        data: { deliveryStatus: "SENT" },
      });
    } catch (error) {
      console.error("Failed to send league message notifications:", error);

      // Update delivery status to failed for all recipients
      await prisma.messageRecipient.updateMany({
        where: { messageId: message.id },
        data: { deliveryStatus: "FAILED" },
      });

      // Don't fail the entire operation if notifications fail
    }

    revalidatePath(`/league/${validated.leagueId}/messages`);

    return {
      success: true,
      data: {
        messageId: message.id,
        recipientCount: recipients.length,
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

    console.error("Error sending league message:", error);
    return {
      success: false,
      error: "Failed to send message. Please try again.",
    };
  }
}

/**
 * Get league messages with pagination and filtering
 */
export async function getLeagueMessages(
  input: GetLeagueMessagesInput
): Promise<ActionResult<{
  messages: Array<{
    id: string;
    subject: string;
    content: string;
    messageType: string;
    priority: string;
    createdAt: Date;
    sender: {
      name: string | null;
      email: string;
    };
    recipientCount: number;
    targeting: Array<{
      entireLeague: boolean;
      division?: { name: string } | null;
      team?: { name: string } | null;
    }>;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}>> {
  try {
    // Validate input
    const validated = getLeagueMessagesSchema.parse(input);

    // Check authentication
    const userId = await requireUserId();

    // Verify user has access to this league
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId: validated.leagueId,
      },
    });

    if (!leagueUser) {
      return {
        success: false,
        error: "Unauthorized: You don't have access to this league",
      };
    }

    // Build where clause for filtering
    const whereClause: {
      leagueId: string;
      messageType?: "MESSAGE" | "ANNOUNCEMENT";
      priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    } = {
      leagueId: validated.leagueId,
    };

    if (validated.messageType) {
      whereClause.messageType = validated.messageType;
    }

    if (validated.priority) {
      whereClause.priority = validated.priority;
    }

    // Get total count for pagination
    const total = await prisma.leagueMessage.count({
      where: whereClause,
    });

    // Calculate pagination
    const totalPages = Math.ceil(total / validated.limit);
    const skip = (validated.page - 1) * validated.limit;

    // Get messages
    const messages = await prisma.leagueMessage.findMany({
      where: whereClause,
      include: {
        sender: {
          select: {
            name: true,
            email: true,
          },
        },
        targeting: {
          include: {
            division: {
              select: { name: true },
            },
            team: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: {
            recipients: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: validated.limit,
    });

    return {
      success: true,
      data: {
        messages: messages.map((message) => ({
          id: message.id,
          subject: message.subject,
          content: message.content,
          messageType: message.messageType,
          priority: message.priority,
          createdAt: message.createdAt,
          sender: {
            name: message.sender.name,
            email: message.sender.email,
          },
          recipientCount: message._count.recipients,
          targeting: message.targeting.map((target) => ({
            entireLeague: target.entireLeague,
            division: target.division,
            team: target.team,
          })),
        })),
        pagination: {
          page: validated.page,
          limit: validated.limit,
          total,
          totalPages,
        },
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

    console.error("Error getting league messages:", error);
    return {
      success: false,
      error: "Failed to get messages. Please try again.",
    };
  }
}

/**
 * Helper function to get message recipients based on targeting criteria
 */
async function getMessageRecipients(
  leagueId: string,
  targeting: {
    entireLeague: boolean;
    divisionIds?: string[];
    teamIds?: string[];
  }
): Promise<Array<{ id: string; email: string; name: string | null }>> {
  // Build Prisma where clause based on targeting criteria
  // - Empty object {} is used as initial value before conditions are applied
  // - leagueUsers filter is used when targeting entire league
  // - OR array with teamMembers filters is used for division/team targeting
  let whereClause:
    | { leagueUsers: { some: { leagueId: string } } }
    | { OR: Array<{ teamMembers: { some: { team: { divisionId?: { in: string[] }; id?: { in: string[] }; leagueId: string } } } }> }
    | Record<string, never> = {};

  if (targeting.entireLeague) {
    // All league members
    whereClause = {
      leagueUsers: {
        some: { leagueId },
      },
    };
  } else {
    // Build OR conditions for divisions and teams
    const orConditions: Array<{
      teamMembers: {
        some: {
          team: {
            divisionId?: { in: string[] };
            id?: { in: string[] };
            leagueId: string;
          };
        };
      };
    }> = [];

    if (targeting.divisionIds?.length) {
      orConditions.push({
        teamMembers: {
          some: {
            team: {
              divisionId: { in: targeting.divisionIds },
              leagueId,
            },
          },
        },
      });
    }

    if (targeting.teamIds?.length) {
      orConditions.push({
        teamMembers: {
          some: {
            team: {
              id: { in: targeting.teamIds },
              leagueId,
            },
          },
        },
      });
    }

    if (orConditions.length > 0) {
      whereClause = {
        OR: orConditions,
      };
    }
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      email: true,
      name: true,
    },
    distinct: ["id"], // Ensure no duplicates
  });

  return users;
}