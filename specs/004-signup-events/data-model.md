# Data Model: Signup Events & Event Day Management

**Feature**: `004-signup-events` | **Date**: 2026-07-03

All money in cents (smallest currency unit). All timestamps UTC; display uses the
event's `timezone`. Naming, `@@map`, index, and cascade conventions follow the
existing venue/session models.

## New enums

```prisma
enum SignupEventStatus {
  DRAFT
  PUBLISHED
  CANCELED
  COMPLETED
}

enum SignupEventVisibility {
  PRIVATE      // host organizers/managers only
  INVITE_ONLY  // invitees (EventInvitation) only
  LINK         // anyone holding linkToken
  PUBLIC       // listed on host/venue pages and discovery
}

enum SignupEventCategory {
  CLINIC
  SCRIMMAGE
  TRYOUT
  VOLUNTEER
  FUNDRAISER
  TOURNAMENT
  SOCIAL
  OTHER
}

// Ordered ranks; stats allowed at/above STATS_MIN_AGE_LEVEL (default SQUIRT_U10).
enum AgeClassification {
  U6
  U8
  SQUIRT_U10
  PEEWEE_U12
  BANTAM_U14
  U16
  U18
  JUNIOR
  ADULT
  OPEN
}

enum EventRegistrationStatus {
  PENDING_PAYMENT // held spot awaiting online payment (30-min hold window)
  CONFIRMED
  WAITLISTED      // ordered by waitlistJoinedAt
  OFFERED         // promoted from waitlist; holds a spot until offerExpiresAt
  CANCELED
  EXPIRED         // lapsed hold or lapsed offer
  REFUNDED
}

enum ManualPaymentStatus {
  NOT_REQUIRED
  UNPAID
  PAID
  WAIVED
}

enum PhaseAudience {
  HOST_MEMBERS    // members of the hosting league/team/org (see R6)
  SELECTED_GROUPS // linked divisions/teams
  INVITEES        // EventInvitation holders
  EVERYONE        // anyone with view access
}

enum EventInvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
}

enum EventGameStatus {
  SCHEDULED
  COMPLETED
  CANCELED
}

enum IceUsage {
  FULL_ICE
  HALF_ICE
  CROSS_ICE
}

enum EventMediaKind {
  PHOTO
  VIDEO
}

enum EventMediaStatus {
  ACTIVE
  FLAGGED  // reported, pending organizer review; still hidden from non-organizers
  REMOVED
}

enum GalleryVisibility {
  PARTICIPANTS   // registrants + organizers (default)
  EVENT_AUDIENCE // whoever can view the event (per visibility tier)
}
```

## New model: SignupEvent

```prisma
model SignupEvent {
  id                String                @id @default(cuid())
  title             String
  description       String?
  category          SignupEventCategory   @default(OTHER)
  ageClassification AgeClassification     @default(OPEN)
  status            SignupEventStatus     @default(DRAFT)
  visibility        SignupEventVisibility @default(PRIVATE)
  // 32-byte crypto-random hex; set while visibility = LINK; regenerable.
  linkToken         String?               @unique

  startAt      DateTime
  endAt        DateTime
  // Copied from the venue (or host default) when set; display timezone.
  timezone     String   @default("America/New_York")
  locationText String?

  registrationOpensAt  DateTime?
  registrationClosesAt DateTime?
  cancellationCutoffAt DateTime?

  contactName  String?
  contactEmail String?
  contactPhone String?

  // Payment configuration. Online requires the host merchant to be onboarded.
  acceptsOnlinePayment Boolean @default(false)
  acceptsManualPayment Boolean @default(true)
  venmoHandle          String?
  zelleHandle          String?
  cashAppHandle        String?
  paymentPhone         String?
  paymentInstructions  String?

  galleryEnabled    Boolean           @default(true)
  galleryVisibility GalleryVisibility @default(PARTICIPANTS)
  // Opt-in public roster (first name + last initial only on public views).
  publicRoster      Boolean           @default(false)

  publishedAt DateTime?
  canceledAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Exactly one hosting entity (CHECK constraint; mirrors Venue ownership).
  hostOrganizationId String?
  hostOrganization   VenueOrganization? @relation(fields: [hostOrganizationId], references: [id], onDelete: Cascade)

  hostLeagueId String?
  hostLeague   League? @relation(fields: [hostLeagueId], references: [id], onDelete: Cascade)

  hostTeamId String?
  hostTeam   Team?   @relation(fields: [hostTeamId], references: [id], onDelete: Cascade)

  venueId String?
  venue   Venue?  @relation(fields: [venueId], references: [id], onDelete: SetNull)

  surfaces IceSurface[] @relation("SignupEventSurfaces")

  createdById String
  createdBy   User   @relation("SignupEventCreator", fields: [createdById], references: [id], onDelete: Restrict)

  updatedById String?
  updatedBy   User?   @relation("SignupEventUpdater", fields: [updatedById], references: [id], onDelete: SetNull)

  slots         SignupSlot[]
  phases        EventRegistrationPhase[]
  registrations EventRegistration[]
  invitations   EventInvitation[]
  managers      EventManager[]
  teams         EventTeam[]
  games         EventGame[]
  media         EventMediaItem[]

  @@index([hostOrganizationId, startAt])
  @@index([hostLeagueId, startAt])
  @@index([hostTeamId, startAt])
  @@index([venueId, startAt])
  @@index([status, visibility, startAt])
  @@map("signup_events")
}
```

