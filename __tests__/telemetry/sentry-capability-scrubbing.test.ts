import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  captureRouterTransitionStart: vi.fn(),
  captureRequestError: vi.fn(),
}));

const TOKEN = 'cKq3zR8tLm5wX9pV2nH4';
const REDACTED = '[redacted]';

const RUNTIMES = [
  { name: 'browser', module: '@/instrumentation-client' },
  { name: 'node server', module: '@/sentry.server.config' },
  { name: 'edge', module: '@/sentry.edge.config' },
] as const;

type SentryOptions = {
  sendDefaultPii?: boolean;
  beforeSend: (event: Record<string, unknown>, hint?: unknown) => Record<string, unknown>;
  beforeSendTransaction: (
    event: Record<string, unknown>,
    hint?: unknown
  ) => Record<string, unknown>;
  beforeSendSpan: (span: Record<string, unknown>) => Record<string, unknown>;
  beforeBreadcrumb: (breadcrumb: Record<string, unknown>) => Record<string, unknown>;
};

async function loadRuntime(modulePath: string): Promise<SentryOptions> {
  vi.resetModules();
  initMock.mockClear();
  await import(/* @vite-ignore */ modulePath);

  expect(initMock).toHaveBeenCalledTimes(1);
  return initMock.mock.calls[0][0] as SentryOptions;
}

describe('Sentry capability-token scrubbing', () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
  });

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    vi.resetModules();
  });

  describe.each(RUNTIMES)('$name runtime', ({ module }) => {
    it('registers every export hook and disables default PII', async () => {
      const options = await loadRuntime(module);

      expect(options.sendDefaultPii).toBe(false);
      expect(typeof options.beforeSend).toBe('function');
      expect(typeof options.beforeSendTransaction).toBe('function');
      expect(typeof options.beforeSendSpan).toBe('function');
      expect(typeof options.beforeBreadcrumb).toBe('function');
    });

    it('redacts the token from an error event', async () => {
      const options = await loadRuntime(module);

      const scrubbed = options.beforeSend(
        {
          message: `GET /gear-wishlist/${TOKEN} failed`,
          transaction: `/gear-wishlist/${TOKEN}`,
          request: {
            url: `https://openleague.app/gear-wishlist/${TOKEN}?ref=email`,
            headers: { Referer: `https://openleague.app/gear-wishlist/${TOKEN}` },
          },
          breadcrumbs: [{ data: { to: `/gear-wishlist/${TOKEN}` } }],
        },
        {}
      );

      expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
      expect(scrubbed.transaction).toBe(`/gear-wishlist/${REDACTED}`);
    });

    it('redacts the token from a transaction event', async () => {
      const options = await loadRuntime(module);

      const scrubbed = options.beforeSendTransaction(
        {
          type: 'transaction',
          transaction: `/gear-wishlist/${TOKEN}`,
          contexts: { trace: { op: 'navigation', description: `/gear-wishlist/${TOKEN}` } },
          spans: [{ description: `GET /gear-wishlist/${TOKEN}` }],
        },
        {}
      );

      expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
      expect(scrubbed.type).toBe('transaction');
    });

    it('redacts the token from a navigation span without dropping it', async () => {
      const options = await loadRuntime(module);
      const span = {
        span_id: 'abc123',
        op: 'navigation',
        description: `/gear-wishlist/${TOKEN}`,
        data: {
          'http.url': `https://openleague.app/gear-wishlist/${TOKEN}`,
          'http.method': 'GET',
        },
      };

      const scrubbed = options.beforeSendSpan(span);

      expect(scrubbed).toBeTruthy();
      expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
      expect((scrubbed.data as Record<string, string>)['http.method']).toBe('GET');
    });

    it('redacts the token from a navigation breadcrumb', async () => {
      const options = await loadRuntime(module);

      const scrubbed = options.beforeBreadcrumb({
        category: 'navigation',
        data: { from: '/dashboard/gear', to: `/gear-wishlist/${TOKEN}` },
      });

      expect(scrubbed).toBeTruthy();
      expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
      expect((scrubbed.data as Record<string, string>).from).toBe('/dashboard/gear');
    });

    it('redacts a percent-encoded token carried in a callback URL', async () => {
      const options = await loadRuntime(module);

      const scrubbed = options.beforeSend(
        {
          request: {
            url: `https://openleague.app/login?callbackUrl=%2Fgear-wishlist%2F${TOKEN}`,
          },
        },
        {}
      );

      expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
    });

    it('leaves telemetry for other routes untouched', async () => {
      const options = await loadRuntime(module);

      const scrubbed = options.beforeSend(
        { transaction: '/dashboard/gear', request: { url: 'https://openleague.app/dashboard/gear' } },
        {}
      );

      expect(scrubbed.transaction).toBe('/dashboard/gear');
    });

    it('does not initialize Sentry without a DSN', async () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      vi.resetModules();
      initMock.mockClear();

      await import(/* @vite-ignore */ module);

      expect(initMock).not.toHaveBeenCalled();
    });
  });
});
