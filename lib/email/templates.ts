import { getMailchimpClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { FALLBACK_TIME_ZONE, formatDateTime } from "@/lib/utils/date";
import { env, getBaseUrl } from "@/lib/env";
import { notificationService } from "@/lib/services/notification";

const EMAIL_FROM = env.EMAIL_FROM;
const BASE_URL = getBaseUrl();

interface IceTimeRequestSubmittedEmailData {
  managerEmails: string[];
  venueName: string;
  scheduleTitle: string;
  contactName: string;
  contactEmail: string;
  requestId: string;
  organizationId: string;
  venueId: string;
}

interface VenueRelationshipInvitationEmailData {
  email: string;
  venueName: string;
  relationshipType: "PREFERRED" | "HOME";
  relationshipId: string;
}

export async function sendVenueRelationshipInvitationEmail(
  data: VenueRelationshipInvitationEmailData
): Promise<void> {
  const mailchimp = getMailchimpClient();
  const invitationLink = `${BASE_URL}/venue-relationships/${data.relationshipId}`;
  const relationshipLabel = data.relationshipType === "HOME" ? "home rink" : "preferred rink";

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `${data.venueName} invited you to add a ${relationshipLabel}`,
      html: `<p>${data.venueName} invited you to add them as a ${relationshipLabel}.</p><p><a href="${invitationLink}">Review invitation</a></p>`,
      text: `${data.venueName} invited you to add them as a ${relationshipLabel}. Review: ${invitationLink}`,
      to: [{ email: data.email, type: "to" as const }],
    },
  });
}

interface VenueStaffInviteEmailData {
  email: string;
  organizationName: string;
  inviterName: string;
  /** VenueStaffRole enum value, e.g. "CONTENT_EDITOR". */
  role: string;
  organizationId: string;
}

function formatVenueStaffRoleLabel(role: string): string {
  return role.toLowerCase().split("_").join(" ");
}

/**
 * Notify an existing user that they were invited to a venue organization's
 * staff, linking to the staff page where they can accept or decline.
 */
export async function sendVenueStaffInviteEmail(data: VenueStaffInviteEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const staffLink = `${BASE_URL}/venue-admin/${data.organizationId}/staff`;
  const roleLabel = formatVenueStaffRoleLabel(data.role);

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `${data.inviterName} invited you to help manage ${data.organizationName}`,
      html: `<p>${data.inviterName} invited you to join the staff of <strong>${data.organizationName}</strong> on OpenLeague with the ${roleLabel} role.</p><p><a href="${staffLink}">Review invitation</a></p><p>If you didn't expect this invitation, you can safely ignore this email.</p>`,
      text: `${data.inviterName} invited you to join the staff of ${data.organizationName} on OpenLeague with the ${roleLabel} role. Review: ${staffLink}\n\nIf you didn't expect this invitation, you can safely ignore this email.`,
      to: [{ email: data.email, type: "to" as const }],
    },
  });
}

export async function sendIceTimeRequestSubmittedEmail(
  data: IceTimeRequestSubmittedEmailData
): Promise<void> {
  const mailchimp = getMailchimpClient();
  const requestLink = `${BASE_URL}/venue-admin/${data.organizationId}/venues/${data.venueId}/requests?requestId=${encodeURIComponent(data.requestId)}`;

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `New ice time request for ${data.venueName}`,
      html: `<p>${data.contactName} (${data.contactEmail}) requested ${data.scheduleTitle}.</p><p><a href="${requestLink}">Review request</a></p>`,
      text: `${data.contactName} (${data.contactEmail}) requested ${data.scheduleTitle}. Review: ${requestLink}`,
      to: data.managerEmails.map((email) => ({ email, type: "to" as const })),
    },
  });
}

interface IceTimeRequestDecisionEmailData {
  contactEmail: string;
  venueName: string;
  status: "ACCEPTED" | "DECLINED";
  decisionMessage?: string | null;
}

