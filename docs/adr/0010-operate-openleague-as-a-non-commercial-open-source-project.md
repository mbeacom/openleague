---
schemaVersion: 0.1.0
id: "0010"
title: "Operate OpenLeague as a non-commercial open-source project"
status: proposed
date: 2026-09-05
created: 2026-09-05
deciders: ["@mbeacom"]
tags: [product, open-source, sustainability, trust]
scope: org
reversibility: one-way-door
blastRadius: org
relatesTo: ["0008"]
affects:
  - type: path
    pattern: "README.md"
    note: Public copy may not assert paid tiers, subscriptions, or a revenue model.
  - type: path
    pattern: "app/(marketing)/**"
    note: Marketing surfaces may not advertise a commercial tier or price.
  - type: path
    pattern: "lib/payments/**"
    note: Payment code may facilitate an association's own collections, never a platform take.
  - type: path
    pattern: "lib/actions/**"
    note: No action may gate behaviour on a purchased entitlement.
provenance:
  authoredBy: agent-drafted
review:
  tier: async
  tierReason: >-
    A public, durable promise about what the project will never charge for.
    Reversing it costs trust with the associations it asks to migrate.
reviewBy: 2027-09-05
---

# ADR-0010: Operate OpenLeague as a non-commercial open-source project

## Context

The public site and README described a two-tier model: free forever for teams,
with paid League & Club plans for multi-team organizations that "fund the free
team plan," plus future opt-in local sponsorships.

None of that exists. There is no price, no billing surface, no customer, and no
revenue. The Stripe Connect code in `lib/payments/` is inert in production —
`DEFAULT_PLATFORM_FEE_BPS` defaults to `0` and no `STRIPE_*` variable is set in
the production environment, so `isStripeConfigured` is false. The League & Club
feature list also advertised SSO, custom domains, and priority support, none of
which are implemented.

Advertising a commercial tier that does not exist is a straightforward accuracy
problem, and it is worst precisely where the project asks for the most trust:
volunteer-run associations deciding whether to move a season's operations onto
it. It also creates standing pressure to build entitlement gating that
[ADR-0008](./0008-keep-core-association-operations-free-and-provider-portable.md)
already refuses for core association operations. ADR-0008 committed to a free
core; it left open how the rest would be funded. This record closes that.

## Decision

We will operate OpenLeague as a non-commercial open-source project. There are no
paid tiers, no subscriptions, no advertising, and no platform commission on
payments the software facilitates. Public copy will say so plainly.

Where the software touches money, it does so only to help an association collect
its own dues or fees. The platform takes nothing.

## Options considered

### Option A: Non-commercial open source (chosen)

| Dimension | Assessment |
|---|---|
| Accuracy of public copy | Matches reality exactly; nothing to caveat |
| Pressure on ADR-0008 | Removed — the free core needs no funding story |
| Sustainability | Maintainer-funded hosting; portability is the guarantee |
| Reversibility | Poor. A public "never" is expensive to walk back |

### Option B: Free core with a paid multi-team tier

The previously advertised model.

**Pros:** funds hosting; a supported offering some associations prefer to buy;
keeps a path to paying for dedicated infrastructure or support.

**Cons:** none of it is built, so the copy would stay aspirational indefinitely;
requires an entitlement system, billing, and support commitments that no one is
staffed to deliver; introduces exactly the paid/unpaid boundary inside
association features that ADR-0008 was written to prevent.

### Option C: Do nothing

Leave the copy asserting a tier that does not exist.

**Cons:** the project keeps making a claim it cannot honour, to the audience
least able to absorb being wrong about it. Rejected.

## Trade-offs

The hosted instance at openl.app is funded personally by the maintainer, with no
revenue offsetting it. That caps how much hosted scale the project can absorb and
means there is no funded support commitment — associations get best-effort help,
not an SLA. If hosting cost becomes untenable the answer is self-hosting and data
portability, not a paywall. That is a real limitation, accepted deliberately.

## Consequences

- **Easier:** no entitlement gating, no billing surface, no pricing conversations,
  no paid/unpaid boundary to police inside features. ADR-0008's free-core
  commitment becomes unconditional rather than contingent on a funding model.
- **Harder:** hosted infrastructure is unfunded and maintainer-capped. The project
  cannot buy support capacity, dedicated IPs, or paid vendor tiers.
- **How we would know this was wrong:** hosted infrastructure cost exceeds what
  the maintainer will personally fund, or associations decline to adopt because
  they require a contractual, supported offering. Either is a signal to revisit —
  by superseding this record, never by quietly reintroducing pricing copy.
- **Revisit if:** a governance change (foundation, grant, sponsorship) provides
  funding that does not require charging users, or by the review date above.

## Action items

1. [x] Remove paid-tier and revenue language from `README.md`,
   `app/(marketing)/about`, and `app/(marketing)/pricing`.
2. [x] Drop unimplemented capabilities (SSO, custom domain, priority support)
   from public feature copy.
3. [ ] Ratify this record, or reject it and restore an accurate description of
   an intended commercial model.
4. [ ] Decide whether `lib/payments/` should remain in the tree as
   association-facing collection support, or be removed.
