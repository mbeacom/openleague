/**
 * Analytics tracking utilities for marketing conversion events
 * Supports Google Analytics 4 and other analytics platforms
 */

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
  if (typeof window !== 'undefined' && 'gtag' in window) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag('event', action, {
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

  if (typeof window !== 'undefined' && 'gtag' in window) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag('event', action, {
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

  if (typeof window !== 'undefined' && 'gtag' in window) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag('event', action, {
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