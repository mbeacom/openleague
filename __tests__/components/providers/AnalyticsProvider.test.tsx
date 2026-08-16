import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsProvider from '@/components/providers/AnalyticsProvider';
import { trackClientError, trackWebVital } from '@/lib/analytics/tracking';

const useReportWebVitalsMock = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => vi.fn());
const scriptLoadCallbacks = vi.hoisted(() => new Map<string, () => void>());

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: useReportWebVitalsMock,
}));
vi.mock('next/navigation', () => ({ usePathname: pathnameMock }));
vi.mock('next/script', async () => {
  const { useEffect } = await import('react');
  function MockScript({
    id,
    src,
    children,
    onLoad,
    ...attributes
  }: {
    id?: string;
    src?: string;
    children?: string;
    onLoad?: () => void;
    'data-auto-track'?: string;
  }) {
    useEffect(() => {
      const element = document.createElement('script');
      if (id) element.id = id;
      if (src) element.src = src;
      if (children) element.textContent = children;
      if (attributes['data-auto-track']) {
        element.dataset.autoTrack = attributes['data-auto-track'];
      }
      document.head.appendChild(element);
      if (src && onLoad) scriptLoadCallbacks.set(src, onLoad);
      return () => {
        if (src) scriptLoadCallbacks.delete(src);
        element.remove();
      };
    }, [attributes, children, id, onLoad, src]);
    return null;
  }
  return { default: MockScript };
});
vi.mock('@/lib/analytics/tracking', () => ({
  ANALYTICS_CONSENT_STORAGE_KEY: 'openleague.analytics.consent',
  isAnalyticsOptedOut: vi.fn(() => false),
  trackClientError: vi.fn(),
  trackWebVital: vi.fn(),
}));

const CAPABILITY_ROUTE = '/gear-wishlist/capability-token';
type AnalyticsWindow = Window & { gtag?: ReturnType<typeof vi.fn> };

describe('AnalyticsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scriptLoadCallbacks.clear();
    pathnameMock.mockReturnValue('/');
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = 'umami-site';
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST';
    window.umami = { track: vi.fn(), identify: vi.fn() };
    (window as AnalyticsWindow).gtag = vi.fn();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('sends web vitals and coarse errors only on tracked routes', () => {
    render(<AnalyticsProvider />);
    const reportWebVital = useReportWebVitalsMock.mock.calls[0][0];
    reportWebVital({ id: 'v1', name: 'LCP', value: 1, delta: 1, rating: 'good', navigationType: 'navigate' });
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('private') }));

    expect(trackWebVital).toHaveBeenCalledTimes(1);
    expect(trackClientError).toHaveBeenCalledWith('TypeError', 'window_error');
  });

  it('disables automatic tracker page views at script initialization', () => {
    render(<AnalyticsProvider />);

    expect((document.querySelector('script[src*="cloud.umami.is"]') as HTMLScriptElement | null)?.dataset.autoTrack).toBe('false');
    expect(document.querySelector('#ga4-privacy-defaults')?.textContent).toContain('send_page_view: false');
  });

  it('sends an explicit pathname-only Umami page view', () => {
    render(<AnalyticsProvider />);
    scriptLoadCallbacks.get('https://cloud.umami.is/script.js')?.();

    expect(window.umami?.track).toHaveBeenCalledWith({ url: '/' });
  });

  it('does not initialize or manually track on a direct capability route', () => {
    pathnameMock.mockReturnValue(CAPABILITY_ROUTE);
    render(<AnalyticsProvider />);

    expect(document.querySelector('script[src*="cloud.umami.is"]')).toBeNull();
    expect(document.querySelector('#ga4-privacy-defaults')).toBeNull();
    expect(window.umami?.track).not.toHaveBeenCalled();
    expect((window as AnalyticsWindow).gtag).not.toHaveBeenCalled();
  });

  it('never emits a capability page view after delayed analytics initialization when storage fails', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    window.umami = undefined;
    (window as AnalyticsWindow).gtag = undefined;
    const { rerender } = render(<AnalyticsProvider />);
    const loadUmami = scriptLoadCallbacks.get('https://cloud.umami.is/script.js');
    const loadGa = scriptLoadCallbacks.get('https://www.googletagmanager.com/gtag/js?id=G-TEST');
    const umamiTrack = vi.fn();
    const gtagTrack = vi.fn();
    window.umami = { track: umamiTrack, identify: vi.fn() };
    (window as AnalyticsWindow).gtag = gtagTrack;

    pathnameMock.mockReturnValue(CAPABILITY_ROUTE);
    rerender(<AnalyticsProvider />);
    loadUmami?.();
    loadGa?.();

    expect(umamiTrack).not.toHaveBeenCalled();
    expect(gtagTrack).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="cloud.umami.is"]')).toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('uses manual non-capability page views after navigation back to a tracked path', () => {
    const { rerender } = render(<AnalyticsProvider />);
    pathnameMock.mockReturnValue(CAPABILITY_ROUTE);
    rerender(<AnalyticsProvider />);
    pathnameMock.mockReturnValue('/dashboard');
    rerender(<AnalyticsProvider />);

    expect(window.umami?.track).toHaveBeenCalledWith({ url: '/dashboard' });
    expect((window as AnalyticsWindow).gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
      page_path: '/dashboard',
      page_location: `${window.location.origin}/dashboard`,
    }));
  });
});
