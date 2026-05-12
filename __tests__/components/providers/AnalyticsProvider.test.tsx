import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsProvider from '@/components/providers/AnalyticsProvider';
import { trackClientError, trackWebVital } from '@/lib/analytics/tracking';

const useReportWebVitalsMock = vi.hoisted(() => vi.fn());

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: useReportWebVitalsMock,
}));

vi.mock('@/lib/analytics/tracking', () => ({
  trackClientError: vi.fn(),
  trackWebVital: vi.fn(),
}));

describe('AnalyticsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
