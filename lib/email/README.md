# Email

This directory contains email client configuration and templates.

## Files

- `client.ts` - Mailchimp Transactional Email client configuration
- `templates.ts` - Email templates and sending functions

## Pattern

### Client Configuration

```typescript
// lib/email/client.ts
import mailchimp from '@mailchimp/mailchimp_transactional';

export const emailClient = mailchimp(process.env.MAILCHIMP_API_KEY);
```

### Email Templates

```typescript
// lib/email/templates.ts
import { emailClient } from './client';

export async function sendInvitationEmail(
  email: string,
  teamName: string,
  token: string
) {
  const inviteUrl = `${process.env.NEXTAUTH_URL}/api/invitations/${token}`;

  await emailClient.messages.send({
    message: {
      from_email: process.env.EMAIL_FROM,
      to: [{ email }],
      subject: `Join ${teamName} on OpenLeague`,
      html: `
        <p>You've been invited to join ${teamName}!</p>
        <p><a href="${inviteUrl}">Click here to accept</a></p>
      `,
    },
  });
}
```

## Email Types

1. **Invitation Emails** - New member invitations
2. **Event Notifications** - Event created/updated/cancelled
3. **RSVP Reminders** - 48 hours before events