export async function sendIceTimeRequestDecisionEmail(
  data: IceTimeRequestDecisionEmailData
): Promise<void> {
  const mailchimp = getMailchimpClient();
  const statusLabel = data.status === "ACCEPTED" ? "accepted" : "declined";

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `Your ice time request was ${statusLabel}`,
      html: `<p>${data.venueName} ${statusLabel} your ice time request.</p>${data.decisionMessage ? `<p>${data.decisionMessage}</p>` : ""}`,
      text: `${data.venueName} ${statusLabel} your ice time request.${data.decisionMessage ? `\n\n${data.decisionMessage}` : ""}`,
      to: [{ email: data.contactEmail, type: "to" as const }],
    },
  });
}

interface SessionRegistrationConfirmationEmailData {
  to: string;
  participantName: string;
  venueName: string;
  offeringTitle: string;
  quantity: number;
  amountTotal: number; // cents
  currency: string;
  receiptUrl?: string | null;
}

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Confirmation sent to the participant after a successful session/lesson registration.
 */
export async function sendSessionRegistrationConfirmationEmail(
  data: SessionRegistrationConfirmationEmailData
): Promise<void> {
  const mailchimp = getMailchimpClient();
  const registrationsLink = `${BASE_URL}/my-registrations`;
  const priceLine =
    data.amountTotal > 0 ? ` Amount paid: ${formatMoney(data.amountTotal, data.currency)}.` : " This session is free.";
  const receiptLine = data.receiptUrl ? `<p><a href="${data.receiptUrl}">View your receipt</a></p>` : "";

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `You're registered for ${data.offeringTitle}`,
      html: `<p>Hi ${data.participantName},</p><p>You're registered for <strong>${data.offeringTitle}</strong> at ${data.venueName} (${data.quantity} spot${data.quantity === 1 ? "" : "s"}).${priceLine}</p>${receiptLine}<p><a href="${registrationsLink}">View your registrations</a></p>`,
      text: `Hi ${data.participantName}, you're registered for ${data.offeringTitle} at ${data.venueName} (${data.quantity} spot(s)).${priceLine} View your registrations: ${registrationsLink}`,
      to: [{ email: data.to, type: "to" as const }],
    },
  });
}

interface SessionRegistrationManagerEmailData {
  managerEmails: string[];
  venueName: string;
  offeringTitle: string;
  participantName: string;
  quantity: number;
}

/**
 * Notify rink managers that a new registration was received.
 */
