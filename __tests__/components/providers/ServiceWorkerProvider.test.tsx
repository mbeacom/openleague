import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServiceWorkerProvider, { canRegisterServiceWorker, registerServiceWorker } from '@/components/providers/ServiceWorkerProvider';

const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'serviceWorker');

function mockServiceWorker(register = vi.fn().mockResolvedValue({ scope: '/' })) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });

  return register;
}

describe('ServiceWorkerProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();

    if (originalServiceWorkerDescriptor) {
      Object.defineProperty(window.navigator, 'serviceWorker', originalServiceWorkerDescriptor);
    } else {
      Reflect.deleteProperty(window.navigator, 'serviceWorker');
    }
  });

  it('registers the root service worker on supported origins', async () => {
    const register = mockServiceWorker();

    await registerServiceWorker();

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('never registers in development and drops a worker left by an earlier session', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const unregister = vi.fn().mockResolvedValue(true);
    const register = vi.fn();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register, getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });

    await expect(registerServiceWorker()).resolves.toBeNull();

    expect(register).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it('does not register when service workers are unsupported', async () => {
    Reflect.deleteProperty(window.navigator, 'serviceWorker');

    expect(canRegisterServiceWorker()).toBe(false);
    await expect(registerServiceWorker()).resolves.toBeNull();
  });

  it('registers after the window load event when the provider mounts early', async () => {
    const register = mockServiceWorker();
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');

    render(<ServiceWorkerProvider />);
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });

    readyState.mockRestore();
  });
});