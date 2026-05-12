import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  isAnalyticsOptedOut,
  setAnalyticsConsent,
  trackClientError,
  trackConversion,
  trackEngagement,
  trackEvent,
  trackNavigation,
  trackWebVital,
} from '@/lib/analytics/tracking';

function setNavigatorPrivacyFlag(key: 'doNotTrack' | 'globalPrivacyControl', value: string | boolean | undefined) {
  Object.defineProperty(window.navigator, key, {
    configurable: true,
    value,
  });
}

function getAnalyticsWindow() {
  return window as unknown as Window & Record<string, unknown>;
}

describe('marketing analytics tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    delete getAnalyticsWindow().gtag;
    delete getAnalyticsWindow()['ga-disable-G-TEST123'];
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST123';
    setNavigatorPrivacyFlag('doNotTrack', '0');
    setNavigatorPrivacyFlag('globalPrivacyControl', false);
  });

  it('tracks conversion events through GA4 when available', () => {
    const gtag = vi.fn();
    getAnalyticsWindow().gtag = gtag;

    trackConversion('hero_get_started_click', 'hero_section', 1);

    expect(gtag).toHaveBeenCalledWith('event', 'hero_get_started_click', {
      event_category: 'conversion',
      event_label: 'hero_section',
      value: 1,
    });
  });

  it('tracks engagement and navigation categories', () => {
    const gtag = vi.fn();
    getAnalyticsWindow().gtag = gtag;

    trackEngagement('hero_section_view', 'landing_page');
    trackNavigation('header_sign_in_click', 'header');

    expect(gtag).toHaveBeenNthCalledWith(1, 'event', 'hero_section_view', {
      event_category: 'engagement',
      event_label: 'landing_page',
      value: undefined,
    });
    expect(gtag).toHaveBeenNthCalledWith(2, 'event', 'header_sign_in_click', {
      event_category: 'navigation',
      event_label: 'header',
      value: undefined,
    });
  });

  it('does not throw when GA4 is unavailable', () => {
    expect(() => trackConversion('signup_start')).not.toThrow();
  });

  it('does not send events when GA4 is not configured', () => {
    const gtag = vi.fn();
    getAnalyticsWindow().gtag = gtag;
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = '';

    trackConversion('signup_start');

    expect(gtag).not.toHaveBeenCalled();
  });

  it('respects Do Not Track, Global Privacy Control, and denied consent', () => {
    const gtag = vi.fn();
    getAnalyticsWindow().gtag = gtag;

    setNavigatorPrivacyFlag('doNotTrack', '1');
    expect(isAnalyticsOptedOut()).toBe(true);
    trackConversion('blocked_by_dnt');
    expect(gtag).not.toHaveBeenCalled();

    setNavigatorPrivacyFlag('doNotTrack', '0');
    setNavigatorPrivacyFlag('globalPrivacyControl', true);
    expect(isAnalyticsOptedOut()).toBe(true);
    trackConversion('blocked_by_gpc');
    expect(gtag).not.toHaveBeenCalled();

    setNavigatorPrivacyFlag('globalPrivacyControl', false);
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, 'denied');
    expect(isAnalyticsOptedOut()).toBe(true);
    trackConversion('blocked_by_consent');
    expect(gtag).not.toHaveBeenCalled();
  });

  it('stores consent and toggles GA disable flag', () => {
    setAnalyticsConsent('denied');

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('denied');
    expect(getAnalyticsWindow()['ga-disable-G-TEST123']).toBe(true);

    setAnalyticsConsent('granted');

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('granted');
    expect(getAnalyticsWindow()['ga-disable-G-TEST123']).toBe(false);
  });

  it('keeps GA disabled when privacy signals are active even after consent is granted', () => {
    setNavigatorPrivacyFlag('doNotTrack', '1');

    setAnalyticsConsent('granted');

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('granted');
    expect(getAnalyticsWindow()['ga-disable-G-TEST123']).toBe(true);

    setNavigatorPrivacyFlag('doNotTrack', '0');
    setNavigatorPrivacyFlag('globalPrivacyControl', true);

    setAnalyticsConsent('granted');

    expect(getAnalyticsWindow()['ga-disable-G-TEST123']).toBe(true);
  });

  it('tracks web vitals with GA4-safe metric payloads', () => {
    const gtag = vi.fn();
    getAnalyticsWindow().gtag = gtag;

    trackWebVital({
      id: 'v3-123',
      name: 'LCP',
      value: 2450.4,
      delta: 2450.4,
      rating: 'needs-improvement',
      navigationType: 'navigate',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'web_vital_lcp', {
      event_category: 'engagement',
      event_label: 'v3-123',
      value: 2450,
      metric_name: 'LCP',
      metric_value: 2450.4,
      metric_delta: 2450.4,
      metric_rating: 'needs-improvement',
      navigation_type: 'navigate',
    });
  });

  it('tracks coarse client error events without messages or stack traces', () => {
    const gtag = vi.fn();
    getAnalyticsWindow().gtag = gtag;

    trackClientError('TypeError', 'window_error');

    expect(gtag).toHaveBeenCalledWith('event', 'client_error', {
      event_category: 'engagement',
      event_label: 'window_error',
      value: undefined,
      error_type: 'TypeError',
      error_context: 'window_error',
    });
  });

  it('handles GA4 exceptions gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getAnalyticsWindow().gtag = vi.fn(() => {
      throw new Error('gtag failed');
    });

    expect(() => trackEvent({ category: 'conversion', action: 'signup_start' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('Google Analytics tracking failed:', expect.any(Error));

    warnSpy.mockRestore();
  });
});