## New model: SignupSlot

```prisma
model SignupSlot {
  id          String  @id @default(cuid())
  name        String  // "Goalie", "Skater", "Referee", "Coach", "Volunteer"…
  description String?
  sortOrder   Int     @default(0)
  // null = unlimited. Reducing below confirmed count never revokes; blocks new.
  capacity    Int?
  // null/0 = free.
  priceAmount   Int?
  priceCurrency String  @default("USD")
  waitlistEnabled Boolean @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  registrations EventRegistration[]

  @@index([eventId, sortOrder])
  @@map("signup_slots")
}
```

## New model: EventRegistrationPhase

```prisma
model EventRegistrationPhase {
  id        String        @id @default(cuid())
  name      String        // "Association members", "Open registration"
  opensAt   DateTime
  audience  PhaseAudience
  sortOrder Int           @default(0)
  createdAt DateTime      @default(now())

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  // Populated when audience = SELECTED_GROUPS.
  divisions Division[] @relation("PhaseDivisions")
  teams     Team[]     @relation("PhaseTeams")

  @@index([eventId, opensAt])
  @@map("event_registration_phases")
}
```

Phase eligibility is evaluated at request time (R6); registration closes for all
phases at `registrationClosesAt`. An event with no phases behaves as a single
EVERYONE phase opening at `registrationOpensAt`.

## New model: EventRegistration

One row per named participant per slot claim — including waitlist entries and
offers (status machine below).

```prisma
model EventRegistration {
  id     String                  @id @default(cuid())
  status EventRegistrationStatus @default(CONFIRMED)

  // Participant snapshot; the registrant (User) is the contact of record.
  participantName  String
  participantEmail String?
  participantPhone String?
  notes            String?
  // Organizer-set: may rotate through multiple games (US7).
  isFloater        Boolean @default(false)

  // Price snapshot in cents at registration time (never from client).
  unitAmount Int    @default(0)
  currency   String @default("USD")

  manualPaymentStatus     ManualPaymentStatus @default(NOT_REQUIRED)
  manualPaymentMarkedById String?
  manualPaymentMarkedBy   User?               @relation("ManualPaymentMarker", fields: [manualPaymentMarkedById], references: [id], onDelete: SetNull)

  waitlistJoinedAt DateTime? // FIFO key while WAITLISTED
  offerExpiresAt   DateTime? // set while OFFERED

  confirmedAt  DateTime?
  canceledAt   DateTime?
  checkedInAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  slotId String
  slot   SignupSlot @relation(fields: [slotId], references: [id], onDelete: Cascade)

  registrantId String
  registrant   User   @relation("EventRegistrant", fields: [registrantId], references: [id], onDelete: Cascade)

  // Optional link to a roster player (origin team/level context for US7).
  playerId String?
  player   Player? @relation(fields: [playerId], references: [id], onDelete: SetNull)

  checkedInById String?
  checkedInBy   User?   @relation("EventCheckInActor", fields: [checkedInById], references: [id], onDelete: SetNull)

  canceledById String?
  canceledBy   User?   @relation("EventRegistrationCanceler", fields: [canceledById], references: [id], onDelete: SetNull)

  payment            Payment?
  teamAssignment     EventTeamAssignment?
  gameParticipations EventGameParticipant[]
  gameStats          PlayerGameStat[]

  @@index([eventId, status])
  @@index([slotId, status, waitlistJoinedAt])
  @@index([registrantId])
  @@map("event_registrations")
}
```

