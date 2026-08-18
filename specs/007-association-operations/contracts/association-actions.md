# Contract: Association Operations Actions

## Association and Team Profiles

- `updateAssociationPublicProfile`
- `publishAssociationPublicProfile`
- `unpublishAssociationPublicProfile`
- `updateTeamPublicProfile`
- `publishTeamPublicProfile`
- `changePublicSlug`

Publishing validates required identity, unique/stable address, branding values, contact safety, and public-selector privacy. Slug changes create redirects.

## Public Content

- `createPublicContent`
- `updatePublicContent`
- `schedulePublicContent`
- `publishPublicContent`
- `archivePublicContent`

Content is sanitized, scoped to association or team, audience-controlled, and audited. Scheduled publication is idempotent.

## Scoped Responsibilities

- `grantAssociationResponsibility`
- `revokeAssociationResponsibility`
- `listAssociationResponsibilityGrants`
- `inviteAssociationOperator`

The server derives the current user, validates scope ancestry, prevents privilege escalation, and never derives permissions from descriptive official labels. An equipment-manager grant maps to the existing gear permission checks; it does not bypass `lib/utils/permissions.ts` or rewrite gear authorization.

## Volunteers

- `createVolunteerNeed`
- `updateVolunteerNeed`
- `cancelVolunteerNeed`
- `assignVolunteer`
- `respondToVolunteerAssignment`
- `completeVolunteerAssignment`
- `markVolunteerAssignmentMissed`

Capacity-sensitive acceptance is atomic. Authorized organizers see fulfillment; volunteers see only their assignments and safe activity context.

## Operations Dashboard

`getAssociationOperationsData(leagueId, window)`

Returns:

- pending ice requests;
- confirmed unassigned reservations;
- upcoming assigned reservations;
- unresolved conflicts and migration overrides;
- unscheduled teams/phase gaps;
- volunteer shortages;
- urgent team gear needs and overdue gear custody;
- gear inventory attention and notification-outbox health summaries;
- recent operational changes.

Gear summaries use existing safe context projections. They never include donor/custodian contact data, private storage notes, capability tokens, or raw notification recipients.

## Utilization

`getAssociationUtilization(input)`

Filters by date, association/team, venue, surface, segment, and status. Returns duration totals and counts for offered, requested, confirmed, assigned, completed, released, canceled, and unused time. No raw private request notes are included in aggregate reports.

## Export

`GET /api/leagues/[leagueId]/export`

Authenticated file response containing schema-versioned association JSON. Only association administrators with export capability may use it. The export includes League-owned gear projections and append-only ledger references while excluding or redacting donor/custodian PII, private storage notes, capability/share tokens, notification recipient snapshots, secrets, credentials, and unrelated tenants. It writes success/failure audit outcomes.