export async function sendSessionRegistrationManagerEmail(
  data: SessionRegistrationManagerEmailData
): Promise<void> {
  if (data.managerEmails.length === 0) return;
  const mailchimp = getMailchimpClient();

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `New registration for ${data.offeringTitle}`,
      html: `<p>${data.participantName} registered for <strong>${data.offeringTitle}</strong> at ${data.venueName} (${data.quantity} spot${data.quantity === 1 ? "" : "s"}).</p>`,
      text: `${data.participantName} registered for ${data.offeringTitle} at ${data.venueName} (${data.quantity} spot(s)).`,
      to: data.managerEmails.map((email) => ({ email, type: "to" as const })),
    },
  });
}

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
      venue: { select: { name: true, address: true, city: true, state: true } },
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

  // Build location string with venue address if available
  let eventLocation = event.location;
  if (event.venue) {
    const parts = [event.venue.name, event.venue.address, event.venue.city, event.venue.state]
      .filter(Boolean)
      .join(", ");
    if (parts) eventLocation = parts;
  }

  const eventData = {
    emails,
    teamName: event.team.name,
    eventType: event.type,
    eventTitle: event.title,
    eventDate: formatDateTime(event.startAt),
    eventLocation,
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

  // Batch generate unsubscribe tokens to avoid N+1 query problem
  const userIds = data.recipients.filter(r => r.userId).map(r => r.userId!);
  const tokenMap = userIds.length > 0
    ? await notificationService.batchGenerateUnsubscribeTokens(userIds, data.leagueId)
    : new Map<string, string>();

  // Send individual emails to include personalized unsubscribe links
  for (const recipient of data.recipients) {
    let unsubscribeLink = "";

    // Get pre-generated unsubscribe token
    if (recipient.userId && tokenMap.has(recipient.userId)) {
      const token = tokenMap.get(recipient.userId)!;
      unsubscribeLink = `${BASE_URL}/unsubscribe?token=${token}`;
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

  // Batch generate unsubscribe tokens to avoid N+1 query problem
  const userIds = data.recipients.filter(r => r.userId).map(r => r.userId!);
  const tokenMap = userIds.length > 0
    ? await notificationService.batchGenerateUnsubscribeTokens(userIds, data.leagueId)
    : new Map<string, string>();

  // Send individual emails to include personalized unsubscribe links
  for (const recipient of data.recipients) {
    let unsubscribeLink = "";

    // Get pre-generated unsubscribe token
    if (recipient.userId && tokenMap.has(recipient.userId)) {
      const token = tokenMap.get(recipient.userId)!;
      unsubscribeLink = `${BASE_URL}/unsubscribe?token=${token}`;
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

interface PracticePlanSharedEmailData {
  emails: string[];
  teamName: string;
  sessionTitle: string;
  sessionDate: string;
  duration: number;
  playCount: number;
  sessionId: string;
  teamId: string;
}

/**
 * Send notification emails when a practice plan is shared
 * Requirements: 6.1, 6.2
 */
export async function sendPracticePlanSharedEmail(data: PracticePlanSharedEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const sessionLink = `${BASE_URL}/practice-planner/${data.sessionId}`;

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `Practice Plan Shared: ${data.sessionTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976D2;">New Practice Plan Available</h2>

        <p>A new practice plan has been shared with <strong>${data.teamName}</strong>.</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${data.sessionTitle}</h3>
          <p style="margin: 10px 0;"><strong>Date:</strong> ${data.sessionDate}</p>
          <p style="margin: 10px 0;"><strong>Duration:</strong> ${data.duration} minutes</p>
          <p style="margin: 10px 0;"><strong>Number of Drills:</strong> ${data.playCount}</p>
        </div>

        <p>Review the practice plan to see the drills and prepare for the upcoming practice.</p>

        <p style="margin: 30px 0;">
          <a href="${sessionLink}"
             style="background-color: #1976D2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Practice Plan
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${sessionLink}">${sessionLink}</a>
        </p>
      </div>
    `,
    text: `New Practice Plan Available

A new practice plan has been shared with ${data.teamName}.

${data.sessionTitle}
Date: ${data.sessionDate}
Duration: ${data.duration} minutes
Number of Drills: ${data.playCount}

Review the practice plan to see the drills and prepare for the upcoming practice.

View practice plan at:
${sessionLink}`,
    to: data.emails.map((email) => ({ email, type: "to" as const })),
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending practice plan shared email:", error);
    throw new Error("Failed to send practice plan notification email");
  }
}

interface PracticePlanUpdatedEmailData {
  emails: string[];
  teamName: string;
  sessionTitle: string;
  sessionDate: string;
  duration: number;
  playCount: number;
  sessionId: string;
  teamId: string;
}

/**
 * Send notification emails when a shared practice plan is updated
 * Requirements: 6.3
 */
export async function sendPracticePlanUpdatedEmail(data: PracticePlanUpdatedEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const sessionLink = `${BASE_URL}/practice-planner/${data.sessionId}`;

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: `Practice Plan Updated: ${data.sessionTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF9800;">Practice Plan Updated</h2>

        <p>A practice plan for <strong>${data.teamName}</strong> has been updated.</p>

        <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF9800;">
          <h3 style="margin-top: 0; color: #333;">${data.sessionTitle}</h3>
          <p style="margin: 10px 0;"><strong>Date:</strong> ${data.sessionDate}</p>
          <p style="margin: 10px 0;"><strong>Duration:</strong> ${data.duration} minutes</p>
          <p style="margin: 10px 0;"><strong>Number of Drills:</strong> ${data.playCount}</p>
        </div>

        <p>The practice plan has been modified. Please review the updated drills and instructions.</p>

        <p style="margin: 30px 0;">
          <a href="${sessionLink}"
             style="background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Updated Practice Plan
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${sessionLink}">${sessionLink}</a>
        </p>
      </div>
    `,
    text: `Practice Plan Updated

A practice plan for ${data.teamName} has been updated.

${data.sessionTitle}
Date: ${data.sessionDate}
Duration: ${data.duration} minutes
Number of Drills: ${data.playCount}

The practice plan has been modified. Please review the updated drills and instructions.

View updated practice plan at:
${sessionLink}`,
    to: data.emails.map((email) => ({ email, type: "to" as const })),
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending practice plan updated email:", error);
    throw new Error("Failed to send practice plan update notification email");
  }
}

/**
 * Helper function to send practice plan notifications to all team members
 * Requirements: 6.1, 6.3, 6.4
 */
export async function sendPracticePlanNotifications(
  sessionId: string,
  teamId: string,
  type: "shared" | "updated"
): Promise<void> {
  // Fetch session with team members and their notification preferences
  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      team: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  notificationPreferences: {
                    select: {
                      practicePlanNotifications: true,
                      emailEnabled: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          plays: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error("Practice session not found");
  }

  // Filter team members based on notification preferences (Requirements: 6.4)
  const emails = session.team.members
    .filter((member: { user: { notificationPreferences: Array<{ practicePlanNotifications: boolean; emailEnabled: boolean }> } }) => {
      const prefs = member.user.notificationPreferences;
      // If no preferences set, default to sending
      if (prefs.length === 0) return true;
      // Check if any preference disables practice plan notifications or email
      return prefs.every(p => p.practicePlanNotifications && p.emailEnabled);
    })
    .map((member: { user: { email: string } }) => member.user.email);

  // No eligible recipients — skip sending to avoid Mailchimp 400 error
  if (emails.length === 0) {
    return;
  }

  const sessionData = {
    emails,
    teamName: session.team.name,
    sessionTitle: session.title,
    sessionDate: formatDateTime(session.date),
    duration: session.duration,
    playCount: session._count.plays,
    sessionId: session.id,
    teamId: session.teamId,
  };

  if (type === "shared") {
    await sendPracticePlanSharedEmail(sessionData);
  } else if (type === "updated") {
    await sendPracticePlanUpdatedEmail(sessionData);
  }
}

// --- Signup events (feature 004) ---

interface SignupEventRecipient {
  email: string;
  name?: string | null;
}

interface SignupEventUpdatedEmailData {
  recipients: SignupEventRecipient[];
  eventTitle: string;
  hostName: string;
  changeSummary: string;
  eventId: string;
}

/** Material-change notification (time/venue/details) to all active registrants. */
export async function sendSignupEventUpdatedEmail(data: SignupEventUpdatedEmailData): Promise<void> {
  if (data.recipients.length === 0) return;
  const mailchimp = getMailchimpClient();
  const eventLink = `${BASE_URL}/signups/${data.eventId}`;

  // One message per family — recipients must never see each other's addresses
  // (same pattern as sendSignupEventReminders/sendLeagueMessageEmail).
  for (const recipient of data.recipients) {
    try {
      await mailchimp.messages.send({
        message: {
          from_email: EMAIL_FROM,
          subject: `Updated: ${data.eventTitle}`,
          html: `<p><strong>${data.eventTitle}</strong> (hosted by ${data.hostName}) has been updated.</p><p>${data.changeSummary}</p><p><a href="${eventLink}">View the event</a></p>`,
          text: `${data.eventTitle} (hosted by ${data.hostName}) has been updated. ${data.changeSummary} View: ${eventLink}`,
          to: [{ email: recipient.email, type: "to" as const }],
        },
      });
    } catch (emailError) {
      console.error(`Failed to send event update email to ${recipient.email}:`, emailError);
    }
  }
}

interface SignupEventCanceledEmailData {
  recipients: SignupEventRecipient[];
  eventTitle: string;
  hostName: string;
  reason?: string;
}

/** Cancellation notice to all active registrants. */
export async function sendSignupEventCanceledEmail(data: SignupEventCanceledEmailData): Promise<void> {
  if (data.recipients.length === 0) return;
  const mailchimp = getMailchimpClient();
  const reasonHtml = data.reason ? `<p>Reason: ${data.reason}</p>` : "";

  // One message per family — recipients must never see each other's addresses.
  for (const recipient of data.recipients) {
    try {
      await mailchimp.messages.send({
        message: {
          from_email: EMAIL_FROM,
          subject: `Canceled: ${data.eventTitle}`,
          html: `<p><strong>${data.eventTitle}</strong> (hosted by ${data.hostName}) has been canceled.</p>${reasonHtml}<p>If you paid online, the organizer will process refunds.</p>`,
          text: `${data.eventTitle} (hosted by ${data.hostName}) has been canceled.${data.reason ? ` Reason: ${data.reason}` : ""} If you paid online, the organizer will process refunds.`,
          to: [{ email: recipient.email, type: "to" as const }],
        },
      });
    } catch (emailError) {
      console.error(`Failed to send event cancellation email to ${recipient.email}:`, emailError);
    }
  }
}

interface EventRegistrationConfirmationEmailData {
  to: string;
  participantNames: string[];
  eventTitle: string;
  slotName: string;
  hostName: string;
  startAtFormatted: string;
  eventId: string;
  amountTotal: number;
  currency: string;
  manualPaymentNote?: string;
}

/** Registration confirmation to the registrant (contact of record). */
export async function sendEventRegistrationConfirmationEmail(
  data: EventRegistrationConfirmationEmailData
): Promise<void> {
  const mailchimp = getMailchimpClient();
  const eventLink = `${BASE_URL}/signups/${data.eventId}`;
  const names = data.participantNames.join(", ");
  const paymentHtml =
    data.amountTotal > 0
      ? `<p>Amount due: <strong>${formatMoney(data.amountTotal, data.currency)}</strong>${data.manualPaymentNote ? ` — ${data.manualPaymentNote}` : ""}</p>`
      : "";

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `You're in: ${data.eventTitle}`,
      html: `<p>${names} ${data.participantNames.length === 1 ? "is" : "are"} confirmed for <strong>${data.slotName}</strong> at <strong>${data.eventTitle}</strong> (hosted by ${data.hostName}) on ${data.startAtFormatted}.</p>${paymentHtml}<p><a href="${eventLink}">View the event</a></p>`,
      text: `${names} confirmed for ${data.slotName} at ${data.eventTitle} (hosted by ${data.hostName}) on ${data.startAtFormatted}.${data.amountTotal > 0 ? ` Amount due: ${formatMoney(data.amountTotal, data.currency)}.` : ""} View: ${eventLink}`,
      to: [{ email: data.to, type: "to" as const }],
    },
  });
}

interface EventRegistrationRemovedEmailData {
  to: string;
  participantName: string;
  eventTitle: string;
  reason?: string;
}

/** Notice that an organizer removed a registration. */
export async function sendEventRegistrationRemovedEmail(
  data: EventRegistrationRemovedEmailData
): Promise<void> {
  const mailchimp = getMailchimpClient();

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `Registration removed: ${data.eventTitle}`,
      html: `<p>${data.participantName}'s registration for <strong>${data.eventTitle}</strong> was removed by an organizer.</p>${data.reason ? `<p>Reason: ${data.reason}</p>` : ""}`,
      text: `${data.participantName}'s registration for ${data.eventTitle} was removed by an organizer.${data.reason ? ` Reason: ${data.reason}` : ""}`,
      to: [{ email: data.to, type: "to" as const }],
    },
  });
}

