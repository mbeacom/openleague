import type { Prisma } from "@prisma/client";

/**
 * Allowlist selectors for the public association and team pages
 * (feature 007 / User Story 4).
 *
 * Everything here is an explicit `select`, never an `include` and never a bare
 * model read. That is the whole privacy mechanism: a field reaches a public
 * page only because somebody wrote it down in this file, so adding a column to
 * `League`, `Team`, or `PublicContentItem` cannot leak it by default.
 *
 * Deliberately absent, and the reason each matters:
 *  - contact rows and roster entries — participant and guardian PII;
 *  - `contactEmail` / `contactPhone` on League — the *private* administrative
 *    contact; the public page uses `publicEmail` / `publicPhone`, which an
 *    administrator opts into separately;
 *  - Stripe account and fee fields — merchant configuration;
 *  - gear inventory, storage locations, custody, donors, and pledges — the
 *    public surface links a published wishlist by token and nothing more;
 *  - notification outbox state — operational data with recipient addresses in it.
 *
 * Mirrors lib/utils/public-venues.ts, which does the same job for rinks.
 */

/** A published, reachable association. */
export const publicPublishedAssociationWhere = {
  isActive: true,
  profileStatus: "PUBLISHED",
  slug: { not: null },
} as const satisfies Prisma.LeagueWhereInput;

/** A published, reachable team within one. */
export const publicPublishedTeamWhere = {
  isActive: true,
  profileStatus: "PUBLISHED",
  slug: { not: null },
} as const satisfies Prisma.TeamWhereInput;

export const publicAssociationSummarySelect = {
  id: true,
  name: true,
  slug: true,
  sport: true,
  publicDescription: true,
  logoUrl: true,
  brandPrimaryColor: true,
  brandSecondaryColor: true,
} as const satisfies Prisma.LeagueSelect;

export const publicTeamSummarySelect = {
  id: true,
  name: true,
  slug: true,
  sport: true,
  season: true,
  publicDescription: true,
  logoUrl: true,
  division: { select: { name: true, ageGroup: true } },
} as const satisfies Prisma.TeamSelect;

/**
 * Content readable by an anonymous visitor at `now`.
 *
 * Scheduled publication is a time-gated read rather than a job: an item becomes
 * visible because `publishAt` has passed, not because something ran at the
 * appointed minute. That is what makes it idempotent — and it means a missed
 * cron cannot silently withhold an announcement.
 */
export function publicContentWhere(now: Date) {
  return {
    visibility: "PUBLIC",
    status: { in: ["PUBLISHED", "SCHEDULED"] },
    publishAt: { lte: now },
    archivedAt: null,
  } as const satisfies Prisma.PublicContentItemWhereInput;
}

export const publicContentSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  publishAt: true,
  publishedAt: true,
  // Author identity is deliberately omitted: a volunteer who posts a schedule
  // change has not consented to having their name on a public page.
  team: { select: { name: true, slug: true } },
} as const satisfies Prisma.PublicContentItemSelect;

/** The full item, for the single-news-item page. */
export const publicContentDetailSelect = {
  ...publicContentSelect,
  body: true,
} as const satisfies Prisma.PublicContentItemSelect;

/**
 * The association home, assembled in one query.
 *
 * `take` bounds are presentational, not security: the `where` clauses above are
 * what make the result safe. Both are applied so a large association cannot
 * turn its landing page into an unbounded read.
 */
export function getPublicAssociationProfileSelect(now: Date) {
  return {
    ...publicAssociationSummarySelect,
    publicEmail: true,
    publicPhone: true,
    divisions: {
      where: { isActive: true },
      select: { id: true, name: true, ageGroup: true },
      orderBy: { name: "asc" },
    },
    teams: {
      where: publicPublishedTeamWhere,
      select: publicTeamSummarySelect,
      orderBy: { name: "asc" },
    },
    publicContentItems: {
      where: publicContentWhere(now),
      select: publicContentSelect,
      orderBy: { publishAt: "desc" },
      take: 10,
    },
    // Linked by token only, and only while published. The items, donors,
    // pledges, and custodians are never selected here.
    gearWishlist: {
      where: { status: "PUBLISHED" },
      select: { shareToken: true, title: true },
    },
  } as const satisfies Prisma.LeagueSelect;
}

export function getPublicTeamProfileSelect(now: Date) {
  return {
    ...publicTeamSummarySelect,
    league: { select: publicAssociationSummarySelect },
    publicContentItems: {
      where: publicContentWhere(now),
      select: publicContentSelect,
      orderBy: { publishAt: "desc" },
      take: 10,
    },
  } as const satisfies Prisma.TeamSelect;
}
