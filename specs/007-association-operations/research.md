# Research: Association Operations

## R1. Association aggregate

**Decision**: Extend `League` as the association root.

**Rationale**: It already owns divisions, teams, memberships, seasons, events, messages, venue relationships, ice requests, signup events, payments, audit logs, and the merged gear catalog/inventory/custody/needs/wishlist domain.

**Alternatives considered**:

- New `Association` model — rejected because it would duplicate identity, ownership, authorization, and migration paths.
- Rename `League` immediately — rejected because it would create broad compatibility churn without user value.

## R2. Venue occupancy source

**Decision**: Add canonical `VenueReservation` records and make them the long-term venue-occupancy source. Keep the explicit name everywhere because `GearReservation` already exists for equipment custody.

**Rationale**: Existing occupancy is inferred independently from Events, season games, signup-event games, venue schedule blocks, and practices. Linked records can double-count, requestable offerings can falsely block inventory, and publication paths can bypass checks.

**Alternatives considered**:

- Keep the five-source union — rejected because aliases and publication races remain.
- Treat every schedule block as a reservation — rejected because an offering is not occupancy.
- Use only activity records — rejected because venue approval and owner allocation remain unrepresented.

## R3. Concurrency

**Decision**: Commit reservations and conflict checks in short serializable Prisma transactions with bounded retry.

**Rationale**: This keeps application access within Prisma, makes check-and-write atomic, and handles competing approvals without provider-specific raw SQL.

**Alternatives considered**:

- Check before transaction — rejected because another writer can commit between check and write.
- PostgreSQL exclusion constraints — rejected for venue occupancy because custom segment coexistence cannot be represented by a simple time-range constraint. The existing gear domain legitimately uses a migration-level exclusion constraint for one tagged unit because its overlap rule is a simple closed-world key/time invariant.
- Distributed lock service — rejected as unnecessary infrastructure and a self-hosting burden.

## R4. Linked activity representation

**Decision**: Add typed optional reservation relations to each venue-occupying domain record. A linked game/Event or practice/Event pair may share one reservation.

**Rationale**: Typed relations preserve referential integrity. Availability reads the reservation once, and schedule readers deduplicate by reservation ID.

**Alternatives considered**:

- Generic polymorphic activity links — rejected because the database cannot enforce referenced-record integrity.
- One reservation per alias — rejected because it recreates duplicate occupancy.

## R5. Migration strategy

**Decision**: Expand, dual-read, backfill, shadow-compare, migrate writers, cut over readers, then clean up.

**Rationale**: Existing commitments and possible overlaps must remain visible. Additive rollout supports rollback and allows a reconciliation report before old readers are removed.

**Alternatives considered**:

- Flag-day conversion — rejected because it offers poor rollback and can hide legacy collisions.
- Ignore existing data because the product is pre-launch — rejected because current deployments may already hold schedules and requests.

## R6. Season placement

**Decision**: Add a season-specific current placement while retaining immutable placement decisions.

**Rationale**: Updating a team's global division destroys the distinction between historical and current-season placement.

**Alternatives considered**:

- Continue using `Team.divisionId` — rejected because standings and historical schedules become ambiguous.
- Copy teams per season — rejected because it fragments team identity and membership.

## R7. Operational permissions

**Decision**: Add scoped capability grants separate from descriptive team-official roles and map an equipment-manager responsibility to the existing gear permission set.

**Rationale**: Associations need scheduler, registrar, treasurer, communications, coach, manager, volunteer, event, and equipment responsibilities at association, division, team, season, and event scopes. Gear already distinguishes league-admin inventory/wishlist work from team-admin need/request work; scoped grants should reuse those permissions.

**Alternatives considered**:

- Expand `LeagueRole` only — rejected because it cannot express bounded scopes.
- Treat `TeamOfficial` as authorization — rejected because public/descriptive roles must not silently grant power.

## R8. Public identity and content

**Decision**: Add publishable League/Team profile fields, stable slugs with redirect history, sanitized association/team content, and a safe link to the existing published token-protected gear wishlist.

**Rationale**: The existing association public surface is only an event rollup. Families need a stable home, team directory, schedules, and news while youth-private fields remain excluded.