### Status machine

```text
(register, free, capacity)          → CONFIRMED
(register, paid, capacity)          → PENDING_PAYMENT → webhook → CONFIRMED
                                      └ hold lapse / checkout expiry → EXPIRED
(register, full or phase closed)    → WAITLISTED
WAITLISTED → promotion →              OFFERED (offerExpiresAt = min(now+claim, startAt))
OFFERED  → claim (free)             → CONFIRMED
OFFERED  → claim (paid)             → PENDING_PAYMENT → webhook → CONFIRMED
OFFERED  → lapse                    → EXPIRED (next entry offered)
OFFERED  → decline                  → CANCELED
CONFIRMED → self/organizer cancel   → CANCELED (frees spot → sync promotion)
CONFIRMED → refund                  → REFUNDED (frees spot → sync promotion)
```

**Committed capacity per slot** = `CONFIRMED` + `PENDING_PAYMENT` with `createdAt`
inside the 30-minute hold window + `OFFERED` with `offerExpiresAt > now()`. Counted
inside the serializable reservation transaction (R4); lazy expiry means lapsed rows
stop counting even before the cron sweep flips them to `EXPIRED`.

**Duplicate guard** (app-level, in-transaction): reject when an active row
(`CONFIRMED`/`PENDING_PAYMENT`/`WAITLISTED`/`OFFERED`) exists with the same
`slotId + registrantId + lower(trim(participantName))` (R11).

## New model: EventInvitation

```prisma
model EventInvitation {
  id        String                @id @default(cuid())
  email     String
  // 32-byte crypto-random hex (invitation-token generator reused).
  token     String                @unique
  status    EventInvitationStatus @default(PENDING)
  expiresAt DateTime              // event startAt
  sentAt    DateTime              @default(now())
  acceptedAt DateTime?
  revokedAt  DateTime?

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  // Bound to an account when the email matches / signup completes.
  invitedUserId String?
  invitedUser   User?   @relation("EventInvitee", fields: [invitedUserId], references: [id], onDelete: SetNull)

  invitedById String
  invitedBy   User   @relation("EventInviter", fields: [invitedById], references: [id], onDelete: Restrict)

  @@unique([eventId, email])
  @@index([invitedUserId])
  @@map("event_invitations")
}
```

INVITE_ONLY access = signed-in user's email (case-insensitive) or `invitedUserId`
matches a non-revoked invitation — plus host staff and event managers.

## New model: EventManager

Per-event delegation (FR-028). A row grants full event-scoped management; host-entity
admins are implicit managers (no row needed). No role column — YAGNI until a second
grant level is required.

```prisma
model EventManager {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  userId String
  user   User   @relation("EventManagerUser", fields: [userId], references: [id], onDelete: Cascade)

  grantedById String
  grantedBy   User   @relation("EventManagerGrantor", fields: [grantedById], references: [id], onDelete: Restrict)

  @@unique([eventId, userId])
  @@map("event_managers")
}
```

## New models: EventTeam, EventTeamAssignment

```prisma
model EventTeam {
  id        String  @id @default(cuid())
  name      String  // "Red", "House Gold"
  colorHex  String?
  sortOrder Int     @default(0)
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  assignments EventTeamAssignment[]
  homeGames   EventGame[]           @relation("EventGameHome")
  awayGames   EventGame[]           @relation("EventGameAway")

  @@unique([eventId, name])
  @@map("event_teams")
}

model EventTeamAssignment {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  eventTeamId String
  eventTeam   EventTeam @relation(fields: [eventTeamId], references: [id], onDelete: Cascade)

  // @unique ⇒ at most one primary team per participant per event.
  registrationId String            @unique
  registration   EventRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  assignedById String
  assignedBy   User   @relation("EventTeamAssigner", fields: [assignedById], references: [id], onDelete: Restrict)

  @@index([eventTeamId])
  @@map("event_team_assignments")
}
```