/**
 * Send 48-hour reminders for upcoming signup events. Runs from the hourly
 * reminders cron; the one-hour window means each event is picked up exactly
 * once. Honors notification preferences (emailEnabled + rsvpReminders).
 */
export async function sendSignupEventReminders(): Promise<void> {
  const windowStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 49 * 60 * 60 * 1000);

  const events = await prisma.signupEvent.findMany({
    where: {
      status: "PUBLISHED",
      startAt: { gte: windowStart, lt: windowEnd },
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      locationText: true,
      venue: { select: { name: true } },
      hostOrganization: { select: { name: true } },
      hostLeague: { select: { name: true } },
      hostTeam: { select: { name: true } },
      registrations: {
        where: { status: "CONFIRMED" },
        select: {
          participantName: true,
          registrant: { select: { id: true, email: true } },
        },
      },
    },
  });

  for (const event of events) {
    if (event.registrations.length === 0) continue;

    // Exclude registrants who opted out of reminder emails.
    const registrantIds = [...new Set(event.registrations.map((reg) => reg.registrant.id))];
    const optedOut = await prisma.notificationPreference.findMany({
      where: {
        userId: { in: registrantIds },
        OR: [{ emailEnabled: false }, { rsvpReminders: false }],
      },
      select: { userId: true },
    });
    const optedOutIds = new Set(optedOut.map((preference) => preference.userId));

    const byRegistrant = new Map<string, { email: string; participants: string[] }>();
    for (const registration of event.registrations) {
      if (optedOutIds.has(registration.registrant.id)) continue;
      const entry = byRegistrant.get(registration.registrant.id) ?? {
        email: registration.registrant.email,
        participants: [],
      };
      entry.participants.push(registration.participantName);
      byRegistrant.set(registration.registrant.id, entry);
    }
    if (byRegistrant.size === 0) continue;

    const hostName =
      event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "the organizer";
    const location = event.venue?.name ?? event.locationText ?? "";
    const eventLink = `${BASE_URL}/signups/${event.id}`;
    const mailchimp = getMailchimpClient();

    for (const { email, participants } of byRegistrant.values()) {
      try {
        await mailchimp.messages.send({
          message: {
            from_email: EMAIL_FROM,
            subject: `Reminder: ${event.title} is coming up`,
            html: `<p>Reminder — <strong>${event.title}</strong> (hosted by ${hostName}) starts ${formatDateTime(event.startAt)}${location ? ` at ${location}` : ""}.</p><p>Registered: ${participants.join(", ")}</p><p><a href="${eventLink}">View the event</a></p>`,
            text: `Reminder — ${event.title} (hosted by ${hostName}) starts ${formatDateTime(event.startAt)}${location ? ` at ${location}` : ""}. Registered: ${participants.join(", ")}. View: ${eventLink}`,
            to: [{ email, type: "to" as const }],
          },
        });
      } catch (emailError) {
        console.error(`Failed to send signup-event reminder for ${event.id}:`, emailError);
      }
    }
  }
}

