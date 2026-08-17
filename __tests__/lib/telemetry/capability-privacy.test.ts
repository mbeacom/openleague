import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_TOKEN_REDACTION,
  isPublicCapabilityPath,
  isPublicCapabilityUrl,
  scrubCapabilityTokens,
  scrubTelemetryPayload,
} from '@/lib/telemetry/capability-privacy';

const TOKEN = 'cKq3zR8tLm5wX9pV2nH4';

describe('isPublicCapabilityPath', () => {
  it('matches the wishlist capability route', () => {
    expect(isPublicCapabilityPath(`/gear-wishlist/${TOKEN}`)).toBe(true);
  });

  it('ignores the query string and fragment', () => {
    expect(isPublicCapabilityPath(`/gear-wishlist/${TOKEN}?utm_source=x#items`)).toBe(true);
  });

  it('does not match the admin routes that merely mention the feature', () => {
    expect(isPublicCapabilityPath('/gear')).toBe(false);
    expect(isPublicCapabilityPath('/gear-wishlist')).toBe(false);
    expect(isPublicCapabilityPath('/dashboard/gear-wishlist/admin')).toBe(false);
  });

  it('treats a missing pathname as untracked', () => {
    expect(isPublicCapabilityPath(null)).toBe(false);
    expect(isPublicCapabilityPath(undefined)).toBe(false);
    expect(isPublicCapabilityPath('')).toBe(false);
  });
});

describe('isPublicCapabilityUrl', () => {
  it('matches absolute and relative capability URLs', () => {
    expect(isPublicCapabilityUrl(`https://openleague.app/gear-wishlist/${TOKEN}`)).toBe(true);
    expect(isPublicCapabilityUrl(`/gear-wishlist/${TOKEN}`)).toBe(true);
  });

  it('resolves against a base URL', () => {
    expect(isPublicCapabilityUrl(`gear-wishlist/${TOKEN}`, 'https://openleague.app/')).toBe(true);
  });

  it('does not match other routes', () => {
    expect(isPublicCapabilityUrl('https://openleague.app/dashboard')).toBe(false);
    expect(isPublicCapabilityUrl(null)).toBe(false);
  });
});

describe('scrubCapabilityTokens', () => {
  it('redacts the token from an absolute URL', () => {
    expect(scrubCapabilityTokens(`https://openleague.app/gear-wishlist/${TOKEN}`)).toBe(
      `https://openleague.app/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`
    );
  });

  it('keeps everything after the token so telemetry stays groupable', () => {
    expect(scrubCapabilityTokens(`/gear-wishlist/${TOKEN}?utm_source=email#items`)).toBe(
      `/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}?utm_source=email#items`
    );
  });

  it('redacts a percent-encoded token carried inside a query parameter', () => {
    expect(
      scrubCapabilityTokens(`https://openleague.app/login?callbackUrl=%2Fgear-wishlist%2F${TOKEN}`)
    ).toBe(
      `https://openleague.app/login?callbackUrl=%2Fgear-wishlist%2F${CAPABILITY_TOKEN_REDACTION}`
    );
  });

  it('redacts a token embedded in free-form text', () => {
    expect(scrubCapabilityTokens(`Failed to load /gear-wishlist/${TOKEN} for viewer`)).toBe(
      `Failed to load /gear-wishlist/${CAPABILITY_TOKEN_REDACTION} for viewer`
    );
  });

  it('redacts every occurrence in one string', () => {
    const scrubbed = scrubCapabilityTokens(
      `from /gear-wishlist/${TOKEN} to /gear-wishlist/other-${TOKEN}`
    );

    expect(scrubbed).not.toContain(TOKEN);
    expect(scrubbed).toBe(
      `from /gear-wishlist/${CAPABILITY_TOKEN_REDACTION} to /gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`
    );
  });

  it('preserves the parameterized route name Next.js reports', () => {
    expect(scrubCapabilityTokens('/gear-wishlist/[token]')).toBe('/gear-wishlist/[token]');
  });

  it('is idempotent', () => {
    const once = scrubCapabilityTokens(`/gear-wishlist/${TOKEN}`);

    expect(scrubCapabilityTokens(once)).toBe(once);
  });

  it('leaves unrelated strings untouched', () => {
    expect(scrubCapabilityTokens('/dashboard/gear/wishlists')).toBe('/dashboard/gear/wishlists');
    expect(scrubCapabilityTokens('')).toBe('');
  });
});

describe('scrubTelemetryPayload', () => {
  it('redacts tokens throughout a Sentry-shaped event', () => {
    const event = {
      transaction: `/gear-wishlist/${TOKEN}`,
      message: `GET /gear-wishlist/${TOKEN} failed`,
      request: {
        url: `https://openleague.app/gear-wishlist/${TOKEN}?ref=email`,
        headers: { Referer: `https://openleague.app/gear-wishlist/${TOKEN}` },
      },
      breadcrumbs: [
        { category: 'navigation', data: { from: '/gear', to: `/gear-wishlist/${TOKEN}` } },
      ],
      contexts: { trace: { op: 'navigation', description: `/gear-wishlist/${TOKEN}` } },
      tags: { route: `/gear-wishlist/${TOKEN}` },
    };

    const scrubbed = scrubTelemetryPayload(event);

    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
    expect(scrubbed.transaction).toBe(`/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`);
    expect(scrubbed.request.headers.Referer).toBe(
      `https://openleague.app/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`
    );
    expect(scrubbed.breadcrumbs[0].data.to).toBe(
      `/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`
    );
    expect(scrubbed.contexts.trace.description).toBe(
      `/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`
    );
  });

  it('returns the same payload object so Sentry keeps the event', () => {
    const event = { transaction: `/gear-wishlist/${TOKEN}` };

    expect(scrubTelemetryPayload(event)).toBe(event);
  });

  it('preserves non-string values', () => {
    const event = {
      timestamp: 1700000000,
      sampled: true,
      release: null,
      tags: { route: `/gear-wishlist/${TOKEN}` },
    };

    const scrubbed = scrubTelemetryPayload(event);

    expect(scrubbed.timestamp).toBe(1700000000);
    expect(scrubbed.sampled).toBe(true);
    expect(scrubbed.release).toBeNull();
    expect(scrubbed.tags.route).toBe(`/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`);
  });

  it('survives cyclic payloads', () => {
    const event: Record<string, unknown> = { transaction: `/gear-wishlist/${TOKEN}` };
    event.self = event;

    expect(() => scrubTelemetryPayload(event)).not.toThrow();
    expect(event.transaction).toBe(`/gear-wishlist/${CAPABILITY_TOKEN_REDACTION}`);
  });

  it('does not throw on frozen payloads', () => {
    const event = Object.freeze({ transaction: `/gear-wishlist/${TOKEN}` });

    expect(() => scrubTelemetryPayload(event)).not.toThrow();
  });

  it('does not mutate non-plain objects reachable from the payload', () => {
    const originalError = new Error(`/gear-wishlist/${TOKEN}`);
    const event = { extra: { originalException: originalError } };

    scrubTelemetryPayload(event);

    expect(event.extra.originalException).toBe(originalError);
    expect(originalError.message).toBe(`/gear-wishlist/${TOKEN}`);
  });

  it('handles empty payloads', () => {
    expect(scrubTelemetryPayload(null)).toBeNull();
    expect(scrubTelemetryPayload(undefined)).toBeUndefined();
  });
});
