import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serviceWorker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const offlinePage = readFileSync(join(process.cwd(), 'public/offline.html'), 'utf8');

describe('public service worker', () => {
  it('uses a semantic cache schema version for predictable manual invalidation', () => {
    expect(serviceWorker).toContain("const CACHE_NAMESPACE = 'openleague-landing-cache'");
    expect(serviceWorker).toContain("const CACHE_SCHEMA_VERSION = 'v1.1.0'");
    expect(serviceWorker).toContain('${CACHE_NAMESPACE}-${CACHE_SCHEMA_VERSION}');
  });

  it('cleans up old semantic and legacy cache namespaces on activation', () => {
    expect(serviceWorker).toContain("const CACHE_CLEANUP_PREFIXES = [CACHE_NAMESPACE, 'openleague-performance']");
    expect(serviceWorker).toContain("cacheName.startsWith(`${prefix}-`)");
    expect(serviceWorker).toContain('![STATIC_CACHE, RUNTIME_CACHE].includes(cacheName)');
  });

  it('pre-caches the offline fallback and revalidating brand assets', () => {
    expect(serviceWorker).toContain("'/offline.html'");
    expect(serviceWorker).toContain("'/images/logo.webp'");
    expect(serviceWorker).toContain("'/images/alt-logo-transparent-background.png'");
    expect(serviceWorker).toContain("'/site.webmanifest'");
  });

  it('implements install, activate, and fetch handlers for offline support', () => {
    expect(serviceWorker).toContain("self.addEventListener('install'");
    expect(serviceWorker).toContain("self.addEventListener('activate'");
    expect(serviceWorker).toContain("self.addEventListener('fetch'");
    expect(serviceWorker).toContain('networkFirstNavigation');
    expect(serviceWorker).toContain('cacheFirst');
    expect(serviceWorker).toContain('staleWhileRevalidate');
  });

  it('does not cache API requests or private dashboard navigations', () => {
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).not.toContain("'/dashboard'");
    expect(serviceWorker).not.toContain("'/admin'");
  });

  it('serves the branded offline fallback for any navigation while only caching public pages', () => {
    expect(serviceWorker).toContain('if (isPublicPage && response.ok)');
    expect(serviceWorker).toContain("const offlineFallback = await caches.match('/offline.html')");
    expect(serviceWorker).toContain('if (offlineFallback)');
  });

  it('uses stale-while-revalidate for stable public assets instead of cache-first', () => {
    expect(serviceWorker).toContain("const CACHE_FIRST_ASSET_PREFIXES = [\n  '/_next/static/',\n]");
    expect(serviceWorker).toContain("const STALE_WHILE_REVALIDATE_ASSET_PREFIXES = [\n  '/images/',\n]");
    expect(serviceWorker).toContain('const STALE_WHILE_REVALIDATE_EXACT_ASSETS = new Set');
  });

  it('ships a branded offline fallback page', () => {
    expect(offlinePage).toContain('You are offline');
    expect(offlinePage).toContain('/images/logo.webp');
  });
});
