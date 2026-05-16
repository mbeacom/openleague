import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';
import vercelConfig from '@/vercel.json';

const getHeaders = async () => {
  const headers = nextConfig.headers;
  if (!headers) {
    throw new Error('next.config.ts must define headers()');
  }

  return headers();
};

describe('Next.js performance configuration', () => {
  it('negotiates modern image formats with safe source fallbacks', () => {
    expect(nextConfig.images?.formats).toEqual(['image/avif', 'image/webp']);
    expect(nextConfig.images?.minimumCacheTTL).toBeGreaterThanOrEqual(604800);
  });

  it('adds revalidating caching for repository-local public image assets', async () => {
    const headers = await getHeaders();
    const imageHeaders = headers.find((entry) => entry.source === '/images/:path*')?.headers;

    expect(imageHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=86400, stale-while-revalidate=31536000',
    });
  });

  it('adds cache headers for app icons and the web app manifest', async () => {
    const headers = await getHeaders();
    const iconHeaders = headers.find((entry) => entry.source === '/favicon.ico')?.headers;
    const manifestHeaders = headers.find((entry) => entry.source === '/site.webmanifest')?.headers;
    const offlineHeaders = headers.find((entry) => entry.source === '/offline.html')?.headers;
    const serviceWorkerHeaders = headers.find((entry) => entry.source === '/sw.js')?.headers;

    expect(iconHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=86400, stale-while-revalidate=31536000',
    });
    expect(manifestHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=86400, stale-while-revalidate=604800',
    });
    expect(offlineHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=86400, stale-while-revalidate=604800',
    });
    expect(serviceWorkerHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=0, must-revalidate',
    });
  });

  it('allows service workers through the Content Security Policy', async () => {
    const headers = await getHeaders();
    const csp = headers
      .find((entry) => entry.source === '/:path*')
      ?.headers.find((header) => header.key === 'Content-Security-Policy')?.value;

    expect(csp).toContain("worker-src 'self'");
  });

  it('configures Vercel CDN headers for revalidating assets and service worker updates', () => {
    const imageHeaders = vercelConfig.headers.find((entry) => entry.source === '/images/(.*)')?.headers;
    const serviceWorkerHeaders = vercelConfig.headers.find((entry) => entry.source === '/sw.js')?.headers;

    expect(imageHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=86400, stale-while-revalidate=31536000',
    });
    expect(serviceWorkerHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=0, must-revalidate',
    });
  });
});
