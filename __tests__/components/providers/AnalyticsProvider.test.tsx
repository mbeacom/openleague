import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsProvider from '@/components/providers/AnalyticsProvider';
import { trackClientError, trackWebVital } from '@/lib/analytics/tracking';

const useReportWebVitalsMock = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => vi.fn());
const scriptOnLoadHandlers = vi.hoisted(() => [] as Array<() => void>);

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: useReportWebVitalsMock,
}));

vi.mock('next/navigation', () => ({
  usePathname: pathnameMock,
}));

// Mirrors next/script's afterInteractive behaviour: the tag is injected
// imperatively rather than rendered as a React child, so removing it later
// cannot conflict with React's own DOM bookkeeping.
vi.mock('next/script', async () => {
  const { useEffect } = await import('react');

  const MockScript = ({
    id,
    src,
    onLoad,
  }: {
    id?: string;
    src?: string;
    onLoad?: () => void;
  }) => {
    useEffect(() => {
      const element = document.createElement('script');
      if (id) element.id = id;
      if (src) element.src = src;
      element.setAttribute('data-testid', id ?? src ?? '');
      document.head.appendChild(element);

      if (onLoad) {
        if (!scriptOnLoadHandlers.includes(onLoad)) scriptOnLoadHandlers.push(onLoad);
        onLoad();
      }

      return () => {
        element.remove();
      };
    }, [id, src, onLoad]);

    return null;
  };

  return { default: MockScript };
});

vi.mock('@/lib/analytics/tracking', () => ({
  ANALYTICS_CONSENT_STORAGE_KEY: 'openleague.analytics.consent',
  isAnalyticsOptedOut: vi.fn(() => false),
  trackClientError: vi.fn(),
  trackWebVital: vi.fn(),
}));

const GA_DISABLE_KEY = 'ga-disable-G-TEST';
const CAPABILITY_ROUTE = '/gear-wishlist/capability-token';

type AnalyticsWindow = Record<string, unknown>;

function gaDisabled(): unknown {
  return (window as unknown as AnalyticsWindow)[GA_DISABLE_KEY];
}


