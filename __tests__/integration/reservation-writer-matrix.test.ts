import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockPrisma,
} = vi.hoisted(() => {
  const delegate = () => ({
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  });
  return {
    mockAuth: {
      requireUserId: vi.fn(),
      requireSeasonManager: vi.fn(),
      requireTeamAdmin: vi.fn(),
      requireTeamMember: vi.fn(),
      requireLeagueRole: vi.fn(),
      requireEventManager: vi.fn(),
      requireSignupEventHostAdmin: vi.fn(),
      requireVenueScheduleManager: vi.fn(),
      requireVenueContentManager: vi.fn(),
    },
    mockPrisma: {
      league: delegate(),
      season: delegate(),
      seasonPhase: delegate(),
      seasonGame: delegate(),
      team: delegate(),
      teamMember: delegate(),
      leagueUser: delegate(),
      venue: delegate(),
      venueOrganization: delegate(),
      venueRelationship: delegate(),
      venueStaff: delegate(),
      iceSurface: delegate(),
      surfaceSegment: delegate(),
      segmentCoexistence: delegate(),
      iceTimeRequest: delegate(),
      venueReservation: delegate(),
      event: delegate(),
      rSVP: delegate(),
      eventTeam: delegate(),
      eventGame: delegate(),
      signupEvent: delegate(),
      signupSlot: delegate(),
      eventRegistrationPhase: delegate(),
      eventRegistration: delegate(),
      gameProposal: delegate(),
      gameProposalEntry: delegate(),
      venueScheduleBlock: delegate(),
      practiceSession: delegate(),
      practiceSessionPlay: delegate(),
      play: delegate(),
      auditLog: delegate(),
      notificationOutbox: delegate(),
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  VENUE_SCHEDULE_ROLES: ["OWNER", "MANAGER", "SCHEDULER"],
  requireUserId: (...args: unknown[]) => mockAuth.requireUserId(...args),
  requireTeamAdmin: (...args: unknown[]) => mockAuth.requireTeamAdmin(...args),
  requireTeamMember: (...args: unknown[]) => mockAuth.requireTeamMember(...args),
  requireLeagueRole: (...args: unknown[]) => mockAuth.requireLeagueRole(...args),
  requireEventManager: (...args: unknown[]) => mockAuth.requireEventManager(...args),
  requireSignupEventHostAdmin: (...args: unknown[]) =>
    mockAuth.requireSignupEventHostAdmin(...args),
  requireVenueScheduleManager: (...args: unknown[]) =>
    mockAuth.requireVenueScheduleManager(...args),
  requireVenueContentManager: (...args: unknown[]) =>
    mockAuth.requireVenueContentManager(...args),
  getCurrentUserId: vi.fn(),
  isEventManager: vi.fn(),
}));
vi.mock("@/lib/actions/seasons", () => ({
  requireSeasonManager: (...args: unknown[]) =>
    mockAuth.requireSeasonManager(...args),
}));
vi.mock("@/lib/actions/venues", () => ({
  canUserAccessVenue: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({
  sendEventNotifications: vi.fn().mockResolvedValue(undefined),
  sendGameProposalNotifications: vi.fn().mockResolvedValue(undefined),
  sendSignupEventCanceledEmail: vi.fn().mockResolvedValue(undefined),
  sendSignupEventUpdatedEmail: vi.fn().mockResolvedValue(undefined),
  sendPracticePlanNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/venue-activity", () => ({
  logVenueActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/actions/venue-organizations", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, logVenueActivity: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createEvent, updateEvent } from "@/lib/actions/events";
import {
  createSeasonGame,
  publishSeasonGames,
  updateSeasonGame,
} from "@/lib/actions/season-games";
import { acceptGameProposal } from "@/lib/actions/game-proposals";
import { upsertEventGame } from "@/lib/actions/event-teams";
import {
  publishSignupEvent,
  updateSignupEvent,
} from "@/lib/actions/signup-events";
import {
  archiveIceSurface,
  createScheduleBlock,
  publishScheduleBlock,
  updateScheduleBlock,
} from "@/lib/actions/venue-schedules";
import { publishSpecialtyEvent } from "@/lib/actions/venue-content";
import {
  createPracticeSession,
  updatePracticeSession,
} from "@/lib/actions/practice-sessions";
import { setSegmentActive } from "@/lib/actions/venue-surfaces";

const USER_ID = "cluser000000000000000001";
const LEAGUE_ID = "clleague0000000000000001";
const TEAM_A = "clteam00000000000000001";
const TEAM_B = "clteam00000000000000002";
const SEASON_ID = "clseason000000000000001";
const SEASON_GAME_ID = "clgame0000000000000001";
const EVENT_ID = "clevent0000000000000001";
const EVENT_GAME_ID = "cleventgame00000000001";
const PROPOSAL_ID = "clproposal000000000001";
const ORGANIZATION_ID = "clorg000000000000000001";
const VENUE_ID = "clvenue00000000000000001";
const SURFACE_ID = "clsurface000000000000001";
const SEGMENT_ID = "clsegment000000000000001";
const RESERVATION_ID = "clreservation0000000001";
const BLOCK_ID = "clblock000000000000001";
const PRACTICE_ID = "clpractice0000000000001";
const START = new Date("2099-09-05T22:00:00.000Z");
const END = new Date("2099-09-05T23:30:00.000Z");

const conflictSources = [
  "seasonGame",
  "eventGame",
  "event",
  "practice",
  "scheduleBlock",
  "venueReservation",
  "iceTimeRequest",
] as const;
type ConflictSource = (typeof conflictSources)[number];

const reservationRecord = () => ({
  id: RESERVATION_ID,
  status: "CONFIRMED",
  startsAt: START,
  endsAt: END,
  timezone: "America/New_York",
  heldUntil: null,
  confirmedAt: START,
  venueId: VENUE_ID,
  surfaceId: SURFACE_ID,
  segmentId: SEGMENT_ID,
  ownerLeagueId: LEAGUE_ID,
  ownerTeamId: null,
  ownerVenueOrganizationId: null,
  sourceRequestId: null,
  venue: {
    id: VENUE_ID,
    isActive: true,
    timezone: "America/New_York",
    organizationId: ORGANIZATION_ID,
    leagueId: LEAGUE_ID,
    teamId: TEAM_A,
  },
  events: [],
  seasonGames: [],
  eventGames: [],
  signupEvents: [],
  practiceSessions: [],
  proposalEntries: [],
});

const seasonGameRecord = (status = "SCHEDULED") => ({
  id: SEASON_GAME_ID,
  seasonId: SEASON_ID,
  phaseId: null,
  status,
  startAt: START,
  endAt: END,
  timezone: "America/New_York",
  venueId: VENUE_ID,
  surfaceId: SURFACE_ID,
  segmentId: SEGMENT_ID,
  locationText: null,
  notes: null,
  homeTeamId: TEAM_A,
  awayTeamId: TEAM_B,
  eventId: null,
  venueReservationId: null,
  season: { id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null },
  homeTeam: { leagueId: LEAGUE_ID },
  awayTeam: { leagueId: LEAGUE_ID },
});

const teamEventRecord = () => ({
  id: EVENT_ID,
  type: "GAME",
  title: "Arrows vs Blizzards",
  startAt: START,
  endAt: END,
  timezone: "America/New_York",
  location: "North Rink",
  venueId: VENUE_ID,
  opponent: "Blizzards",
  notes: null,
  teamId: TEAM_A,
  homeTeamId: null,
  awayTeamId: null,
  leagueId: LEAGUE_ID,
  venueReservationId: null,
  team: { leagueId: LEAGUE_ID },
  homeTeam: null,
  awayTeam: null,
  seasonGame: null,
});

const signupEventRecord = (status: "DRAFT" | "PUBLISHED") => ({
  id: EVENT_ID,
  status,
  visibility: "PUBLIC",
  linkToken: null,
  title: "Mite Night",
  category: "SCRIMMAGE",
  ageClassification: "U8",
  acceptsOnlinePayment: false,
  acceptsManualPayment: true,
  galleryEnabled: true,
  galleryVisibility: "PARTICIPANTS",
  publicRoster: false,
  hostOrganizationId: null,
  hostLeagueId: LEAGUE_ID,
  hostTeamId: null,
  venueId: VENUE_ID,
  startAt: START,
  endAt: END,
  timezone: "America/New_York",
  locationText: null,
  venueReservationId: null,
  venueReservation: null,
  venue: { slug: "north-rink" },
  hostOrganization: null,
  hostLeague: {
    id: LEAGUE_ID,
    name: "OpenLeague Association",
    slug: "openleague",
    stripeAccountId: null,
    stripeChargesEnabled: false,
  },
  hostTeam: null,
  slots: [{ id: "clslot00000000000000001", capacity: 40, priceAmount: null, _count: { registrations: 0 } }],
  surfaces: [{ id: SURFACE_ID }],
});

const eventGameRecord = () => ({
  id: EVENT_GAME_ID,
  eventId: EVENT_ID,
  name: "Game 1",
  status: "SCHEDULED",
  homeTeamId: TEAM_A,
  awayTeamId: TEAM_B,
  startAt: START,
  endAt: END,
  surfaceId: SURFACE_ID,
  segmentId: SEGMENT_ID,
  venueReservationId: null,
  venueReservation: null,
  event: {
    id: EVENT_ID,
    hostOrganizationId: null,
    hostLeagueId: LEAGUE_ID,
    hostTeamId: null,
  },
});

const blockRecord = (status: "DRAFT" | "PUBLISHED" = "PUBLISHED") => ({
  id: BLOCK_ID,
  venueId: VENUE_ID,
  surfaceId: SURFACE_ID,
  segmentId: SEGMENT_ID,
  title: "Open skate",
  startsAt: START,
  endsAt: END,
  status,
  intent: "VENUE_ACTIVITY",
  activityType: "OPEN_SKATE",
  recurrenceRule: null,
  recurrenceEndDate: null,
  reservationOccurrences: [],
  venue: {
    organizationId: ORGANIZATION_ID,
    slug: "north-rink",
    timezone: "America/New_York",
  },
});

const practiceRecord = () => ({
  id: PRACTICE_ID,
  title: "Practice",
  date: START,
  startAt: START,
  duration: 90,
  isShared: false,
  teamId: TEAM_A,
  venueId: VENUE_ID,
  surfaceId: SURFACE_ID,
  segmentId: SEGMENT_ID,
  venueReservationId: null,
  team: { leagueId: LEAGUE_ID },
});

function configureConflict(source: ConflictSource): void {
  mockPrisma.venueReservation.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      if (where.sourceScheduleBlockId) return [];
      if (source !== "venueReservation") return [];
      return [{
        ...reservationRecord(),
        id: "conflicting-reservation",
        proposalEntries: [],
      }];
    },
  );
  mockPrisma.event.findMany.mockResolvedValue(
    source === "event"
      ? [{ id: "legacy-event", title: "Legacy event", startAt: START, endAt: END }]
      : [],
  );
  mockPrisma.seasonGame.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      if (where.seasonId === SEASON_ID && where.status === "DRAFT") {
        return [seasonGameRecord("DRAFT")];
      }
      return source === "seasonGame"
        ? [{
            ...seasonGameRecord(),
            id: "legacy-season-game",
            segment: { name: "North" },
            homeTeam: { name: "A" },
            awayTeam: { name: "B" },
          }]
        : [];
    },
  );
  mockPrisma.eventGame.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      if (where.eventId === EVENT_ID) return [];
      return source === "eventGame"
        ? [{
            ...eventGameRecord(),
            id: "legacy-event-game",
            segment: { name: "North" },
            event: { title: "Signup" },
          }]
        : [];
    },
  );
  mockPrisma.practiceSession.findMany.mockResolvedValue(
    source === "practice"
      ? [{ ...practiceRecord(), id: "legacy-practice", segment: { name: "North" } }]
      : [],
  );
  mockPrisma.venueScheduleBlock.findMany.mockResolvedValue(
    source === "scheduleBlock"
      ? [{
          ...blockRecord(),
          id: "legacy-block",
          segment: { name: "North" },
          reservationOccurrences: [],
        }]
      : [],
  );
  mockPrisma.iceTimeRequest.findMany.mockResolvedValue(
    source === "iceTimeRequest"
      ? [{
          id: "legacy-request",
          requestedStartAt: START,
          requestedEndAt: END,
          approvedStartAt: START,
          approvedEndAt: END,
          approvedSurfaceId: SURFACE_ID,
          approvedSegmentId: SEGMENT_ID,
          scheduleBlock: {
            title: "Public ice",
            surfaceId: SURFACE_ID,
            segmentId: SEGMENT_ID,
          },
        }]
      : [],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mockAuth)) mock.mockResolvedValue(USER_ID);
  mockAuth.requireSeasonManager.mockResolvedValue({
    season: { id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null },
    userId: USER_ID,
  });
  mockPrisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
  );
  mockPrisma.league.findUnique.mockResolvedValue({ id: LEAGUE_ID });
  mockPrisma.season.findUnique.mockResolvedValue({
    id: SEASON_ID,
    leagueId: LEAGUE_ID,
    teamId: null,
  });
  mockPrisma.season.findFirst.mockResolvedValue({
    id: SEASON_ID,
    leagueId: LEAGUE_ID,
    teamId: null,
  });
  mockPrisma.seasonPhase.findFirst.mockResolvedValue({ id: "clphase0000000000000001" });
  mockPrisma.team.findMany.mockResolvedValue([
    { id: TEAM_A, leagueId: LEAGUE_ID },
    { id: TEAM_B, leagueId: LEAGUE_ID },
  ]);
  mockPrisma.team.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      leagueId: LEAGUE_ID,
    }),
  );
  mockPrisma.team.findUniqueOrThrow.mockImplementation(
    async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      name: where.id === TEAM_A ? "Arrows" : "Blizzards",
      leagueId: LEAGUE_ID,
    }),
  );
  mockPrisma.teamMember.findMany.mockResolvedValue([
    { teamId: TEAM_A, userId: "clmember000000000000001" },
    { teamId: TEAM_B, userId: "clmember000000000000002" },
  ]);
  mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "membership-1" });
  mockPrisma.leagueUser.findFirst.mockResolvedValue({ id: "league-user-1" });
  mockPrisma.venue.findUnique.mockResolvedValue({
    id: VENUE_ID,
    name: "North Rink",
    isActive: true,
    visibility: "PUBLIC",
    timezone: "America/New_York",
    organizationId: ORGANIZATION_ID,
    leagueId: LEAGUE_ID,
    teamId: TEAM_A,
  });
  mockPrisma.venue.findFirst.mockResolvedValue({
    id: VENUE_ID,
    organizationId: ORGANIZATION_ID,
    slug: "north-rink",
    timezone: "America/New_York",
  });
  mockPrisma.venueOrganization.findUnique.mockResolvedValue({ id: ORGANIZATION_ID });
  mockPrisma.venueRelationship.findFirst.mockResolvedValue({ id: "relationship-1" });
  mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: "staff-1" });
  mockPrisma.iceSurface.findFirst.mockResolvedValue({ id: SURFACE_ID });
  mockPrisma.iceSurface.update.mockResolvedValue({ id: SURFACE_ID, venueId: VENUE_ID });
  mockPrisma.surfaceSegment.findFirst.mockResolvedValue({
    id: SEGMENT_ID,
    isActive: true,
  });
  mockPrisma.surfaceSegment.findUnique.mockResolvedValue({
    id: SEGMENT_ID,
    name: "North",
    isActive: true,
    surfaceId: SURFACE_ID,
    surface: {
      name: "Main",
      venueId: VENUE_ID,
      venue: { organizationId: ORGANIZATION_ID, slug: "north-rink" },
    },
  });
  mockPrisma.segmentCoexistence.findMany.mockResolvedValue([]);
  mockPrisma.iceTimeRequest.findUnique.mockResolvedValue(null);
  mockPrisma.iceTimeRequest.findMany.mockResolvedValue([]);
  mockPrisma.venueReservation.findUnique.mockResolvedValue(reservationRecord());
  mockPrisma.venueReservation.findFirst.mockResolvedValue(null);
  mockPrisma.venueReservation.findMany.mockResolvedValue([]);
  mockPrisma.event.findUnique.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      where.venueReservationId ? null : teamEventRecord(),
  );
  mockPrisma.event.create.mockResolvedValue(teamEventRecord());
  mockPrisma.event.update.mockResolvedValue(teamEventRecord());
  mockPrisma.event.findMany.mockResolvedValue([]);
  mockPrisma.rSVP.createMany.mockResolvedValue({ count: 2 });
  mockPrisma.eventTeam.findMany.mockResolvedValue([
    { id: TEAM_A, eventId: EVENT_ID },
    { id: TEAM_B, eventId: EVENT_ID },
  ]);
  mockPrisma.eventGame.findFirst.mockResolvedValue(eventGameRecord());
  mockPrisma.eventGame.findUnique.mockResolvedValue(eventGameRecord());
  mockPrisma.eventGame.findMany.mockResolvedValue([]);
  mockPrisma.eventGame.create.mockResolvedValue(eventGameRecord());
  mockPrisma.eventGame.update.mockResolvedValue(eventGameRecord());
  mockPrisma.signupEvent.findUnique.mockResolvedValue(signupEventRecord("PUBLISHED"));
  mockPrisma.signupEvent.update.mockResolvedValue(signupEventRecord("PUBLISHED"));
  mockPrisma.signupEvent.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.signupSlot.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.eventRegistrationPhase.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
  mockPrisma.gameProposal.findUnique.mockResolvedValue({
    id: PROPOSAL_ID,
    status: "PENDING",
    leagueId: LEAGUE_ID,
    proposingTeamId: TEAM_A,
    receivingTeamId: TEAM_B,
    seasonId: SEASON_ID,
    entries: [{
      id: "entry-1",
      kind: "PROPOSE",
      startAt: START,
      endAt: END,
      venueId: VENUE_ID,
      venueReservationId: null,
      note: null,
      actorTeamId: TEAM_A,
      createdAt: new Date("2099-08-17T00:00:00.000Z"),
    }],
  });
  mockPrisma.gameProposal.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.gameProposalEntry.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.seasonGame.findUnique.mockResolvedValue(seasonGameRecord());
  mockPrisma.seasonGame.findMany.mockResolvedValue([]);
  mockPrisma.seasonGame.create.mockResolvedValue(seasonGameRecord());
  mockPrisma.seasonGame.update.mockResolvedValue(seasonGameRecord());
  mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(blockRecord());
  mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([]);
  mockPrisma.venueScheduleBlock.create.mockResolvedValue(blockRecord());
  mockPrisma.venueScheduleBlock.update.mockResolvedValue(blockRecord());
  mockPrisma.practiceSession.findUnique.mockResolvedValue(practiceRecord());
  mockPrisma.practiceSession.findMany.mockResolvedValue([]);
  mockPrisma.practiceSession.create.mockResolvedValue(practiceRecord());
  mockPrisma.practiceSession.update.mockResolvedValue(practiceRecord());
  mockPrisma.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.play.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  mockPrisma.notificationOutbox.createMany.mockResolvedValue({ count: 0 });
});

