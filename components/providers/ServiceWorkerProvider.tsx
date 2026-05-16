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

export async function registerServiceWorker() {
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