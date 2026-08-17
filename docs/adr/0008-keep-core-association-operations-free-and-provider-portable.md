---
schemaVersion: 0.1.0
id: "0008"
title: "Keep core association operations free and provider-portable"
status: accepted
date: 2026-08-16
created: 2026-08-16
deciders: ["@mbeacom"]
tags: [product, open-source, portability, self-hosting, associations]
scope: org
reversibility: one-way-door
blastRadius: org
relatesTo: ["0003", "0006", "0007"]
affects:
  - type: path
    pattern: "lib/env.ts"
    note: Optional providers cannot become core association boot requirements.
  - type: path
    pattern: "lib/email/**"
    note: Core communication retains a provider seam and explicit failure behavior.
  - type: path
    pattern: "lib/media/**"
    note: Media remains optional and cannot gate core operations.
  - type: path
    pattern: "lib/actions/**"
    note: Core association actions cannot enforce paid entitlements or platform commissions.
  - type: path
    pattern: "app/api/**"
    note: Payment, export, and integration routes must preserve a free core path.
  - type: path
    pattern: "README.md"
  - type: path
    pattern: "DEPLOYMENT.md"
  - type: path
    pattern: "specs/**"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: specs/007-association-operations/plan.md
review:
  tier: async
  tierReason: >-
    This is a trust and product-boundary commitment that governs future
    entitlement, provider, payment, deployment, and feature decisions.
reviewBy: 2027-02-16
---

# ADR-0008: Keep core association operations free and provider-portable

## Context

OpenLeague is intended to be a free, fully open-source service for volunteer-run
teams and associations. Apache-2.0 already permits self-hosting, modification,
and redistribution, but license rights alone do not guarantee an operationally
free core. A feature can be open source while still requiring paid entitlements,
platform commissions, or proprietary providers to perform essential work.

Feature 007 expands the useful core from a team manager into an association
operating system: venue reservations, season scheduling, delegated officials
and volunteers, public pages, communications, utilization, audit visibility,
and data export. Those capabilities create a durable product boundary. If they
are gated behind per-player fees or mandatory provider services after
implementation, nonprofit associations would still need external spreadsheets
or a paid hosted tier to run a season.

The current repository already demonstrates both sides of the choice:

- PostgreSQL is portable and email has a provider seam.
- Payments and media are optional, but media is currently tied to one storage
  provider when enabled.
- Existing marketing text promises teams a free service while describing paid
  league/club tiers, which no longer matches the desired association direction.

The project therefore needs an explicit decision before association
capabilities, entitlements, exports, and integrations are implemented.

## Decision

We will keep core association operations free to use and provider-portable.

The core includes:

- association, division, team, season, game, practice, event, reservation,
  volunteer, communication, public-profile, utilization, audit-view, and export
  workflows;
- self-hosting support for those workflows; and
- documented, non-proprietary export of association-owned operational data.

Core capabilities will not require a per-player fee, association subscription,
platform transaction commission, or proprietary storage/hosting provider.
Optional payment, email, media, and managed infrastructure providers may charge
their direct service costs, but disabling them will not disable core scheduling,
registration, communication, reporting, or export.

Provider-specific integrations will sit behind explicit optional seams where a
core workflow needs the capability. Provider absence or failure will be visible
and will not silently discard or corrupt core records.

This decision does not restrict the Apache-2.0 rights of downstream users or
forks. It governs the OpenLeague project's core product and architecture.

## Options considered

At least two genuine alternatives, including doing nothing. An option no
competent engineer would choose is a straw man and scores zero.

### Option A: Free and provider-portable association core

| Dimension | Assessment |
|---|---|
| Nonprofit access | Associations can operate without a platform fee |
| Self-hosting | Core features work with documented commodity infrastructure |
| Sustainability | Hosting/provider costs remain real and must be funded separately |
| Architecture | Optional integrations require seams and graceful degradation |
| Trust | Product behavior matches the stated public-service direction |

### Option B: Free teams with paid association operations

**Pros:**

- Association features could directly fund hosted operations.
- A simple entitlement boundary could reduce hosted-service abuse.

**Cons:**

- The organizations with the greatest coordination burden remain dependent on a
  paid tier.
- Core feature design becomes coupled to billing and entitlement state.
- Self-hosting remains legally possible but is not equivalent to a free usable
  hosted service.

### Option C: Free core with platform commissions

**Pros:**

- Usage-linked revenue when optional payments are processed.
- No up-front association subscription.

**Cons:**

- Core operational choices become coupled to transaction volume.
- Associations pay more as participation grows.
- Payment-provider absence can pressure essential workflows into a proprietary
  path.

### Option D: Do nothing

Leave the boundary as marketing text and decide feature-by-feature.

This preserves short-term flexibility but lets optional providers and paid
tiers quietly become prerequisites. Future contributors would have no durable
constraint to distinguish core operations from optional convenience.

## Trade-offs

- The project cannot rely on core association subscriptions or commissions to
  fund development and hosting.
- Self-hosting documentation, provider seams, export compatibility, and
  graceful-degradation tests become ongoing maintenance obligations.
- Some integrations may ship later because a portable design takes longer than
  a provider-only path.
- The decision defines the core but does not solve who pays infrastructure,
  support, email delivery, payment-provider, or media-storage costs.
- Optional managed services must be described without implying that the core
  software itself requires them.

## Consequences

- Easier: pitch OpenLeague to nonprofit associations; preserve user trust;
  self-host; migrate data; test provider absence; distinguish essential
  operations from optional convenience.
- Harder: fund hosted operations; maintain portable provider seams; prevent
  accidental entitlement checks from entering core paths; support export and
  deployment documentation over time.
- **How we would know this was wrong:** the project cannot operate a sustainable
  public instance even with separately funded infrastructure, or maintaining
  provider portability consumes more than 25% of feature effort for two
  consecutive major releases without any active self-hosted use.
- Revisit if: project governance adopts a documented nonprofit cost-recovery
  model that preserves free core access; a provider-neutral standard replaces a
  maintained seam; or operational evidence shows the defined core cannot be
  delivered safely without bounded usage controls.

## Action items

1. [ ] Update README pricing/free-service language to match the ratified decision.
2. [ ] Add provider-absence acceptance tests for feature 007 core workflows.
3. [ ] Document full core self-hosting prerequisites and recurring operational costs.
4. [ ] Add schema-versioned association export before declaring feature 007 complete.