interface WaitlistOfferEmailData {
  to: string;
  participantName: string;
  eventTitle: string;
  slotName: string;
  claimByFormatted: string;
  eventId: string;
}

/** A waitlist spot opened up — time-boxed offer to claim it. */
export async function sendWaitlistOfferEmail(data: WaitlistOfferEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const claimLink = `${BASE_URL}/my-registrations`;

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `A spot opened up: ${data.eventTitle}`,
      html: `<p>Good news — a <strong>${data.slotName}</strong> spot opened up for ${data.participantName} at <strong>${data.eventTitle}</strong>.</p><p>Claim it by <strong>${data.claimByFormatted}</strong> or the offer passes to the next person on the waitlist.</p><p><a href="${claimLink}">Claim your spot</a></p>`,
      text: `A ${data.slotName} spot opened up for ${data.participantName} at ${data.eventTitle}. Claim it by ${data.claimByFormatted} or the offer passes to the next person: ${claimLink}`,
      to: [{ email: data.to, type: "to" as const }],
    },
  });
}

interface EventInvitationEmailData {
  to: string;
  eventTitle: string;
  hostName: string;
  startAtFormatted: string;
  token: string;
  isExistingUser: boolean;
}

/** Invitation to view/register for a signup event (access list for invite-only events). */
export async function sendEventInvitationEmail(data: EventInvitationEmailData): Promise<void> {
  const mailchimp = getMailchimpClient();
  const inviteLink = `${BASE_URL}/api/event-invitations/${data.token}`;
  const cta = data.isExistingUser
    ? "View the event and sign up"
    : "Create your free account and sign up";

  await mailchimp.messages.send({
    message: {
      from_email: EMAIL_FROM,
      subject: `You're invited: ${data.eventTitle}`,
      html: `<p>${data.hostName} invited you to <strong>${data.eventTitle}</strong> on ${data.startAtFormatted}.</p><p><a href="${inviteLink}">${cta}</a></p>`,
      text: `${data.hostName} invited you to ${data.eventTitle} on ${data.startAtFormatted}. ${cta}: ${inviteLink}`,
      to: [{ email: data.to, type: "to" as const }],
    },
  });
}