describe('AnalyticsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/');
    scriptOnLoadHandlers.length = 0;
    window.localStorage.clear();
    delete (window as unknown as AnalyticsWindow)[GA_DISABLE_KEY];
    window.umami = { track: vi.fn(), identify: vi.fn() };
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = 'umami-site';
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST';
  });

  afterEach(() => {
    // A tracked-route mount is the app's own resume path; draining it here keeps
    // the module-level tracker state from leaking into the next test.
    pathnameMock.mockReturnValue('/');
    render(<AnalyticsProvider />).unmount();
    window.localStorage.clear();
    delete (window as unknown as AnalyticsWindow)[GA_DISABLE_KEY];
    window.history.replaceState({}, '', '/');
  });

  it('forwards Core Web Vitals to analytics tracking', () => {
    render(<AnalyticsProvider />);

    expect(useReportWebVitalsMock).toHaveBeenCalledWith(expect.any(Function));

    const reportWebVital = useReportWebVitalsMock.mock.calls[0][0];
    const metric = {
      id: 'v3-123',
      name: 'LCP',
      value: 1200,
      delta: 1200,
      rating: 'good',
      navigationType: 'navigate',
    };

    reportWebVital(metric);

    expect(trackWebVital).toHaveBeenCalledWith(metric);
  });

  it('keeps the Core Web Vitals callback stable across renders', () => {
    const { rerender } = render(<AnalyticsProvider />);
    const firstCallback = useReportWebVitalsMock.mock.calls[0][0];

    rerender(<AnalyticsProvider />);

    expect(useReportWebVitalsMock.mock.calls[1][0]).toBe(firstCallback);
  });

  it('tracks coarse browser error types', () => {
    render(<AnalyticsProvider />);

    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('private details') }));

    expect(trackClientError).toHaveBeenCalledWith('TypeError', 'window_error');
  });

  it('tracks coarse unhandled rejection types', () => {
    render(<AnalyticsProvider />);

    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', {
      configurable: true,
      value: new RangeError('private details'),
    });

    window.dispatchEvent(rejection);

    expect(trackClientError).toHaveBeenCalledWith('RangeError', 'unhandled_rejection');
  });

  it('removes browser error listeners on unmount', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<AnalyticsProvider />);
    const errorListener = addListenerSpy.mock.calls.find(([eventName]) => eventName === 'error')?.[1];
    const rejectionListener = addListenerSpy.mock.calls.find(([eventName]) => eventName === 'unhandledrejection')?.[1];

    unmount();

    expect(removeListenerSpy).toHaveBeenCalledWith('error', errorListener);
    expect(removeListenerSpy).toHaveBeenCalledWith('unhandledrejection', rejectionListener);

    addListenerSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });

  it('does not initialize analytics or report telemetry on public wishlist capability routes', () => {
    pathnameMock.mockReturnValue('/gear-wishlist/capability-token');
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    render(<AnalyticsProvider />);

    expect(document.querySelector('[data-testid="https://cloud.umami.is/script.js"]')).toBeNull();
    expect(document.querySelector('[data-testid="ga4-privacy-defaults"]')).toBeNull();
    expect(document.querySelector('[data-testid*="googletagmanager"]')).toBeNull();

    const reportWebVital = useReportWebVitalsMock.mock.calls[0][0];
    reportWebVital({
      id: 'wishlist-lcp',
      name: 'LCP',
      value: 1200,
      delta: 1200,
      rating: 'good',
      navigationType: 'navigate',
    });

    expect(trackWebVital).not.toHaveBeenCalled();
    expect(trackClientError).not.toHaveBeenCalled();
    expect(addListenerSpy.mock.calls.some(([eventName]) => eventName === 'error')).toBe(false);
    expect(addListenerSpy.mock.calls.some(([eventName]) => eventName === 'unhandledrejection')).toBe(false);
    addListenerSpy.mockRestore();
  });

  it('renders the tracker tags on tracked routes', () => {
    render(<AnalyticsProvider />);

    expect(document.querySelector('[data-testid="https://cloud.umami.is/script.js"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="ga4-privacy-defaults"]')).not.toBeNull();
    expect(gaDisabled()).toBe(false);
  });

  it('disables loaded trackers when a client navigation lands on a capability route', () => {
    const { rerender } = render(<AnalyticsProvider />);
    const loadedUmami = window.umami;

    pathnameMock.mockReturnValue(CAPABILITY_ROUTE);
    rerender(<AnalyticsProvider />);

    expect(gaDisabled()).toBe(true);
    expect(window.localStorage.getItem('umami.disabled')).toBe('1');
    expect(window.localStorage.getItem('openleague.umami.disabled.owner')).toBe('1');
    expect(window.umami).not.toBe(loadedUmami);

    window.umami?.track('should-be-swallowed');

    expect(loadedUmami?.track).not.toHaveBeenCalled();
  });

  it('removes tracker script tags that are still in the document', () => {
    const strayTracker = document.createElement('script');
    strayTracker.src = 'https://cloud.umami.is/script.js';
    document.head.appendChild(strayTracker);

    pathnameMock.mockReturnValue(CAPABILITY_ROUTE);
    render(<AnalyticsProvider />);

    expect(document.querySelectorAll('script[src*="cloud.umami.is"]')).toHaveLength(0);
  });

  it('restores the trackers when the visitor navigates back to a tracked route', () => {
    const loadedUmami = window.umami;
    const { rerender } = render(<AnalyticsProvider />);

    pathnameMock.mockReturnValue(CAPABILITY_ROUTE);
    rerender(<AnalyticsProvider />);
    pathnameMock.mockReturnValue('/dashboard');
    rerender(<AnalyticsProvider />);

    expect(gaDisabled()).toBe(false);
    expect(window.localStorage.getItem('umami.disabled')).toBeNull();
    expect(window.localStorage.getItem('openleague.umami.disabled.owner')).toBeNull();
    expect(window.umami).toBe(loadedUmami);
  });

  it('never clears a visitor-owned umami opt-out', () => {
    window.localStorage.setItem('umami.disabled', '1');
    const { rerender } = render(<AnalyticsProvider />);

    pathnameMock.mockReturnValue(CAPABILITY_ROUTE);
    rerender(<AnalyticsProvider />);
    pathnameMock.mockReturnValue('/dashboard');
    rerender(<AnalyticsProvider />);

    expect(window.localStorage.getItem('umami.disabled')).toBe('1');
    expect(window.localStorage.getItem('openleague.umami.disabled.owner')).toBeNull();
  });

  it('disables the trackers on a same-tab click into a capability route', () => {
    render(<AnalyticsProvider />);
    const link = document.createElement('a');
    link.href = CAPABILITY_ROUTE;
    document.body.appendChild(link);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(gaDisabled()).toBe(true);
    expect(window.localStorage.getItem('umami.disabled')).toBe('1');

    link.remove();
  });

  it('keeps analytics running when a capability link opens in a new tab', () => {
    render(<AnalyticsProvider />);
    const link = document.createElement('a');
    link.href = CAPABILITY_ROUTE;
    link.target = '_blank';
    document.body.appendChild(link);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(gaDisabled()).toBe(false);
    expect(window.localStorage.getItem('umami.disabled')).toBeNull();

    link.remove();
  });

  it('keeps analytics running for clicks on non-capability links', () => {
    render(<AnalyticsProvider />);
    const link = document.createElement('a');
    link.href = '/dashboard';
    document.body.appendChild(link);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(gaDisabled()).toBe(false);

    link.remove();
  });

  it('disables the trackers when history is pushed to a capability route', () => {
    render(<AnalyticsProvider />);

    window.history.pushState({}, '', CAPABILITY_ROUTE);

    expect(gaDisabled()).toBe(true);
    expect(window.localStorage.getItem('umami.disabled')).toBe('1');
    expect(window.location.pathname).toBe(CAPABILITY_ROUTE);
  });

  it('leaves the trackers alone when history is pushed to a tracked route', () => {
    render(<AnalyticsProvider />);

    window.history.pushState({}, '', '/dashboard');

    expect(gaDisabled()).toBe(false);
    expect(window.localStorage.getItem('umami.disabled')).toBeNull();
  });

  it('reinstalls the history guard after each tracker script loads', () => {
    render(<AnalyticsProvider />);

    expect(scriptOnLoadHandlers.length).toBeGreaterThan(0);

    // A tracker that patched history after us must not stay outermost.
    const trackerPatched = vi.fn(window.history.pushState.bind(window.history));
    window.history.pushState = trackerPatched;
    scriptOnLoadHandlers.forEach((onLoad) => onLoad());

    window.history.pushState({}, '', CAPABILITY_ROUTE);

    expect(gaDisabled()).toBe(true);
    expect(trackerPatched).toHaveBeenCalled();
  });
});
