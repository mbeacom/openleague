export {
  ANALYTICS_CONSENT_STORAGE_KEY,
  isAnalyticsOptedOut,
  marketingEvents,
  setAnalyticsConsent,
  trackClientError,
  trackConversion,
  trackEngagement,
  trackEvent,
  trackNavigation,
  trackWebVital,
  type AnalyticsEvent,
  type WebVitalMetric,
} from './tracking';

import { trackEvent } from './tracking';

export const MarketingEvents = {
  HERO_CTA_CLICK: 'hero_cta_click',
  FEATURE_VIEW: 'feature_view',
  PRICING_VIEW: 'pricing_view',
  SIGNUP_START: 'signup_start',
  SIGNUP_COMPLETE: 'signup_complete',
  DOCS_VIEW: 'docs_view',
  CONTACT_FORM_SUBMIT: 'contact_form_submit',
} as const;

export function trackMarketingEvent(action: string, label?: string, value?: number) {
  trackEvent({
    category: 'marketing',
    action,
    label,
    value,
  });
}
