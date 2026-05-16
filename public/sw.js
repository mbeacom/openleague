const CACHE_NAMESPACE = 'openleague-landing-cache';
// Bump patch for precache/offline asset changes, minor for routing strategy changes,
// and major for cache privacy boundary changes or incompatible service-worker behavior.
const CACHE_SCHEMA_VERSION = 'v1.0.0';
const CACHE_PREFIX = `${CACHE_NAMESPACE}-${CACHE_SCHEMA_VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}-static`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime`;
const CACHE_CLEANUP_PREFIXES = [CACHE_NAMESPACE, 'openleague-performance'];

const PRECACHE_URLS = [
  '/offline.html',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/images/logo.webp',
];

const PUBLIC_NAVIGATION_PREFIXES = [
  '/',
  '/about',
  '/blog',
  '/careers',
  '/contact',
  '/cookies',
  '/docs',
  '/features',
  '/get-started',
  '/pricing',
  '/privacy',
  '/rinks',
  '/security',
  '/terms',
];

const CACHE_FIRST_ASSET_PREFIXES = [
  '/_next/static/',
  '/images/',
];

const CACHE_FIRST_EXACT_ASSETS = new Set([
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
]);

function isPublicNavigationPath(pathname) {
  if (pathname === '/') {
    return true;
  }

  return PUBLIC_NAVIGATION_PREFIXES.some((prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

function isCacheFirstAsset(pathname) {
  return CACHE_FIRST_EXACT_ASSETS.has(pathname) || CACHE_FIRST_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }

  return response;
}

async function networkFirstNavigation(request, url) {
  const isPublicPage = isPublicNavigationPath(url.pathname);

  try {
    const response = await fetch(request);
    if (isPublicPage && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    if (isPublicPage) {
      const cachedPage = await caches.match(request);
      const offlineFallback = await caches.match('/offline.html');
      if (cachedPage) {
        return cachedPage;
      }
      if (offlineFallback) {
        return offlineFallback;
      }
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => (
            CACHE_CLEANUP_PREFIXES.some((prefix) => cacheName.startsWith(`${prefix}-`)) &&
            ![STATIC_CACHE, RUNTIME_CACHE].includes(cacheName)
          ))
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request, url));
    return;
  }

  if (isCacheFirstAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});