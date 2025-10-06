import { mailchimpClient } from "./client";
import { prisma } from "@/lib/db/prisma";

const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@openleague.app";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

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
    await mailchimpClient.messages.send({ message });
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
    await mailchimpClient.messages.send({ message });
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
    await mailchimpClient.messages.send({ message });
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
    await mailchimpClient.messages.send({ message });
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
    await mailchimpClient.messages.send({ message });
  } catch (error) {
    console.error("Error sending event cancelled email:", error);
    throw new Error("Failed to send event cancellation notification email");
  }
}

/**
 * Helper function to send event notifications to all team members
 */
export async function sendEventNotifications(
  eventId: string,
  type: "created" | "updated" | "cancelled"
): Promise<void> {
  const { formatDateTime } = await import("@/lib/utils/date");

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
