---
schemaVersion: 0.1.0
id: "0009"
title: "Delegate association authority through scoped role grants"
status: accepted
date: 2026-08-19
created: 2026-08-19
deciders: ["@mbeacom"]
tags: [architecture, authorization, associations, least-privilege]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0002", "0003", "0006"]
affects:
  - type: path
    pattern: "lib/auth/capability-matrix.ts"
    note: The role/capability/scope allowlist; unlisted combinations fail closed.
  - type: path
    pattern: "lib/auth/capabilities.ts"
    note: Resolves capability from grants, scope ancestry, and legacy admin compatibility.
  - type: path
    pattern: "lib/utils/permissions.ts"
    note: Gear Permission checks consult equipment-manager grants through this one entry point.
  - type: path
    pattern: "lib/actions/association-roles.ts"
    note: Grant, revoke, list, and invite; only association administration may delegate.
  - type: path
    pattern: "lib/services/association-roles.ts"
    note: Scope normalization and invitation-acceptance application.
  - type: path
    pattern: "prisma/**"
    note: AssociationRoleGrant scope exclusivity and active-only uniqueness constraints.
  - type: path
    pattern: "specs/007-association-operations/**"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: specs/007-association-operations/plan.md
review:
  tier: async
  tierReason: >-
    The decision defines how every future association capability is authorized,
    and a permissive default anywhere in it becomes a privilege-escalation path.
reviewBy: 2027-02-19
---

# ADR-0009: Delegate association authority through scoped role grants

## Context

A nonprofit association runs on distributed volunteer labour. Ice must be
booked, rosters maintained, dues reconciled, announcements sent, gear issued,
and shifts staffed — by different people, most of whom should not be able to
touch the rest.

Before this decision the platform had three coarse levers: `LeagueUser.role`
(`LEAGUE_ADMIN`, `TEAM_ADMIN`, `MEMBER`), `TeamMember.role` (`ADMIN`,
`MEMBER`), and `VenueStaff` for venue organizations. Delegating any one
responsibility — "let the equipment manager issue jerseys" — meant granting
`LEAGUE_ADMIN`, which also grants payments, roster edits, audit access, and the
ability to promote others. Associations recruit volunteers for bounded jobs;
handing each of them the keys to everything is both unsafe and a recruiting
obstacle.

Two adjacent models were tempting shortcuts and are both wrong:

- `TeamOfficial` already records "Head Coach" and "Team Manager". These are
  *descriptive labels* printed on rosters, handed out freely, and not gated on
  anything. Reading authority from them would silently promote everyone an
  association ever labelled.
- `VenueStaff` already expresses scoped authority over venue inventory. Venue
  authority belongs to the venue organization, not to the association booking
  it; mirroring it into association grants would create two systems that
  disagree about who may approve ice.

ADR-0006 defines gear authorization in terms of the existing `Permission` enum,
checked by `lib/utils/permissions.ts`. Every gear action already calls that
entry point.

## Decision

`AssociationRoleGrant` is the single source of delegated association authority.

1. **One grant names one role at exactly one scope** — association, division,
   team, season, Event, or SignupEvent — owned by exactly one league. The
   database enforces this with a `CASE`-per-scope `CHECK`, so a row cannot name
   two scopes or a scope that disagrees with its `scopeType`.

2. **The role/capability/scope matrix is an allowlist.** A combination that is
   not written down authorizes nothing. New roles, new capabilities, and new
   scopes therefore fail closed until somebody states what they may do, rather
   than inheriting permissive behaviour from a default branch.

3. **Narrow grants never widen.** A team-scoped grant asked about
   association-wide work has no target to match and returns false. Division
   scope resolves through the division's *current* membership, so moving a team
   out of a division withdraws the delegate's reach without editing any grant.

4. **Gear delegation routes through the existing `Permission` checks.**
   Equipment managers are authorized inside `hasPermission`, consulted only
   after the access-level matrix has declined. A grant can therefore add
   authority but never loosen an existing rule — including the mandatory-`teamId`
   rule, which the grant path re-checks. No gear action learns about grants.

5. **`TeamOfficial` never grants capability, and `VenueStaff` is not mirrored.**
   Stated in the code, the backfill, and here, because both are recurring
   temptations.

6. **Only association administration may delegate.** A delegate cannot mint
   grants, so no one can widen their own authority.

7. **Uniqueness applies to ACTIVE grants only.** Revoked rows are retained as
   history; without the partial predicate, revoking a responsibility would
   permanently prevent granting it again.

Existing `LEAGUE_ADMIN` holders keep full capability through an explicit legacy
branch until `scripts/backfill-association-role-grants.ts` gives them real
grants, so enabling this cannot lock an association out of its own
administration.

## Consequences

Delegation becomes safe and legible: an administrator can hand out one job and
the recipient gets exactly that job. `listAssociationResponsibilityGrants`
gives a truthful answer to "who can do what", which the three coarse role
levers never could.

The cost is that authorization is now two systems during the transition —
grants plus the legacy access levels — and both are consulted on every check.
That is deliberate and temporary, but the legacy branch is load-bearing until
the backfill has run everywhere, and removing it early would revoke every
existing administrator at once.

Adding a capability now means editing the matrix, which is more friction than
adding a boolean. That friction is the point: it is what makes "unlisted fails
closed" true rather than aspirational.

## Alternatives considered

**Extend `LeagueRole` with more enum members.** Cheapest change, but roles
without scope cannot express "manages this one team" or "runs this one event",
which is most of what associations actually delegate.

**Derive capability from `TeamOfficial`.** The data is already there and
associations already maintain it. Rejected: those rows are labels, not grants,
and are handed out to anyone who should appear on a roster.

**A second authorization checker for gear.** Simpler to write, but the gear
actions call `hasPermission` and would never consult it, so equipment-manager
grants would silently do nothing.

## What would make this wrong

If associations turn out to delegate along axes the six scopes cannot express —
"all U12 teams at one venue", say — the scope column becomes a constraint rather
than a boundary, and a scope predicate would serve better than a scope id.

If the legacy compatibility branch is still present after the backfill has run
everywhere, it has become a permanent second authorization path rather than a
migration aid, and should be deleted.
