# RSVP Feature Guide

## Quick Start

### For Team Members
1. Navigate to any event detail page
2. Click one of the three RSVP buttons:
   - **Going** (green) - You'll attend
   - **Maybe** (amber) - You're unsure
   - **Not Going** (red) - You can't attend
3. Your response is saved immediately
4. You'll receive a reminder email 48 hours before the event if you haven't responded

### For Team Admins
1. View any event detail page
2. See your RSVP buttons at the top
3. Scroll down to see the **Attendance Summary**:
   - Visual count cards for each status
   - Detailed member lists grouped by response
4. Use this information to plan for the event

## API Reference

### Server Action: `updateRSVP`

```typescript
import { updateRSVP } from "@/lib/actions/rsvp";

const result = await updateRSVP({
  eventId: "event-id",
  status: "GOING" | "NOT_GOING" | "MAYBE"
});

if (result.success) {
  console.log("RSVP updated:", result.data);
} else {
  console.error("Error:", result.error);
}
```

### Email Function: `sendRSVPReminders`

```typescript
import { sendRSVPReminders } from "@/lib/email/templates";

// Called by cron job
await sendRSVPReminders();
```

## Component Usage

### RSVPButtons Component

```tsx
import { RSVPButtons } from "@/components/features/events/RSVPButtons";

<RSVPButtons
  eventId="event-id"
  currentStatus="NO_RESPONSE" // or GOING, NOT_GOING, MAYBE
  onStatusChange={(status) => console.log("Status changed:", status)}
/>
```

### AttendanceView Component

```tsx
import { AttendanceView } from "@/components/features/events/AttendanceView";

<AttendanceView
  rsvps={[
    {
      id: "rsvp-id",
      status: "GOING",
      user: {
        id: "user-id",
        name: "John Doe",
        email: "john@example.com"
      }
    }
  ]}
/>
```

## Cron Job Setup

### Vercel (Automatic)
The `vercel.json` file is already configured. Cron runs automatically every hour.

### Manual Trigger (Testing)
```bash
curl -X GET https://your-domain.com/api/cron/rsvp-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### External Cron Service
Configure your service to call:
- **URL**: `https://your-domain.com/api/cron/rsvp-reminders`
- **Method**: GET
- **Schedule**: `0 * * * *` (every hour)
- **Header**: `Authorization: Bearer YOUR_CRON_SECRET`

## Database Schema

### RSVP Model
```prisma
model RSVP {
  id          String      @id @default(cuid())
  status      RSVPStatus  @default(NO_RESPONSE)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  userId      String
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  eventId     String
  event       Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([userId, eventId])
}

enum RSVPStatus {
  GOING
  NOT_GOING
  MAYBE
  NO_RESPONSE
}
```

## Email Templates

### RSVP Reminder Email
- **Subject**: "RSVP Reminder: [Event Title]"
- **Trigger**: 48 hours before event for NO_RESPONSE users
- **Content**:
  - Personalized greeting
  - Event details (type, date, location, opponent)
  - Call-to-action button
  - Direct link to event page

## Troubleshooting

### RSVP Not Saving
1. Check browser console for errors
2. Verify user is authenticated
3. Confirm user is a team member
4. Check network tab for failed requests

### Reminder Emails Not Sending
1. Verify `MAILCHIMP_API_KEY` is set
2. Check cron job is running (Vercel logs)
3. Confirm events exist in 48-hour window
4. Check email service logs

### Attendance View Not Showing
1. Verify user has ADMIN role
2. Check event has RSVPs initialized
3. Confirm component is rendered conditionally

## Performance Considerations

### Optimistic Updates
- UI updates immediately on button click
- Server action runs in background
- Automatic revert on error

### Database Queries
- Upsert operation for create/update
- Indexed on `userId` and `eventId`
- Efficient batch queries for reminders

### Email Sending
- Async operation (doesn't block UI)
- Individual emails for personalization
- Error handling per recipient

## Security

### Authorization Checks
- User must be authenticated
- User must be team member
- Admin-only attendance view

### Cron Endpoint Protection
- Optional `CRON_SECRET` environment variable
- Bearer token authentication
- Rate limiting (via Vercel)

## Accessibility

### RSVP Buttons
- Minimum 48px touch targets
- Clear color contrast (WCAG AA)
- Icon + text labels
- Keyboard navigation support

### Attendance View
- Semantic HTML structure
- Screen reader friendly
- Color + icon indicators
- Responsive layout

## Future Improvements

1. **Real-time Updates**: WebSocket for live attendance changes
2. **Bulk Actions**: Admin RSVP on behalf of members
3. **Analytics**: Attendance patterns and trends
4. **Notifications**: Browser push for reminders
5. **Custom Timing**: Configurable reminder schedules