Origin club team/level (US7 scenario 2) is derived at read time from
`registration.player → Player.team` when linked, else shown as "unaffiliated".

## New models: EventGame, EventGameParticipant, PlayerGameStat

```prisma
model EventGame {
  id       String          @id @default(cuid())
  name     String?         // "Game 1 — North half"
  status   EventGameStatus @default(SCHEDULED)
  startAt  DateTime
  endAt    DateTime
  iceUsage IceUsage        @default(FULL_ICE)
  zoneLabel String?        // "North half", "Cross-ice zone 2"
  // Writable only when isStatsEligible(event.ageClassification) (R10).
  homeScore Int?
  awayScore Int?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  surfaceId String?
  surface   IceSurface? @relation(fields: [surfaceId], references: [id], onDelete: SetNull)

  homeTeamId String
  homeTeam   EventTeam @relation("EventGameHome", fields: [homeTeamId], references: [id], onDelete: Cascade)

  awayTeamId String
  awayTeam   EventTeam @relation("EventGameAway", fields: [awayTeamId], references: [id], onDelete: Cascade)

  participants EventGameParticipant[]
  stats        PlayerGameStat[]

  @@index([eventId, startAt])
  @@index([surfaceId, startAt])
  @@map("event_games")
}

model EventGameParticipant {
  id String @id @default(cuid())

  gameId String
  game   EventGame @relation(fields: [gameId], references: [id], onDelete: Cascade)

  registrationId String
  registration   EventRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  // Which side they skate for in THIS game (floaters may differ from primary team).
  eventTeamId String
  eventTeam   EventTeam @relation(fields: [eventTeamId], references: [id], onDelete: Cascade)

  @@unique([gameId, registrationId])
  @@map("event_game_participants")
}

model PlayerGameStat {
  id      String @id @default(cuid())
  goals   Int    @default(0)
  assists Int    @default(0)
  notes   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  gameId String
  game   EventGame @relation(fields: [gameId], references: [id], onDelete: Cascade)

  registrationId String
  registration   EventRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  @@unique([gameId, registrationId])
  @@map("player_game_stats")
}
```

`EventGameParticipant` needs an extra relation name on `EventTeam`
(`gameParticipations EventGameParticipant[]`) — included in the extension list below.

Overlap warning (US7 scenario 4) is computed at write time: assigning a non-floater
to a game whose `[startAt, endAt)` overlaps another of their games returns a warning
in the action result (not a hard block; organizers may override).

Tournament standings (FR-037) are **derived at read time** from `COMPLETED` games of
`category = TOURNAMENT` events — no standings table.

## New model: EventMediaItem

```prisma
model EventMediaItem {
  id              String           @id @default(cuid())
  kind            EventMediaKind
  // Private Vercel Blob pathname; delivery via short-lived signed URLs (R1).
  blobPathname    String
  contentType     String
  sizeBytes       Int
  width           Int?
  height          Int?
  durationSeconds Int?
  caption         String?
  status          EventMediaStatus @default(ACTIVE)
  reportCount     Int              @default(0)
  removedAt       DateTime?
  createdAt       DateTime         @default(now())

  eventId String
  event   SignupEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  uploaderId String
  uploader   User   @relation("EventMediaUploader", fields: [uploaderId], references: [id], onDelete: Cascade)

  removedById String?
  removedBy   User?   @relation("EventMediaRemover", fields: [removedById], references: [id], onDelete: SetNull)

  @@index([eventId, status, createdAt])
  @@map("event_media_items")
}
```

Blob objects are deleted best-effort when the row is removed/deleted; a periodic
orphan sweep is out of scope for v1.

## Extended: League

