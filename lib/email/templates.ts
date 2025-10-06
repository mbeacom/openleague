import { mailchimpClient } from "./client";

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
    text: `
You've been invited to join ${data.teamName}

${data.inviterName} has invited you to join ${data.teamName} on openleague.

openleague is a free platform for managing sports teams. You'll be able to view the team roster, see upcoming games and practices, RSVP to events, and stay connected with your team.

Accept your invitation by visiting:
${invitationLink}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.
    `,
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
    text: `
You've been added to ${data.teamName}

${data.inviterName} has added you to ${data.teamName} on openleague.

You can now view the team roster, see upcoming games and practices, and RSVP to events.

Log in at: ${loginLink}
    `,
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
