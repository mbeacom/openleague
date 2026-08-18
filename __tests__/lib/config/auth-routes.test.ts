import { describe, it, expect } from 'vitest';
import { AUTH_ROUTES, isAuthRoute } from '@/lib/config/auth-routes';

/**
 * LayoutProvider and MarketingHeader both branch on "is this an auth route",
 * and used to answer it from two private lists that agreed on only two of the
 * six. The consequence was structural, not cosmetic: /forgot-password and the
 * three token routes fell through every branch and rendered with no skip link
 * and no #main-content landmark, while /login and /signup — same route group,
 * same light pin — got both.
 */
describe('auth route roster', () => {
  it('covers every directory under app/(auth)', () => {
    expect([...AUTH_ROUTES]).toEqual([
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      '/confirm-email-change',
    ]);
  });

  it.each([...AUTH_ROUTES])('matches %s exactly', (route) => {
    expect(isAuthRoute(route)).toBe(true);
  });

  it('matches the token sub-routes', () => {
    expect(isAuthRoute('/reset-password/abc123')).toBe(true);
    expect(isAuthRoute('/verify-email/abc123')).toBe(true);
    expect(isAuthRoute('/confirm-email-change/abc123')).toBe(true);
  });

  // The bug that motivated whole-segment anchoring: a bare startsWith('/signup')
  // swallowed the public /signups pages and the authenticated /signup-events
  // dashboard, giving them a second copy of the marketing chrome.
  it.each(['/signups', '/signups/evt_1', '/signups/l/tok', '/signup-events', '/signup-events/evt_1/edit'])(
    'does not swallow %s',
    (route) => {
      expect(isAuthRoute(route)).toBe(false);
    }
  );

  it('does not match unrelated routes', () => {
    expect(isAuthRoute('/')).toBe(false);
    expect(isAuthRoute('/docs')).toBe(false);
    expect(isAuthRoute('/loginhelp')).toBe(false);
  });
});
