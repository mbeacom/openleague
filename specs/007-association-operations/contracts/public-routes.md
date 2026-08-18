# Contract: Public Association Routes

## Routes

- `GET /associations/[slug]` — published association home.
- `GET /associations/[slug]/schedule` — public canonical schedule.
- `GET /associations/[slug]/events` — existing public signup-event rollup retained.
- `GET /associations/[slug]/teams` — published team directory.
- `GET /associations/[slug]/teams/[teamSlug]` — published team page.
- `GET /associations/[slug]/news/[contentSlug]` — published public content.
- `GET /api/associations/[slug]/schedule.ics` — public canonical calendar export.

Old slugs redirect permanently to the current safe route.

## Public Association Shape

- name, description, mission, logo/brand values;
- public contacts and approved links;
- published divisions and teams;
- public canonical schedule;
- public signup events;
- published public announcements/news;
- accepted public venue relationships.
- a link to the existing published token-protected gear wishlist when active.

## Public Team Shape

- public name, description, logo/brand values;
- association and division context;
- public schedule;
- published public announcements/news.

## Mandatory Exclusions

Public selectors never return:

- private roster or household details;
- guardian links or emergency contacts;
- attendance/RSVP responses;
- invitation tokens or pending grants;
- internal notes, conflict reasons, or audit details;
- payment credentials, private transaction notes, or refund details;
- gear storage details, stock projections, custody data, donor/custodian contact data, wishlist share tokens in page data, or notification-outbox records;
- private/member-only content;
- reservation owner details beyond public activity and unavailable-time display.

Unpublished associations, teams, and content return not found and are excluded from sitemap generation.
