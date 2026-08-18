/**
 * The public auth surfaces, as whole path segments.
 *
 * Single source of truth because two components branch on it and used to
 * disagree: LayoutProvider decides whether a route gets the marketing chrome
 * (SkipLink, the `#main-content` landmark, MarketingFooter), and MarketingHeader
 * decides whether to render at all. When only the first two entries were listed
 * in both, `/forgot-password` and the three token routes fell through every
 * branch and rendered with no skip link and no main landmark, while `/login`
 * and `/signup` — same route group, same light pin from app/(auth)/layout.tsx —
 * got all of it.
 *
 * Keep in step with the directories under `app/(auth)/`.
 */
export const AUTH_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/confirm-email-change',
] as const;

/** True for an auth route itself or anything nested under it (token segments). */
export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
