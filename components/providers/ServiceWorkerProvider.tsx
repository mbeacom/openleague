'use client';

import { useEffect } from 'react';

const SERVICE_WORKER_PATH = '/sw.js';
const SERVICE_WORKER_SCOPE = '/';

function isLocalhost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function canRegisterServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  return window.location.protocol === 'https:' || isLocalhost(window.location.hostname);
}

/**
 * The dev server's chunk names are not content-hashed, so sw.js serving
 * /_next/static/ cache-first would keep running stale code after every edit.
 * Development never registers, and drops any worker an earlier session left.
 */
function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

export async function unregisterServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn('Service worker unregistration failed:', error);
  }
}

export async function registerServiceWorker() {
  if (isDevelopment()) {
    await unregisterServiceWorkers();
    return null;
  }

  if (!canRegisterServiceWorker()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
      scope: SERVICE_WORKER_SCOPE,
    });
  } catch (error) {
    console.warn('Service worker registration failed:', error);
    return null;
  }
}

export default function ServiceWorkerProvider() {
  useEffect(() => {
    if (!canRegisterServiceWorker()) {
      return;
    }

    const handleLoad = () => {
      void registerServiceWorker();
    };

    if (document.readyState === 'complete') {
      handleLoad();
      return;
    }

    window.addEventListener('load', handleLoad, { once: true });

    return () => {
      window.removeEventListener('load', handleLoad);
    };
  }, []);

  return null;
}