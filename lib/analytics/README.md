# Analytics

This directory contains analytics and tracking utilities for the OpenLeague marketing site.

## Features

- Google Analytics 4 event tracking
- Marketing conversion tracking
- User engagement analytics
- Privacy-compliant tracking

## Usage

```typescript
import { trackConversion, trackEngagement, MarketingEvents } from '@/lib/analytics';

// Track a conversion event
trackConversion(MarketingEvents.SIGNUP_COMPLETE, 'hero_cta', 1);

// Track engagement
trackEngagement(MarketingEvents.FEATURE_VIEW, 'roster_management');
```

## Environment Variables

- `NEXT_PUBLIC_GA_MEASUREMENT_ID` - Google Analytics 4 Measurement ID
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry error tracking DSN (optional)
- `NEXT_PUBLIC_HOTJAR_ID` - Hotjar tracking ID (optional)
- `NEXT_PUBLIC_MIXPANEL_TOKEN` - Mixpanel analytics token (optional)

## Privacy

All tracking is designed to be privacy-compliant and respects user consent preferences.