```prisma
model League {
  // …existing fields…
  // Public URL slug for the association events page (R9); generated on first
  // public event publish, editable by league admins.
  slug String? @unique

  // Stripe Connect (direct charges) — mirror of VenueOrganization (R2).
  stripeAccountId        String? @unique
  stripeChargesEnabled   Boolean @default(false)
  stripePayoutsEnabled   Boolean @default(false)
  stripeDetailsSubmitted Boolean @default(false)
  platformFeeBps         Int?

  hostedSignupEvents SignupEvent[]
  payments           Payment[]
}
```

## Extended: Payment (generalized, R3)

```prisma
model Payment {
  // …existing fields unchanged…

  // BEFORE: registrationId String @unique (required)
  registrationId String?             @unique
  registration   SessionRegistration? @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  // NEW — exactly one of registrationId / eventRegistrationId set (CHECK).
  eventRegistrationId String?            @unique
  eventRegistration   EventRegistration? @relation(fields: [eventRegistrationId], references: [id], onDelete: Cascade)

  // BEFORE: venueId, organizationId required. NOW optional; exactly one
  // merchant entity (organizationId | leagueId) set (CHECK). venueId only
  // accompanies organizationId.
  venueId        String?
  organizationId String?
  leagueId       String?
  league         League? @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  @@index([leagueId, status])
}
```

## Extended: other back-relations

| Model | Additions |
| --- | --- |
| `VenueOrganization` | `hostedSignupEvents SignupEvent[]` |
| `Team` | `hostedSignupEvents SignupEvent[]`, `signupPhases EventRegistrationPhase[] @relation("PhaseTeams")` |
| `Division` | `signupPhases EventRegistrationPhase[] @relation("PhaseDivisions")` |
| `Venue` | `signupEvents SignupEvent[]` |
| `IceSurface` | `signupEvents SignupEvent[] @relation("SignupEventSurfaces")`, `eventGames EventGame[]` |
| `Player` | `eventRegistrations EventRegistration[]` |
| `EventTeam` | `gameParticipations EventGameParticipant[]` |
| `User` | named back-relations for: SignupEventCreator/Updater, EventRegistrant, EventRegistrationCanceler, EventCheckInActor, ManualPaymentMarker, EventInvitee, EventInviter, EventManagerUser, EventManagerGrantor, EventTeamAssigner, EventMediaUploader, EventMediaRemover |

## Public data boundaries

- `lib/utils/public-signup-events.ts` exports `publicSignupEventSelect`: id, title,
  description, category, ageClassification, startAt/endAt/timezone, locationText,
  venue (public fields), host display name, slots (name, description, capacity,
  price, remaining — computed), registration windows/phases (times + audience labels
  only), payment instruction fields, gallery flag. **Never**: registrations,
  registrant/participant identities, invitations, managers, internal notes.
- Public roster (only when `publicRoster = true`): server-computed
  `firstName + " " + lastInitial` strings, nothing else.
- LINK events use the same select, fetched by `linkToken`; PRIVATE/INVITE_ONLY events
  never pass through the public select path.
- Media: gallery listing returns items with short-lived signed URLs, only after the
  viewer passes the gallery-visibility check; blob pathnames are never exposed raw.

## Migration notes

Single migration `add_signup_events`:

1. New enums + 12 new tables as above (snake_case `@@map` names).
2. `League`: add `slug` (nullable unique), Stripe columns (nullable/default-false),
   `platformFeeBps` (nullable). No backfill.
3. `payments`: drop NOT NULL on `registrationId`, `venueId`, `organizationId`; add
   `eventRegistrationId` (nullable unique FK), `leagueId` (nullable FK + index).
   Raw SQL in the migration adds CHECK constraints:
   - `(registrationId IS NOT NULL) <> (eventRegistrationId IS NOT NULL)` (exactly one)
   - `(organizationId IS NOT NULL) <> (leagueId IS NOT NULL)` (exactly one merchant)
   - `venueId IS NULL OR organizationId IS NOT NULL` (venue implies org)
   Existing 003 rows satisfy all three unchanged.
4. `signup_events`: CHECK — exactly one of `hostOrganizationId | hostLeagueId |
   hostTeamId` non-null (same rule Venue enforces in app code, here made explicit
   since four models now depend on it).
5. Run `bun run db:migrate` then `bun run db:generate`; commit schema + migration
   together.