**Alternatives considered**:

- Reuse dashboard objects in public pages — rejected because over-broad selects risk private-data disclosure.
- Automatically change slugs with names — rejected because shared links must remain stable.
- User-authored executable markup — rejected initially due security and moderation risk.

## R9. Volunteer coordination

**Decision**: Add season-wide volunteer needs and assignments rather than relying only on signup-event slots.

**Rationale**: Games, practices, and association operations need open/assigned/confirmed/completed fulfillment states across a season.

**Alternatives considered**:

- Model every need as a SignupEvent — rejected because it creates public registration and event semantics for routine operational shifts.

## R10. Notifications and audit

**Decision**: Reuse the existing generic `NotificationOutbox` and `NotificationService` established by ADR-0006 and add a bounded association-operations event registry and worker that claim only non-gear events. `gear-outbox-worker.ts` remains the exclusive claim/retry owner for `gear.*` events; low-level lease/retry helpers may be shared without transferring ownership. Federate general audit, venue activity, and append-only gear ledgers for review.

**Rationale**: The gear implementation already closes the commit-to-delivery gap, uses at-least-once processing, and delegates preferences/batching/provider ownership to `NotificationService`. Association operations should reuse that proven boundary. Worker lifecycle status must remain separate from terminal outcome so provider-accepted, batched, suppressed, stale/canceled, and failed results are distinguishable. Gear ledger records must remain authoritative and append-only rather than being copied into mutable general audit rows.

**Alternatives considered**:

- Best-effort audit after commit — rejected because failures can leave consequential actions without history.
- Claim delivery from provider acceptance alone — rejected because mailbox delivery is not established.
- A second association-specific outbox — rejected because it would duplicate retry, preference, batching, delivery, retention, and operational runbook behavior.
- Copy every gear ledger event into `AuditLog` — rejected because duplicated histories can drift and would weaken ADR-0006's authoritative append-only boundary.

## R11. Association export

**Decision**: Produce a schema-versioned JSON export for complete association-owned operational data—including gear projections and append-only ledger references with donor/custodian PII excluded or redacted—and retain focused CSV/ICS exports.

**Rationale**: JSON is non-proprietary, relationally expressive, streamable, and requires no mandatory storage or archive provider.

**Alternatives considered**:

- Provider-hosted export archives — rejected because core portability must work when proprietary storage is disabled.
- Database dump — rejected because it exposes platform internals and unrelated tenant data.
- CSV-only full export — rejected because cross-entity relationships become difficult to preserve.

## R12. Free and open service constraint

**Decision**: Core association operations have no platform fee, player entitlement, or proprietary-host dependency. Optional providers may charge their direct costs.

**Rationale**: The product is intended as a free, open-source public good for volunteer-run organizations. Self-hosting rights are insufficient if core functionality is technically gated.

**Alternatives considered**:

- Free teams but paid association operations — rejected for the core feature set because it conflicts with the stated product direction.
- Platform transaction commission — rejected for core operations; payment-provider fees may still apply when optional payments are enabled.

## R13. Existing gear capability integration

**Decision**: Treat merged PRs #331-#335 and accepted ADR-0006 as an implemented bounded context. Feature 007 integrates gear through capability grants, operations summaries, public wishlist navigation, durable notification infrastructure, federated audit views, and association export only.

**Rationale**: Gear already supports League-owned pooled and tagged inventory, storage locations, condition/status tracking, serializable inventory operations, team needs, custody reservations and allocations, pickup/return handoffs, public wishlists and in-kind pledges, append-only activity/movement ledgers, reminders, and a durable notification outbox. Replanning these entities would duplicate production code and create incompatible ownership or lifecycle semantics.

**Alternatives considered**:

- Fold gear into `VenueReservation` — rejected because equipment custody is League-owned, date-window based, and independent of venue space/time.
- Replace gear permissions with new association grants immediately — rejected because existing `Permission` checks are already enforced and tested; grants should map to them during compatibility rollout.
- Rebuild the public wishlist under association profile content — rejected because the existing token route, privacy boundary, pledge abuse controls, and telemetry scrubbing are already hardened.