interface EventTeamsUpdateEmailData {
  recipients: SignupEventRecipient[];
  eventTitle: string;
  eventId: string;
  isInitialPublish: boolean;
}

/** Teams/rosters posted (or updated after posting) for a signup event. */
export async function sendEventTeamsUpdateEmail(data: EventTeamsUpdateEmailData): Promise<void> {
  if (data.recipients.length === 0) return;
  const mailchimp = getMailchimpClient();
  const eventLink = `${BASE_URL}/signups/${data.eventId}`;
  const headline = data.isInitialPublish
    ? `Teams are posted for ${data.eventTitle}`
    : `Team assignments updated for ${data.eventTitle}`;

  // One message per family — recipients must never see each other's addresses.
  for (const recipient of data.recipients) {
    try {
      await mailchimp.messages.send({
        message: {
          from_email: EMAIL_FROM,
          subject: headline,
          html: `<p>${headline}.</p><p><a href="${eventLink}">See your team and game times</a></p>`,
          text: `${headline}. See your team and game times: ${eventLink}`,
          to: [{ email: recipient.email, type: "to" as const }],
        },
      });
    } catch (emailError) {
      console.error(`Failed to send teams update email to ${recipient.email}:`, emailError);
    }
  }
}

// --- Season scheduling: game proposals (feature 005) ---