type WriterResult =
  | { success: boolean; details?: unknown }
  | { success: boolean; data?: unknown; details?: unknown };
type Writer = {
  name: string;
  run: () => Promise<WriterResult>;
  conflicts: (result: WriterResult) => unknown[];
};
const failureConflicts = (result: WriterResult) =>
  ((result.details as { conflicts?: unknown[] } | undefined)?.conflicts ?? []);
const publicationConflicts = (result: WriterResult) =>
  ((result.details as { outcomes?: Array<{ conflicts?: unknown[] }> } | undefined)
    ?.outcomes?.flatMap((outcome) => outcome.conflicts ?? []) ?? []);

const scheduleInput = {
  organizationId: ORGANIZATION_ID,
  venueId: VENUE_ID,
  surfaceId: SURFACE_ID,
  segmentId: SEGMENT_ID,
  title: "Open skate",
  activityType: "OPEN_SKATE" as const,
  startsAt: START,
  endsAt: END,
  status: "PUBLISHED" as const,
};
const signupInput = {
  title: "Mite Night",
  category: "SCRIMMAGE" as const,
  ageClassification: "U8" as const,
  visibility: "PUBLIC" as const,
  startAt: START,
  endAt: END,
  acceptsOnlinePayment: false,
  acceptsManualPayment: true,
  galleryEnabled: true,
  galleryVisibility: "PARTICIPANTS" as const,
  publicRoster: false,
  hostLeagueId: LEAGUE_ID,
  venueId: VENUE_ID,
  slots: [{
    id: "clslot00000000000000001",
    name: "Skater",
    capacity: 40,
    waitlistEnabled: true,
    sortOrder: 0,
  }],
  phases: [],
};

