# Analytics

This directory contains analytics and tracking utilities for OpenLeague.

## Umami Analytics

OpenLeague uses [Umami](https://umami.is) for privacy-friendly, open-source web analytics.

### Setup

1. **Create a Umami account** at [cloud.umami.is](https://cloud.umami.is) or self-host Umami
2. **Add your website** and get your Website ID
3. **Configure environment variable** in `.env.local`:
   ```bash
   NEXT_PUBLIC_UMAMI_WEBSITE_ID="your-website-id-here"
   ```
4. The Umami tracking script will automatically load when the environment variable is set

**Note**: If `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is not set, Umami tracking will be disabled. This allows contributors to run the app without analytics in development.

### Event Tracking

Event tracking is implemented using the utilities in `umami.ts`. The module provides:

- **Type-safe event tracking** - Predefined event names in `UmamiEvents`
- **Helper functions** - `trackAuth()`, `trackTeam()`, `trackEventAction()`, `trackRSVP()`
- **Safe execution** - Automatically checks if Umami is loaded before tracking

### Tracked Events

#### Authentication Events
- `user-signup` - User creates account (includes invitation context)
- `user-login` - User logs in successfully
- `user-logout` - User logs out

#### Team Events
- `team-create` - Team is created (includes sport and season)
- `team-join` - User joins a team via invitation
- `team-leave` - User leaves a team

#### Event/Game Events
- `event-create` - Generic event created
- `game-create` - Game event created (includes opponent info)
- `practice-create` - Practice event created
- `event-update` - Event is updated
- `event-delete` - Event is deleted

#### RSVP Events
- `rsvp-going` - User responds "Going"
- `rsvp-not-going` - User responds "Not Going"
- `rsvp-maybe` - User responds "Maybe"

#### Navigation Events (Available for future use)
- `view-calendar` - User views calendar page
- `view-roster` - User views roster page
- `view-events` - User views events page
- `view-dashboard` - User views dashboard

### Usage Examples

```typescript
import { trackAuth, trackTeam, trackRSVP, trackEvent } from '@/lib/analytics/umami';

// Track authentication
trackAuth('signup', { hasInvitation: true });
trackAuth('login');

// Track team actions
trackTeam('create', { sport: 'Soccer', season: 'Fall 2025' });

// Track RSVP
trackRSVP('going', { eventId: '123' });

// Track custom events
trackEvent('custom-event-name', { custom: 'data' });
```

### Implementation Locations

Event tracking has been integrated into:

1. **Signup** - `app/(auth)/signup/page.tsx`
2. **Login** - `app/(auth)/login/page.tsx`
3. **Team Creation** - `components/features/team/CreateTeamForm.tsx`
4. **Event Creation/Update** - `components/features/events/EventForm.tsx`
5. **RSVP Actions** - `components/features/events/RSVPButtons.tsx`

### Adding New Events

To track a new event:

1. Add the event name to `UmamiEvents` in `umami.ts`
2. Use `trackEvent()` or create a helper function
3. Call it after the successful action completes

```typescript
// In umami.ts
export const UmamiEvents = {
  // ... existing events
  NEW_FEATURE_USED: 'new-feature-used',
} as const;

// In your component
import { trackEvent, UmamiEvents } from '@/lib/analytics/umami';

function handleNewFeature() {
  // ... do something
  trackEvent(UmamiEvents.NEW_FEATURE_USED, { feature: 'name' });
}
```

### Privacy & GDPR Compliance

Umami is GDPR-compliant and privacy-friendly:
- No cookies used
- No personal data collected
- Fully anonymous analytics
- Open source and self-hostable

### Event Data Limits

Per Umami documentation:
- Event names: max 50 characters
- Event data strings: max 500 characters
- Event data objects: max 50 properties
- Numbers: max 4 decimal places

### Viewing Analytics

Analytics can be viewed at: https://cloud.umami.is

**Note**: Contributors should use their own Umami Website ID for development and testing.

---

## Marketing Analytics

The marketing site also uses Google Analytics 4 for tracking conversions and engagement.

### Features

- Google Analytics 4 event tracking
- Marketing conversion tracking
- User engagement analytics
- Privacy-compliant tracking

### Usage

```typescript
import { trackConversion, trackEngagement, MarketingEvents } from '@/lib/analytics';

// Track a conversion event
trackConversion(MarketingEvents.SIGNUP_COMPLETE, 'hero_cta', 1);

// Track engagement
trackEngagement(MarketingEvents.FEATURE_VIEW, 'roster_management');
```

### Environment Variables

- `NEXT_PUBLIC_GA_MEASUREMENT_ID` - Google Analytics 4 Measurement ID
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry error tracking DSN (optional)
- `NEXT_PUBLIC_HOTJAR_ID` - Hotjar tracking ID (optional)
- `NEXT_PUBLIC_MIXPANEL_TOKEN` - Mixpanel analytics token (optional)

### Privacy

All tracking is designed to be privacy-compliant and respects user consent preferences.