type GameProposalChange = "created" | "countered" | "accepted" | "declined" | "withdrawn";

/**
 * Notify the side that did NOT act on a game-proposal state change
 * (FR-020/023). Recipients are the counterparty team's ADMINs — for
 * "created"/"countered" that is the side receiving the new terms; for
 * "accepted"/"declined"/"withdrawn" it is the other side from the acting
 * entry's actorTeamId. Respects NotificationPreference (emailEnabled +
 * eventNotifications) the same way sendPracticePlanNotifications does.
 */
export async function sendGameProposalNotifications(
  proposalId: string,
  change: GameProposalChange
): Promise<void> {
  const proposal = await prisma.gameProposal.findUnique({
    where: { id: proposalId },
    include: {
      proposingTeam: { select: { id: true, name: true } },
      receivingTeam: { select: { id: true, name: true } },
      entries: {
        orderBy: { createdAt: "asc" },
        include: { venue: { select: { name: true, timezone: true } } },
      },
    },
  });

  if (!proposal) {
    throw new Error("Game proposal not found");
  }

  // The most recent entry records the action that triggered this
  // notification; the other side is the one that must hear about it.
  const lastEntry = proposal.entries[proposal.entries.length - 1];
  if (!lastEntry) {
    throw new Error("Game proposal has no entries");
  }
  const actingTeam =
    lastEntry.actorTeamId === proposal.proposingTeam.id
      ? proposal.proposingTeam
      : proposal.receivingTeam;
  const recipientTeam =
    actingTeam.id === proposal.proposingTeam.id ? proposal.receivingTeam : proposal.proposingTeam;

  // Current terms live on the latest PROPOSE/COUNTER entry; render its times
  // in the venue's timezone when known, else the platform fallback.
  const terms = [...proposal.entries]
    .reverse()
    .find((entry) => entry.kind === "PROPOSE" || entry.kind === "COUNTER");
  const timezone = terms?.venue?.timezone || FALLBACK_TIME_ZONE;
  const startFormatted = terms?.startAt ? formatDateTime(terms.startAt, timezone) : "To be determined";
  const endFormatted = terms?.endAt ? formatDateTime(terms.endAt, timezone) : null;
  const venueName = terms?.venue?.name || "To be determined";
  const latestNote = [...proposal.entries].reverse().find((entry) => entry.note)?.note ?? null;

  // Recipients: ADMINs of the non-acting side, filtered by notification
  // preferences (no preferences set defaults to sending).
  const admins = await prisma.teamMember.findMany({
    where: { teamId: recipientTeam.id, role: "ADMIN" },
    select: {
      user: {
        select: {
          email: true,
          notificationPreferences: {
            select: {
              eventNotifications: true,
              emailEnabled: true,
            },
          },
        },
      },
    },
  });

  const emails = admins
    .filter((member) => {
      const prefs = member.user.notificationPreferences;
      // If no preferences set, default to sending
      if (prefs.length === 0) return true;
      // Check if any preference disables event notifications or email
      return prefs.every((p) => p.eventNotifications && p.emailEnabled);
    })
    .map((member) => member.user.email);

  // No eligible recipients — skip sending to avoid Mailchimp 400 error
  if (emails.length === 0) {
    return;
  }

  const matchup = `${proposal.proposingTeam.name} vs ${proposal.receivingTeam.name}`;
  const proposalsLink = `${BASE_URL}/seasons/proposals`;

  const subjects: Record<GameProposalChange, string> = {
    created: `New game proposal from ${actingTeam.name}`,
    countered: `${actingTeam.name} countered your game proposal`,
    accepted: `${actingTeam.name} accepted your game proposal`,
    declined: `${actingTeam.name} declined your game proposal`,
    withdrawn: `${actingTeam.name} withdrew the game proposal`,
  };
  const headlines: Record<GameProposalChange, string> = {
    created: "New Game Proposal",
    countered: "Game Proposal Countered",
    accepted: "Game Proposal Accepted",
    declined: "Game Proposal Declined",
    withdrawn: "Game Proposal Withdrawn",
  };
  const leads: Record<GameProposalChange, string> = {
    created: `${actingTeam.name} has proposed a game with ${recipientTeam.name}.`,
    countered: `${actingTeam.name} has counter-proposed new terms for your game proposal.`,
    accepted: `${actingTeam.name} has accepted the game proposal. The game has been added to the schedule.`,
    declined: `${actingTeam.name} has declined the game proposal.`,
    withdrawn: `${actingTeam.name} has withdrawn the game proposal.`,
  };
  const colors: Record<GameProposalChange, string> = {
    created: "#1976D2",
    countered: "#FF9800",
    accepted: "#43A047",
    declined: "#D32F2F",
    withdrawn: "#D32F2F",
  };
  const color = colors[change];

  const mailchimp = getMailchimpClient();

  const message: {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: Array<{ email: string; type: "to" }>;
  } = {
    from_email: EMAIL_FROM,
    subject: subjects[change],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${color};">${headlines[change]}</h2>

        <p>${leads[change]}</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${color};">
          <h3 style="margin-top: 0; color: #333;">${matchup}</h3>
          <p style="margin: 10px 0;"><strong>Start:</strong> ${startFormatted}</p>
          ${endFormatted ? `<p style="margin: 10px 0;"><strong>End:</strong> ${endFormatted}</p>` : ""}
          <p style="margin: 10px 0;"><strong>Venue:</strong> ${venueName}</p>
          ${latestNote ? `<p style="margin: 10px 0;"><strong>Note:</strong> ${latestNote}</p>` : ""}
        </div>

        <p style="margin: 30px 0;">
          <a href="${proposalsLink}"
             style="background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Review Proposal
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${proposalsLink}">${proposalsLink}</a>
        </p>
      </div>
    `,
    text: `${headlines[change]}

${leads[change]}

${matchup}
Start: ${startFormatted}
${endFormatted ? `End: ${endFormatted}` : ""}
Venue: ${venueName}
${latestNote ? `Note: ${latestNote}` : ""}

Review the proposal at:
${proposalsLink}`,
    to: emails.map((email) => ({ email, type: "to" as const })),
  };

  try {
    await mailchimp.messages.send({ message });
  } catch (error) {
    console.error("Error sending game proposal notification email:", error);
    throw new Error("Failed to send game proposal notification email");
  }
}