const writers: Writer[] = [
  {
    name: "Team Event create",
    run: () => createEvent({
      type: "GAME",
      title: "Arrows vs Blizzards",
      startAt: START,
      endAt: END,
      location: "North Rink",
      opponent: "Blizzards",
      teamId: TEAM_A,
      venueId: VENUE_ID,
      reservationId: RESERVATION_ID,
      overrideConflicts: false,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "Team Event update",
    run: () => updateEvent({
      id: EVENT_ID,
      type: "GAME",
      title: "Arrows vs Blizzards",
      startAt: START,
      endAt: END,
      location: "North Rink",
      opponent: "Blizzards",
      teamId: TEAM_A,
      venueId: VENUE_ID,
      reservationId: RESERVATION_ID,
      overrideConflicts: false,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "SeasonGame create",
    run: () => createSeasonGame({
      seasonId: SEASON_ID,
      homeTeamId: TEAM_A,
      awayTeamId: TEAM_B,
      startAt: START,
      endAt: END,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      segmentId: SEGMENT_ID,
      publish: true,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "SeasonGame update",
    run: () => updateSeasonGame({
      gameId: SEASON_GAME_ID,
      startAt: START,
      endAt: END,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      segmentId: SEGMENT_ID,
      reservationId: null,
      overrideReason: "Create replacement inventory",
    }),
    conflicts: failureConflicts,
  },
  {
    name: "SeasonGame publish",
    run: () => {
      mockPrisma.seasonGame.findUnique.mockResolvedValue(seasonGameRecord("DRAFT"));
      return publishSeasonGames({
        seasonId: SEASON_ID,
        overrideReason: "Create publication inventory",
      });
    },
    conflicts: publicationConflicts,
  },
  {
    name: "proposal acceptance",
    run: () => acceptGameProposal({
      proposalId: PROPOSAL_ID,
      reservationId: RESERVATION_ID,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "EventGame create",
    run: () => upsertEventGame({
      eventId: EVENT_ID,
      homeTeamId: TEAM_A,
      awayTeamId: TEAM_B,
      startAt: START,
      endAt: END,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      segmentId: SEGMENT_ID,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "EventGame update",
    run: () => upsertEventGame({
      gameId: EVENT_GAME_ID,
      eventId: EVENT_ID,
      homeTeamId: TEAM_A,
      awayTeamId: TEAM_B,
      startAt: START,
      endAt: END,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      segmentId: SEGMENT_ID,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "parent SignupEvent publication",
    run: () => {
      mockPrisma.signupEvent.findUnique.mockResolvedValue(signupEventRecord("DRAFT"));
      return publishSignupEvent({ eventId: EVENT_ID });
    },
    conflicts: failureConflicts,
  },
  {
    name: "SignupEvent published update",
    run: () => updateSignupEvent({
      ...signupInput,
      eventId: EVENT_ID,
      startAt: new Date(START.getTime() + 60_000),
      endAt: new Date(END.getTime() + 60_000),
    }),
    conflicts: failureConflicts,
  },
  {
    name: "VenueScheduleBlock create",
    run: () => createScheduleBlock(scheduleInput),
    conflicts: failureConflicts,
  },
  {
    name: "VenueScheduleBlock update",
    run: () => updateScheduleBlock({
      ...scheduleInput,
      scheduleBlockId: BLOCK_ID,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "VenueScheduleBlock publish",
    run: () => {
      mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(blockRecord("DRAFT"));
      return publishScheduleBlock({
        organizationId: ORGANIZATION_ID,
        venueId: VENUE_ID,
        scheduleBlockId: BLOCK_ID,
      });
    },
    conflicts: failureConflicts,
  },
  {
    name: "specialty event publication",
    run: () => publishSpecialtyEvent({
      ...scheduleInput,
      activityType: "SPECIALTY_EVENT",
    }),
    conflicts: failureConflicts,
  },
  {
    name: "practice create",
    run: () => createPracticeSession({
      title: "Practice",
      date: START,
      duration: 90,
      teamId: TEAM_A,
      plays: [],
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      segmentId: SEGMENT_ID,
      startAt: START,
    }),
    conflicts: failureConflicts,
  },
  {
    name: "practice update",
    run: () => updatePracticeSession({
      id: PRACTICE_ID,
      title: "Practice",
      date: START,
      duration: 90,
      teamId: TEAM_A,
      plays: [],
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      segmentId: SEGMENT_ID,
      startAt: START,
    }),
    conflicts: failureConflicts,
  },
];

describe("writer-by-conflicting-source matrix", () => {
  it.each(
    writers.flatMap((writer) =>
      conflictSources.map((source) => ({ writer, source })),
    ),
  )("$writer.name blocks $source occupancy", async ({ writer, source }) => {
    configureConflict(source);

    const result = await writer.run();

    expect(writer.conflicts(result), JSON.stringify(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source }),
      ]),
    );
  });
});

const archivalSources = [
  "seasonGame",
  "eventGame",
  "practice",
  "scheduleBlock",
  "venueReservation",
  "iceTimeRequest",
] as const;

describe("surface and segment archival dual-read guards", () => {
  it.each(archivalSources)("surface archival blocks %s occupancy", async (source) => {
    configureConflict(source);

    const result = await archiveIceSurface({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
    });

    expect(result.success).toBe(false);
    expect(
      (result as { details?: { futureBookings?: Array<{ source: string }> } })
        .details?.futureBookings,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ source })]));
  });

  it.each(archivalSources)("segment deactivation blocks %s occupancy", async (source) => {
    configureConflict(source);

    const result = await setSegmentActive({
      segmentId: SEGMENT_ID,
      isActive: false,
    });

    expect(result.success).toBe(false);
    expect(
      (result as { details?: { futureBookings?: Array<{ source: string }> } })
        .details?.futureBookings,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ source })]));
  });
});
