/**
 * Analytics tracking utilities for marketing conversion events
 * Supports privacy-safe Google Analytics 4 event, conversion, web-vital,
 * and coarse client-error tracking.
 */

interface GtagWindow extends Window {
  gtag?: (...args: unknown[]) => void;
}

type AnalyticsParameterValue = string | number | boolean;

export const ANALYTICS_CONSENT_STORAGE_KEY = 'openleague.analytics.consent';

function getGtag(): NonNullable<GtagWindow['gtag']> | null {
  const gtag = typeof window !== 'undefined' ? (window as unknown as GtagWindow).gtag : undefined;

  if (typeof gtag === 'function') {
    return gtag;
  }

  return null;
}

function getAnalyticsWindow(): (Window & Record<string, unknown>) | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as unknown as Window & Record<string, unknown>;
}

function getGaMeasurementId() {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? '';
}

function hasDoNotTrackEnabled() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const navigatorWithPrivacy = navigator as Navigator & {
    doNotTrack?: string | null;
    globalPrivacyControl?: boolean;
  };

  return (
    navigatorWithPrivacy.doNotTrack === '1' ||
    navigatorWithPrivacy.doNotTrack === 'yes' ||
    navigatorWithPrivacy.globalPrivacyControl === true
  );
}

function hasStoredConsentDenied() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === 'denied';
  } catch {
    return false;
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function compactParameters(
  parameters: Record<string, AnalyticsParameterValue | undefined>
): Record<string, AnalyticsParameterValue> {
  return Object.fromEntries(
    Object.entries(parameters).filter((entry): entry is [string, AnalyticsParameterValue] => {
      const value = entry[1];
      return value !== undefined;
    })
  );
}

export function isAnalyticsOptedOut() {
  return hasDoNotTrackEnabled() || hasStoredConsentDenied();
}

export function setAnalyticsConsent(consent: 'granted' | 'denied') {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
  } catch {
    return;
  }

  const gaMeasurementId = getGaMeasurementId();
  const analyticsWindow = getAnalyticsWindow();

  if (gaMeasurementId && analyticsWindow) {
    const shouldDisableAnalytics = consent === 'denied' || hasDoNotTrackEnabled();
    analyticsWindow[`ga-disable-${gaMeasurementId}`] = shouldDisableAnalytics;
  }
}

export interface AnalyticsEvent {
  category: 'engagement' | 'conversion' | 'navigation' | 'marketing';
  action: string;
  label?: string;
  value?: number;
  parameters?: Record<string, AnalyticsParameterValue | undefined>;
}

/**
 * Track a GA4 event. No-op when analytics is unavailable or the browser/user
 * has opted out via Do Not Track, Global Privacy Control, or stored consent.
 */
export function trackEvent(event: AnalyticsEvent) {
  if (!getGaMeasurementId()) {
    return;
  }

  if (isAnalyticsOptedOut()) {
    return;
  }

  const gtag = getGtag();
  if (!gtag) {
    return;
  }

  try {
    gtag('event', event.action, {
      event_category: event.category,
      event_label: event.label,
      value: event.value,
      ...compactParameters(event.parameters ?? {}),
    });
  } catch (error) {
    console.warn('Google Analytics tracking failed:', error);
  }

  // Console logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('Analytics Event:', event);
  }
}

/**
 * Track a conversion event (button clicks, form submissions, etc.)
 */
export function trackConversion(action: string, label?: string, value?: number) {
  trackEvent({
    category: 'conversion',
    action,
    label,
    value,
  });

  // Future: Add other analytics platforms here (Mixpanel, Amplitude, etc.)
}

/**
 * Track engagement events (scrolling, time on page, etc.)
 */
export function trackEngagement(action: string, label?: string) {
  trackEvent({
    category: 'engagement',
    action,
    label,
  });
}

/**
 * Track navigation events (page views, link clicks, etc.)
 */
export function trackNavigation(action: string, label?: string) {
  trackEvent({
    category: 'navigation',
    action,
    label,
  });
}

export interface WebVitalMetric {
  id: string;
  name: string;
  value: number;
  delta?: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  navigationType?: string;
}

export function trackWebVital(metric: WebVitalMetric) {
  const value = metric.name === 'CLS'
    ? Math.round(metric.value * 1000)
    : Math.round(metric.value);

  trackEvent({
    category: 'engagement',
    action: `web_vital_${metric.name.toLowerCase()}`,
    label: metric.id,
    value,
    parameters: {
      metric_name: metric.name,
      metric_value: metric.value,
      metric_delta: metric.delta,
      metric_rating: metric.rating,
      navigation_type: metric.navigationType,
    },
  });
}

export function trackClientError(errorType: string, context: 'window_error' | 'unhandled_rejection') {
  trackEvent({
    category: 'engagement',
    action: 'client_error',
    label: context,
    parameters: {
      error_type: truncate(errorType, 64),
      error_context: context,
    },
  });
}

/**
 * Specific tracking functions for common marketing events
 */
export const marketingEvents = {
  // Hero section CTAs
  heroGetStartedClick: () => trackConversion('hero_get_started_click', 'hero_section'),
  heroSeeHowItWorksClick: () => trackConversion('hero_see_how_it_works_click', 'hero_section'),

  // Header CTAs
  headerSignUpClick: () => trackConversion('header_sign_up_click', 'header'),
  headerSignInClick: () => trackNavigation('header_sign_in_click', 'header'),

  // Feature exploration
  featuresPageView: () => trackNavigation('features_page_view', 'features'),
  pricingPageView: () => trackNavigation('pricing_page_view', 'pricing'),

  // Engagement
  heroSectionView: () => trackEngagement('hero_section_view', 'landing_page'),
  pageScroll: (percentage: number) => trackEngagement('page_scroll', `${percentage}%`),
};
