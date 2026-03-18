/**
 * Analytics tracking utilities for marketing conversion events
 * Supports Google Analytics 4 and other analytics platforms
 */

interface GtagWindow extends Window {
  gtag: (...args: unknown[]) => void;
}

function getGtag(): GtagWindow['gtag'] | null {
  if (typeof window !== 'undefined' && typeof (window as unknown as GtagWindow).gtag === 'function') {
    return (window as unknown as GtagWindow).gtag;
  }
  return null;
}

export interface AnalyticsEvent {
  event: string;
  category: 'engagement' | 'conversion' | 'navigation';
  action: string;
  label?: string;
  value?: number;
}

/**
 * Track a conversion event (button clicks, form submissions, etc.)
 */
export function trackConversion(action: string, label?: string, value?: number) {
  const event: AnalyticsEvent = {
    event: 'conversion',
    category: 'conversion',
    action,
    label,
    value,
  };

  // Google Analytics 4 (gtag)
  const gtag = getGtag();
  if (gtag) {
    gtag('event', action, {
      event_category: event.category,
      event_label: label,
      value: value,
    });
  }

  // Console logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('Analytics Event:', event);
  }

  // Future: Add other analytics platforms here (Mixpanel, Amplitude, etc.)
}

/**
 * Track engagement events (scrolling, time on page, etc.)
 */
export function trackEngagement(action: string, label?: string) {
  const event: AnalyticsEvent = {
    event: 'engagement',
    category: 'engagement',
    action,
    label,
  };

  const gtag = getGtag();
  if (gtag) {
    gtag('event', action, {
      event_category: event.category,
      event_label: label,
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('Analytics Event:', event);
  }
}

/**
 * Track navigation events (page views, link clicks, etc.)
 */
export function trackNavigation(action: string, label?: string) {
  const event: AnalyticsEvent = {
    event: 'navigation',
    category: 'navigation',
    action,
    label,
  };

  const gtag = getGtag();
  if (gtag) {
    gtag('event', action, {
      event_category: event.category,
      event_label: label,
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('Analytics Event:', event);
  }
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