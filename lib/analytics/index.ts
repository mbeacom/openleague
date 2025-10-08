// Analytics utilities for marketing and conversion tracking

export interface AnalyticsEvent {
  event: string;
  category: 'engagement' | 'conversion' | 'navigation' | 'marketing';
  action: string;
  label?: string;
  value?: number;
}

// Google Analytics 4 event tracking
export function trackEvent(event: AnalyticsEvent) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event.action, {
      event_category: event.category,
      event_label: event.label,
      value: event.value,
    });
  }
}

// Track marketing conversion events
export function trackConversion(action: string, label?: string, value?: number) {
  trackEvent({
    event: 'conversion',
    category: 'conversion',
    action,
    label,
    value,
  });
}

// Track marketing engagement events
export function trackEngagement(action: string, label?: string) {
  trackEvent({
    event: 'engagement',
    category: 'engagement',
    action,
    label,
  });
}

// Track navigation events
export function trackNavigation(action: string, label?: string) {
  trackEvent({
    event: 'navigation',
    category: 'navigation',
    action,
    label,
  });
}

// Marketing-specific event tracking
export function trackMarketingEvent(action: string, label?: string, value?: number) {
  trackEvent({
    event: 'marketing',
    category: 'marketing',
    action,
    label,
    value,
  });
}

// Common marketing events
export const MarketingEvents = {
  HERO_CTA_CLICK: 'hero_cta_click',
  FEATURE_VIEW: 'feature_view',
  PRICING_VIEW: 'pricing_view',
  SIGNUP_START: 'signup_start',
  SIGNUP_COMPLETE: 'signup_complete',
  DOCS_VIEW: 'docs_view',
  CONTACT_FORM_SUBMIT: 'contact_form_submit',
} as const;

// Declare global gtag function for TypeScript
declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'js',
      targetId: string | Date,
      config?: Record<string, unknown>
    ) => void;
  }
}