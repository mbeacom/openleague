import { getMailchimpClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/date";
import { env, getBaseUrl } from "@/lib/env";
import { notificationService } from "@/lib/services/notification";

const EMAIL_FROM = env.EMAIL_FROM;
const BASE_URL = getBaseUrl();

interface InvitationEmailData {
  email: string;
  teamName: string;
  inviterName: string;
  token: string;
}

/**
 * Send an invitation email to join a team
 */
export async function sendInvitationEmail(data: InvitationEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const invitationLink = `${BASE_URL}/api/invitations/${data.token}`;

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `You've been invited to join ${data.teamName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976D2;">You've been invited to join ${data.teamName}</h2>

        <p>Hi there,</p>

        <p>${data.inviterName} has invited you to join <strong>${data.teamName}</strong> on openleague.</p>

        <p>openleague is a free platform for managing sports teams. You'll be able to:</p>
        <ul>
          <li>View the team roster</li>
          <li>See upcoming games and practices</li>
          <li>RSVP to events</li>
          <li>Stay connected with your team</li>
        </ul>

        <p style="margin: 30px 0;">
          <a href="${invitationLink}"
             style="background-color: #1976D2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Accept Invitation
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${invitationLink}">${invitationLink}</a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This invitation will expire in 7 days.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `You've been invited to join ${data.teamName}

${data.inviterName} has invited you to join ${data.teamName} on openleague.

openleague is a free platform for managing sports teams. You'll be able to view the team roster, see upcoming games and practices, RSVP to events, and stay connected with your team.

Accept your invitation by visiting:
${invitationLink}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.`,
    to: [
      {
        email: data.email,
        type: "to",
      },
    ],
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending invitation email:", error);
    throw new Error("Failed to send invitation email");
  }
}

interface ExistingUserNotificationData {
  email: string;
  teamName: string;
  inviterName: string;
}

/**
 * Send a notification email to an existing user who was added to a team
 */
export async function sendExistingUserNotification(
  data: ExistingUserNotificationData
): Promise<void> {
  const mailchimp = getMailchimpClient();
  const loginLink = `${BASE_URL}/login`;

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `You've been added to ${data.teamName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976D2;">You've been added to ${data.teamName}</h2>

        <p>Hi there,</p>

        <p>${data.inviterName} has added you to <strong>${data.teamName}</strong> on openleague.</p>

        <p>You can now view the team roster, see upcoming games and practices, and RSVP to events.</p>

        <p style="margin: 30px 0;">
          <a href="${loginLink}"
             style="background-color: #1976D2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Go to openleague
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${loginLink}">${loginLink}</a>
        </p>
      </div>
    `,
    text: `You've been added to ${data.teamName}

${data.inviterName} has added you to ${data.teamName} on openleague.

You can now view the team roster, see upcoming games and practices, and RSVP to events.

Log in at: ${loginLink}`,
    to: [
      {
        email: data.email,
        type: "to",
      },
    ],
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending existing user notification:", error);
    throw new Error("Failed to send notification email");
  }
}

interface EventCreatedEmailData {
  emails: string[];
  teamName: string;
  eventType: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  opponent?: string | null;
  eventId: string;
}

/**
 * Send notification emails when a new event is created
 */
export async function sendEventCreatedEmail(data: EventCreatedEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const eventLink = `${BASE_URL}/events/${data.eventId}`;
  const eventTypeLabel = data.eventType === "GAME" ? "Game" : "Practice";

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `New ${eventTypeLabel}: ${data.eventTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976D2;">New ${eventTypeLabel} Scheduled</h2>

        <p>A new ${eventTypeLabel.toLowerCase()} has been added to <strong>${data.teamName}</strong>'s calendar.</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${data.eventTitle}</h3>
          <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${data.eventDate}</p>
          <p style="margin: 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>
          ${data.opponent ? `<p style="margin: 10px 0;"><strong>Opponent:</strong> ${data.opponent}</p>` : ""}
        </div>

        <p style="margin: 30px 0;">
          <a href="${eventLink}"
             style="background-color: #1976D2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Event & RSVP
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${eventLink}">${eventLink}</a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Please RSVP to let your team know if you can attend.
        </p>
      </div>
    `,
    text: `New ${eventTypeLabel} Scheduled

A new ${eventTypeLabel.toLowerCase()} has been added to ${data.teamName}'s calendar.

${data.eventTitle}
Date & Time: ${data.eventDate}
Location: ${data.eventLocation}
${data.opponent ? `Opponent: ${data.opponent}` : ""}

View event and RSVP at:
${eventLink}

Please RSVP to let your team know if you can attend.`,
    to: data.emails.map((email) => ({ email, type: "to" as const })),
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending event created email:", error);
    throw new Error("Failed to send event notification email");
  }
}

interface EventUpdatedEmailData {
  emails: string[];
  teamName: string;
  eventType: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  opponent?: string | null;
  eventId: string;
}

/**
 * Send notification emails when an event is updated
 */
export async function sendEventUpdatedEmail(data: EventUpdatedEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const eventLink = `${BASE_URL}/events/${data.eventId}`;
  const eventTypeLabel = data.eventType === "GAME" ? "Game" : "Practice";

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `Event Updated: ${data.eventTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF9800;">Event Updated</h2>

        <p>An event for <strong>${data.teamName}</strong> has been updated.</p>

        <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF9800;">
          <h3 style="margin-top: 0; color: #333;">${data.eventTitle}</h3>
          <p style="margin: 10px 0;"><strong>Type:</strong> ${eventTypeLabel}</p>
          <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${data.eventDate}</p>
          <p style="margin: 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>
          ${data.opponent ? `<p style="margin: 10px 0;"><strong>Opponent:</strong> ${data.opponent}</p>` : ""}
        </div>

        <p style="margin: 30px 0;">
          <a href="${eventLink}"
             style="background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Updated Event
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${eventLink}">${eventLink}</a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Please review the updated details and confirm your RSVP if needed.
        </p>
      </div>
    `,
    text: `Event Updated

An event for ${data.teamName} has been updated.

${data.eventTitle}
Type: ${eventTypeLabel}
Date & Time: ${data.eventDate}
Location: ${data.eventLocation}
${data.opponent ? `Opponent: ${data.opponent}` : ""}

View updated event at:
${eventLink}

Please review the updated details and confirm your RSVP if needed.`,
    to: data.emails.map((email) => ({ email, type: "to" as const })),
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending event updated email:", error);
    throw new Error("Failed to send event update notification email");
  }
}

interface EventCancelledEmailData {
  emails: string[];
  teamName: string;
  eventType: string;
  eventTitle: string;
  eventDate: string;
}

/**
 * Send notification emails when an event is cancelled
 */
export async function sendEventCancelledEmail(data: EventCancelledEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const calendarLink = `${BASE_URL}/calendar`;
  const eventTypeLabel = data.eventType === "GAME" ? "Game" : "Practice";

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `Event Cancelled: ${data.eventTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #D32F2F;">Event Cancelled</h2>

        <p>An event for <strong>${data.teamName}</strong> has been cancelled.</p>

        <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #D32F2F;">
          <h3 style="margin-top: 0; color: #333;">${data.eventTitle}</h3>
          <p style="margin: 10px 0;"><strong>Type:</strong> ${eventTypeLabel}</p>
          <p style="margin: 10px 0;"><strong>Was scheduled for:</strong> ${data.eventDate}</p>
          <p style="margin: 10px 0; color: #D32F2F; font-weight: bold;">This event has been cancelled.</p>
        </div>

        <p style="margin: 30px 0;">
          <a href="${calendarLink}"
             style="background-color: #1976D2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Calendar
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${calendarLink}">${calendarLink}</a>
        </p>
      </div>
    `,
    text: `Event Cancelled

An event for ${data.teamName} has been cancelled.

${data.eventTitle}
Type: ${eventTypeLabel}
Was scheduled for: ${data.eventDate}

This event has been cancelled.

View calendar at:
${calendarLink}`,
    to: data.emails.map((email) => ({ email, type: "to" as const })),
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending event cancelled email:", error);
    throw new Error("Failed to send event cancellation notification email");
  }
}

interface RSVPReminderEmailData {
  email: string;
  userName: string | null;
  teamName: string;
  eventType: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  opponent?: string | null;
  eventId: string;
}

/**
 * Send RSVP reminder email to a member who hasn't responded
 */
export async function sendRSVPReminderEmail(data: RSVPReminderEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const eventLink = `${BASE_URL}/events/${data.eventId}`;
  const eventTypeLabel = data.eventType === "GAME" ? "Game" : "Practice";
  const greeting = data.userName ? `Hi ${data.userName}` : "Hi there";

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `RSVP Reminder: ${data.eventTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976D2;">RSVP Reminder</h2>

        <p>${greeting},</p>

        <p>This is a friendly reminder to RSVP for an upcoming ${eventTypeLabel.toLowerCase()} with <strong>${data.teamName}</strong>.</p>

        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1976D2;">
          <h3 style="margin-top: 0; color: #333;">${data.eventTitle}</h3>
          <p style="margin: 10px 0;"><strong>Type:</strong> ${eventTypeLabel}</p>
          <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${data.eventDate}</p>
          <p style="margin: 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>
          ${data.opponent ? `<p style="margin: 10px 0;"><strong>Opponent:</strong> ${data.opponent}</p>` : ""}
        </div>

        <p>Your team is counting on you! Please let us know if you can make it.</p>

        <p style="margin: 30px 0;">
          <a href="${eventLink}"
             style="background-color: #43A047; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            RSVP Now
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${eventLink}">${eventLink}</a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This event is coming up in less than 48 hours.
        </p>
      </div>
    `,
    text: `RSVP Reminder

${greeting},

This is a friendly reminder to RSVP for an upcoming ${eventTypeLabel.toLowerCase()} with ${data.teamName}.

${data.eventTitle}
Type: ${eventTypeLabel}
Date & Time: ${data.eventDate}
Location: ${data.eventLocation}
${data.opponent ? `Opponent: ${data.opponent}` : ""}

Your team is counting on you! Please let us know if you can make it.

RSVP at:
${eventLink}

This event is coming up in less than 48 hours.`,
    to: [
      {
        email: data.email,
        type: "to",
      },
    ],
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending RSVP reminder email:", error);
    throw new Error("Failed to send RSVP reminder email");
  }
}

/**
 * Send RSVP reminders for events happening in 48 hours
 * This function should be called by a scheduled job/cron
 */
export async function sendRSVPReminders(): Promise<void> {
  // Calculate the time window: 48 hours from now (with a 1-hour buffer)
  const now = new Date();
  const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const fortySevenHoursFromNow = new Date(now.getTime() + 47 * 60 * 60 * 1000);

  // Find events happening in approximately 48 hours
  const upcomingEvents = await prisma.event.findMany({
    where: {
      startAt: {
        gte: fortySevenHoursFromNow,
        lte: fortyEightHoursFromNow,
      },
    },
    include: {
      team: {
        select: {
          name: true,
        },
      },
      rsvps: {
        where: {
          status: "NO_RESPONSE",
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  // Send reminders for each event
  for (const event of upcomingEvents) {
    for (const rsvp of event.rsvps) {
      try {
        await sendRSVPReminderEmail({
          email: rsvp.user.email,
          userName: rsvp.user.name,
          teamName: event.team.name,
          eventType: event.type,
          eventTitle: event.title,
          eventDate: formatDateTime(event.startAt),
          eventLocation: event.location,
          opponent: event.opponent,
          eventId: event.id,
        });
      } catch (error) {
        console.error(
          `Failed to send RSVP reminder to ${rsvp.user.email} for event ${event.id}:`,
          error
        );
        // Continue with other reminders even if one fails
      }
    }
  }
}

/**
 * Helper function to send event notifications to all team members
 */
export async function sendEventNotifications(
  eventId: string,
  type: "created" | "updated" | "cancelled"
): Promise<void> {
  // Fetch event with team members
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      team: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!event) {
    throw new Error("Event not found");
  }

  const emails = event.team.members.map(
    (member: { user: { email: string } }) => member.user.email
  );

  const eventData = {
    emails,
    teamName: event.team.name,
    eventType: event.type,
    eventTitle: event.title,
    eventDate: formatDateTime(event.startAt),
    eventLocation: event.location,
    opponent: event.opponent,
    eventId: event.id,
  };

  if (type === "created") {
    await sendEventCreatedEmail(eventData);
  } else if (type === "updated") {
    await sendEventUpdatedEmail(eventData);
  } else if (type === "cancelled") {
    await sendEventCancelledEmail({
      emails: eventData.emails,
      teamName: eventData.teamName,
      eventType: eventData.eventType,
      eventTitle: eventData.eventTitle,
      eventDate: eventData.eventDate,
    });
  }
}

interface LeagueMessageEmailData {
  recipients: Array<{ email: string; name: string | null; userId?: string }>;
  leagueName: string;
  senderName: string;
  subject: string;
  content: string;
  priority: string;
  leagueId?: string;
}

/**
 * Send a targeted league message email
 */
export async function sendLeagueMessageEmail(data: LeagueMessageEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const priorityLabel = data.priority === "URGENT" ? "URGENT: " : data.priority === "HIGH" ? "Important: " : "";
  const priorityColor = data.priority === "URGENT" ? "#D32F2F" : data.priority === "HIGH" ? "#FF9800" : "#1976D2";

  // Send individual emails to include personalized unsubscribe links
  for (const recipient of data.recipients) {
    let unsubscribeLink = "";
    
    // Generate unsubscribe link if we have userId
    if (recipient.userId) {
      try {
        const token = await notificationService.generateUnsubscribeToken(recipient.userId, data.leagueId);
        unsubscribeLink = `${BASE_URL}/unsubscribe?token=${token}`;
      } catch (error) {
        console.error("Failed to generate unsubscribe token:", error);
      }
    }

    const message: {
      from_email: string;
      subject: string;
      html: string;
      text: string;
      to: Array<{ email: string; name?: string; type: "to" }>;
    } = {
      from_email: EMAIL_FROM,
      subject: `${priorityLabel}${data.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: ${priorityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; color: white;">League Message</h2>
            <p style="margin: 10px 0 0 0; color: white; opacity: 0.9;">From ${data.senderName} • ${data.leagueName}</p>
          </div>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px;">
            <h3 style="margin-top: 0; color: #333;">${data.subject}</h3>
            
            <div style="background-color: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
              ${data.content.replace(/\n/g, '<br>')}
            </div>

            ${data.priority === "URGENT" || data.priority === "HIGH" ? `
              <div style="background-color: #fff3e0; border-left: 4px solid ${priorityColor}; padding: 15px; margin: 20px 0;">
                <strong style="color: ${priorityColor};">
                  ${data.priority === "URGENT" ? "⚠️ This is an urgent message" : "📢 This is a high priority message"}
                </strong>
              </div>
            ` : ""}

            <p style="margin: 30px 0;">
              <a href="${BASE_URL}/login"
                 style="background-color: ${priorityColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Go to openleague
              </a>
            </p>

            <p style="color: #666; font-size: 14px;">
              Or copy and paste this link into your browser:<br>
              <a href="${BASE_URL}/login">${BASE_URL}/login</a>
            </p>

            ${unsubscribeLink ? `
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                Don't want to receive these emails? 
                <a href="${unsubscribeLink}" style="color: #999;">Unsubscribe</a>
              </p>
            ` : ""}
          </div>
        </div>
      `,
      text: `League Message from ${data.senderName}
${data.leagueName}

${data.subject}

${data.content}

${data.priority === "URGENT" || data.priority === "HIGH" ? `\n⚠️ This is a ${data.priority.toLowerCase()} priority message\n` : ""}

Go to openleague: ${BASE_URL}/login

${unsubscribeLink ? `\nDon't want to receive these emails? Unsubscribe: ${unsubscribeLink}` : ""}`,
      to: [{
        email: recipient.email,
        name: recipient.name || undefined,
        type: "to" as const,
      }],
    };

    try {
      await mailchimp.messages.send({ message });
    } catch (error) {
      console.error(`Error sending league message email to ${recipient.email}:`, error);
      // Continue with other recipients
    }
  }
}

interface LeagueAnnouncementEmailData {
  recipients: Array<{ email: string; name: string | null; userId?: string }>;
  leagueName: string;
  senderName: string;
  subject: string;
  content: string;
  priority: string;
  leagueId?: string;
}

/**
 * Send a league announcement email
 */
export async function sendLeagueAnnouncementEmail(data: LeagueAnnouncementEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const priorityLabel = data.priority === "URGENT" ? "URGENT: " : data.priority === "HIGH" ? "Important: " : "";
  const priorityColor = data.priority === "URGENT" ? "#D32F2F" : data.priority === "HIGH" ? "#FF9800" : "#43A047";

  // Send individual emails to include personalized unsubscribe links
  for (const recipient of data.recipients) {
    let unsubscribeLink = "";
    
    // Generate unsubscribe link if we have userId
    if (recipient.userId) {
      try {
        const token = await notificationService.generateUnsubscribeToken(recipient.userId, data.leagueId);
        unsubscribeLink = `${BASE_URL}/unsubscribe?token=${token}`;
      } catch (error) {
        console.error("Failed to generate unsubscribe token:", error);
      }
    }

    const message: {
      from_email: string;
      subject: string;
      html: string;
      text: string;
      to: Array<{ email: string; name?: string; type: "to" }>;
    } = {
      from_email: EMAIL_FROM,
      subject: `${priorityLabel}${data.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: ${priorityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; color: white;">📢 League Announcement</h2>
            <p style="margin: 10px 0 0 0; color: white; opacity: 0.9;">From ${data.senderName} • ${data.leagueName}</p>
          </div>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px;">
            <h3 style="margin-top: 0; color: #333;">${data.subject}</h3>
            
            <div style="background-color: white; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid ${priorityColor};">
              ${data.content.replace(/\n/g, '<br>')}
            </div>

            ${data.priority === "URGENT" ? `
              <div style="background-color: #ffebee; border: 2px solid #D32F2F; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <strong style="color: #D32F2F;">
                  🚨 URGENT ANNOUNCEMENT - Please read immediately
                </strong>
              </div>
            ` : data.priority === "HIGH" ? `
              <div style="background-color: #fff3e0; border: 2px solid #FF9800; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <strong style="color: #FF9800;">
                  📢 Important announcement for all league members
                </strong>
              </div>
            ` : ""}

            <p style="margin: 30px 0;">
              <a href="${BASE_URL}/login"
                 style="background-color: ${priorityColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Go to openleague
              </a>
            </p>

            <p style="color: #666; font-size: 14px;">
              Or copy and paste this link into your browser:<br>
              <a href="${BASE_URL}/login">${BASE_URL}/login</a>
            </p>

            ${unsubscribeLink ? `
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                Don't want to receive these emails? 
                <a href="${unsubscribeLink}" style="color: #999;">Unsubscribe</a>
              </p>
            ` : ""}
          </div>
        </div>
      `,
      text: `📢 League Announcement from ${data.senderName}
${data.leagueName}

${data.subject}

${data.content}

${data.priority === "URGENT" ? "\n🚨 URGENT ANNOUNCEMENT - Please read immediately\n" : data.priority === "HIGH" ? "\n📢 Important announcement for all league members\n" : ""}

Go to openleague: ${BASE_URL}/login

${unsubscribeLink ? `\nDon't want to receive these emails? Unsubscribe: ${unsubscribeLink}` : ""}`,
      to: [{
        email: recipient.email,
        name: recipient.name || undefined,
        type: "to" as const,
      }],
    };

    try {
      await mailchimp.messages.send({ message });
    } catch (error) {
      console.error(`Error sending league announcement email to ${recipient.email}:`, error);
      // Continue with other recipients
    }
  }
}
