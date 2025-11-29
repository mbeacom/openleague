import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    pathname: '/',
    query: {},
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Toast context
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock ResizeObserver for canvas components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock HTMLCanvasElement.getContext for canvas-based components
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId: string) => {
  if (contextId === '2d') {
    return {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Array(4).fill(0) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({})),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      ellipse: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      textAlign: 'left',
      textBaseline: 'alphabetic',
    };
  }
  return null;
});

// Mock canvas toDataURL for thumbnail generation
HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,mockImageData');

// Mock environment variables
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.MAILCHIMP_API_KEY = 'test-mailchimp-api-key';
process.env.EMAIL_FROM = 'test@openleague.test';
