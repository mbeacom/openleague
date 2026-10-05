import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDS, nonStringIdArguments } from "@/__tests__/helpers/prisma-recorder";

/**
 * Readers, reports and server-only helpers that take an id, slug or token
 * refuse a malformed value with their usual not-found or no-access result,
 * before resolving the session and before any query.
 */

const recorder = await vi.hoisted(async () => {
  const { createPrismaRecorder } = await import("@/__tests__/helpers/prisma-recorder");
  return createPrismaRecorder();
});

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ user: { id: "cluser00000000000000000001" } })),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: recorder.prisma }));
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/media/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/blob")>()),
  isBlobEnabled: () => true,
}));

import {
  exportLeagueRosterCSV,
  exportLeagueRosterPDF,
  exportLeagueScheduleCSV,
  exportLeagueSchedulePDF,
  exportAttendanceReportCSV,
  exportAttendanceReportPDF,
  exportFinancialReportCSV,
  exportFinancialReportPDF,
} from "@/lib/actions/league";
import {
  getPublicSignupEvent,
  listPublicSignupEvents,
  getManagedSignupEvent,
} from "@/lib/actions/signup-events";
import { listEventManagers } from "@/lib/actions/event-managers";
import { listEventMedia } from "@/lib/actions/event-media";
import { getEventRoster } from "@/lib/actions/event-registrations";
import {
  getEventTeamsBoard,
  getMyEventAssignments,
  getPublicEventGames,
  listPublicVenueEventGames,
  getEventStandings,
} from "@/lib/actions/event-teams";
import { getOrganizationPaymentsOverview } from "@/lib/actions/venue-payments";
import { getLeaguePaymentsOverview } from "@/lib/actions/league-payments";
import { deleteEvent, getEvent } from "@/lib/actions/events";
import {
  getGearWishlistAdminContext,
  getGearWishlistForAdmin,
  getPublicGearWishlist,
} from "@/lib/actions/gear-wishlist";
import { resendInvitation } from "@/lib/actions/invitations";
import { getPublicRinkProfile } from "@/lib/actions/venue-organizations";
import { listEventInvitations } from "@/lib/actions/event-invitations";
import { deleteVenue, getVenue, getVenuePageData } from "@/lib/actions/venues";
import { getTeamOverviewData, getTeamRosterDataById } from "@/lib/actions/team-context";
import { deletePlayer } from "@/lib/actions/roster";
import {
  resolvePublicAssociation,
  resolveActiveAssociation,
  getPublicAssociationProfile,
  getPublicAssociationTeams,
  resolvePublicTeam,
  getPublicTeamProfile,
} from "@/lib/actions/association-profile";
import {
  listPublicAssociationContent,
  listPublicAssociationContentPage,
  getPublicContentItem,
} from "@/lib/actions/public-content";
import { getSeasonDetail } from "@/lib/actions/seasons";
import { getPracticeSessionDetail, getPracticeSessionForEdit } from "@/lib/actions/practice-session-queries";
import { confirmEmailVerification, confirmEmailChange } from "@/lib/actions/account-lifecycle";
import { checkPermissionAction } from "@/lib/actions/permissions";
import { getPublicVenueRelationships, getTeamVenueRelationships } from "@/lib/actions/venue-relationships";
import {
  getNotificationPreferences,
  generateUnsubscribeToken,
  handleUnsubscribe,
} from "@/lib/actions/notifications";
import { getPublicVenueSchedule } from "@/lib/actions/venue-schedules";
import { getPublicVenueContent } from "@/lib/actions/venue-content";
import {
  hasLeagueAccess,
  verifyLeagueAdmin,
  verifyTeamAdminInLeague,
} from "@/lib/auth/league-access";
import { canBrandEntity } from "@/lib/auth/branding-access";
import { canUserAccessVenue } from "@/lib/auth/venue-access";
import { canAccessActiveTeamInLeague, isActiveTeamInLeague } from "@/lib/auth/team-access";
import { requireSeasonManager, requireSeasonViewer } from "@/lib/auth/season-access";
import { Permission } from "@/lib/utils/permission-types";

type Outcome = { returns: unknown } | { rejects: RegExp };

type Case = {
  name: string;
  call: (bad: unknown) => Promise<unknown>;
  outcome: Outcome;
  /** Values to try; defaults to MALFORMED. */
  values?: Array<[string, unknown]>;
  /** Whether the session may be resolved (only for helpers handed a user id). */
  allowsSession?: boolean;
};

const MALFORMED: Array<[string, unknown]> = [
  ["a filter object", { not: "x" }],
  ["an empty in-list filter", { in: [] }],
  ["an array", ["a"]],
  ["undefined", undefined],
  ["a non-cuid string", "t1"],
];
/** For optional arguments, where undefined means "not supplied". */
const MALFORMED_PRESENT = MALFORMED.filter(([label]) => label !== "undefined");
const MALFORMED_SLUGS: Array<[string, unknown]> = [
  ...MALFORMED.filter(([label]) => label !== "a non-cuid string"),
  ["a string that is not a slug", "Not A Slug!"],
];
const MALFORMED_TOKENS: Array<[string, unknown]> = [
  ...MALFORMED.filter(([label]) => label !== "a non-cuid string"),
  ["a string that is not a token", "not-a-token"],
];
const MALFORMED_PRESENT_TOKENS = MALFORMED_TOKENS.filter(([label]) => label !== "undefined");

const s = (value: unknown) => value as string;
const unauthorized = /Unauthorized/;
const notMember = { success: false, error: "Unauthorized - you are not a member of this league" };
const notAdmin = { success: false, error: "Unauthorized - you must be a league admin" };
const HEX = "a".repeat(64);
const SHARE = "A".repeat(43);

const cases: Case[] = [
  { name: "exportLeagueRosterCSV", call: (b) => exportLeagueRosterCSV(s(b)), outcome: { returns: notMember } },
  { name: "exportLeagueRosterPDF", call: (b) => exportLeagueRosterPDF(s(b)), outcome: { returns: notMember } },
  { name: "exportLeagueScheduleCSV", call: (b) => exportLeagueScheduleCSV(s(b)), outcome: { returns: notMember } },
  { name: "exportLeagueSchedulePDF", call: (b) => exportLeagueSchedulePDF(s(b)), outcome: { returns: notMember } },
  { name: "exportAttendanceReportCSV", call: (b) => exportAttendanceReportCSV(s(b)), outcome: { returns: notMember } },
  { name: "exportAttendanceReportPDF", call: (b) => exportAttendanceReportPDF(s(b)), outcome: { returns: notMember } },
  { name: "exportFinancialReportCSV", call: (b) => exportFinancialReportCSV(s(b)), outcome: { returns: notAdmin } },
  { name: "exportFinancialReportPDF", call: (b) => exportFinancialReportPDF(s(b)), outcome: { returns: notAdmin } },
  {
    name: "getPublicSignupEvent (event id)",
    call: (b) => getPublicSignupEvent({ eventId: s(b) }),
    outcome: { returns: null },
  },
  {
    name: "getPublicSignupEvent (link token)",
    call: (b) => getPublicSignupEvent({ linkToken: s(b) }),
    outcome: { returns: null },
    values: MALFORMED_TOKENS,
  },
  ...(["venueId", "hostLeagueId", "hostOrganizationId"] as const).map((field) => ({
    name: `listPublicSignupEvents (${field})`,
    call: (b: unknown) => listPublicSignupEvents({ [field]: s(b) }),
    outcome: { returns: [] },
    values: MALFORMED_PRESENT,
  })),
  { name: "getManagedSignupEvent", call: (b) => getManagedSignupEvent(s(b)), outcome: { rejects: unauthorized } },
  { name: "listEventManagers", call: (b) => listEventManagers(s(b)), outcome: { rejects: unauthorized } },
  {
    name: "listEventMedia (event id)",
    call: (b) => listEventMedia({ eventId: s(b) }),
    outcome: { returns: null },
  },
  {
    name: "listEventMedia (link token)",
    call: (b) => listEventMedia({ eventId: IDS.team, linkToken: s(b) }),
    outcome: { returns: null },
    values: MALFORMED_PRESENT_TOKENS,
  },
  { name: "getEventRoster", call: (b) => getEventRoster({ eventId: s(b) }), outcome: { rejects: unauthorized } },
  { name: "getEventTeamsBoard", call: (b) => getEventTeamsBoard(s(b)), outcome: { rejects: unauthorized } },
  { name: "getMyEventAssignments", call: (b) => getMyEventAssignments(s(b)), outcome: { returns: null } },
  { name: "getPublicEventGames (event id)", call: (b) => getPublicEventGames(s(b)), outcome: { returns: null } },
  {
    name: "getPublicEventGames (link token)",
    call: (b) => getPublicEventGames(IDS.team, s(b)),
    outcome: { returns: null },
    values: MALFORMED_PRESENT_TOKENS,
  },
  { name: "getEventStandings (event id)", call: (b) => getEventStandings(s(b)), outcome: { returns: null } },
  {
    name: "getEventStandings (link token)",
    call: (b) => getEventStandings(IDS.team, s(b)),
    outcome: { returns: null },
    values: MALFORMED_PRESENT_TOKENS,
  },
  { name: "listPublicVenueEventGames", call: (b) => listPublicVenueEventGames(s(b)), outcome: { returns: [] } },
  {
    name: "getOrganizationPaymentsOverview",
    call: (b) => getOrganizationPaymentsOverview(s(b)),
    outcome: { returns: { success: false, error: "Organization not found" } },
  },
  {
    name: "getLeaguePaymentsOverview",
    call: (b) => getLeaguePaymentsOverview(s(b)),
    outcome: { returns: { success: false, error: "League not found" } },
  },
  {
    name: "deleteEvent",
    call: (b) => deleteEvent(s(b)),
    outcome: { returns: { success: false, error: "Event not found" } },
  },
  { name: "getEvent", call: (b) => getEvent(s(b)), outcome: { returns: null } },
  {
    name: "getGearWishlistAdminContext",
    call: (b) => getGearWishlistAdminContext(s(b)),
    outcome: { rejects: unauthorized },
  },
  { name: "getGearWishlistForAdmin", call: (b) => getGearWishlistForAdmin(s(b)), outcome: { rejects: unauthorized } },
  {
    name: "getPublicGearWishlist",
    call: (b) => getPublicGearWishlist(s(b)),
    outcome: { returns: null },
    values: MALFORMED_TOKENS,
  },
  {
    name: "resendInvitation",
    call: (b) => resendInvitation(s(b)),
    outcome: { returns: { success: false, error: "Invitation not found" } },
  },
  {
    name: "getPublicRinkProfile",
    call: (b) => getPublicRinkProfile(s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  { name: "listEventInvitations", call: (b) => listEventInvitations(s(b)), outcome: { rejects: unauthorized } },
  {
    name: "deleteVenue",
    call: (b) => deleteVenue(s(b)),
    outcome: { returns: { success: false, error: "Venue not found" } },
  },
  { name: "getVenue", call: (b) => getVenue(s(b)), outcome: { returns: null } },
  { name: "getVenuePageData", call: (b) => getVenuePageData(s(b)), outcome: { returns: null } },
  { name: "getTeamOverviewData", call: (b) => getTeamOverviewData(s(b)), outcome: { returns: null } },
  { name: "getTeamRosterDataById", call: (b) => getTeamRosterDataById(s(b)), outcome: { returns: null } },
  {
    name: "deletePlayer (player id)",
    call: (b) => deletePlayer(s(b), IDS.team),
    outcome: { returns: { error: "Player not found" } },
  },
  {
    name: "deletePlayer (team id)",
    call: (b) => deletePlayer(IDS.need, s(b)),
    outcome: { returns: { error: "Failed to delete player. Please try again." } },
  },
  {
    name: "resolvePublicAssociation",
    call: (b) => resolvePublicAssociation(s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  {
    name: "resolveActiveAssociation",
    call: (b) => resolveActiveAssociation(s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  {
    name: "getPublicAssociationProfile",
    call: (b) => getPublicAssociationProfile(s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  { name: "getPublicAssociationTeams", call: (b) => getPublicAssociationTeams(s(b)), outcome: { returns: [] } },
  {
    name: "resolvePublicTeam (league id)",
    call: (b) => resolvePublicTeam(s(b), "north-stars"),
    outcome: { returns: null },
  },
  {
    name: "resolvePublicTeam (team slug)",
    call: (b) => resolvePublicTeam(IDS.league, s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  {
    name: "getPublicTeamProfile (league id)",
    call: (b) => getPublicTeamProfile(s(b), "north-stars"),
    outcome: { returns: null },
  },
  {
    name: "getPublicTeamProfile (team slug)",
    call: (b) => getPublicTeamProfile(IDS.league, s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  {
    name: "listPublicAssociationContent",
    call: (b) => listPublicAssociationContent(s(b)),
    outcome: { returns: [] },
  },
  {
    name: "listPublicAssociationContentPage",
    call: (b) => listPublicAssociationContentPage(s(b), 1),
    outcome: { returns: { items: [], page: 1, totalItems: 0, totalPages: 1 } },
  },
  {
    name: "getPublicContentItem (association slug)",
    call: (b) => getPublicContentItem(s(b), "season-opener"),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  {
    name: "getPublicContentItem (content slug)",
    call: (b) => getPublicContentItem("north-stars", s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  { name: "getSeasonDetail", call: (b) => getSeasonDetail(s(b)), outcome: { rejects: /Season not found/ } },
  { name: "getPracticeSessionDetail", call: (b) => getPracticeSessionDetail(s(b)), outcome: { returns: null } },
  { name: "getPracticeSessionForEdit", call: (b) => getPracticeSessionForEdit(s(b)), outcome: { returns: null } },
  {
    name: "confirmEmailVerification",
    call: (b) => confirmEmailVerification(s(b)),
    outcome: {
      returns: {
        success: false,
        error: "This verification link is invalid or has expired. Request a new one from the login page.",
      },
    },
    values: MALFORMED_TOKENS,
  },
  {
    name: "confirmEmailChange",
    call: (b) => confirmEmailChange(s(b)),
    outcome: { returns: { success: false, error: "This confirmation link is invalid or has expired." } },
    values: MALFORMED_TOKENS,
  },
  {
    name: "checkPermissionAction (league id)",
    call: (b) => checkPermissionAction(s(b), Permission.VIEW_LEAGUE),
    outcome: { returns: { success: true, data: { hasPermission: false } } },
  },
  {
    name: "checkPermissionAction (team id)",
    call: (b) => checkPermissionAction(IDS.league, Permission.VIEW_LEAGUE, s(b)),
    outcome: { returns: { success: true, data: { hasPermission: false } } },
    values: MALFORMED_PRESENT,
  },
  { name: "getPublicVenueRelationships", call: (b) => getPublicVenueRelationships(s(b)), outcome: { returns: [] } },
  {
    name: "getTeamVenueRelationships (list)",
    call: (b) => getTeamVenueRelationships(b as string[]),
    outcome: { returns: [] },
  },
  {
    name: "getTeamVenueRelationships (entry)",
    call: (b) => getTeamVenueRelationships([IDS.team, s(b)]),
    outcome: { returns: [] },
  },
  {
    name: "getNotificationPreferences",
    call: (b) => getNotificationPreferences(s(b)),
    outcome: { returns: { success: false, error: "Failed to get notification preferences" } },
    values: MALFORMED_PRESENT,
  },
  {
    name: "generateUnsubscribeToken",
    call: (b) => generateUnsubscribeToken(s(b)),
    outcome: { returns: { success: false, error: "You don't have access to this league" } },
    values: MALFORMED_PRESENT,
  },
  {
    name: "handleUnsubscribe",
    call: (b) => handleUnsubscribe({ token: s(b) }),
    outcome: { returns: { success: false, error: "Invalid or expired unsubscribe token" } },
    values: [["a string that is not a token", "not-a-token"]],
  },
  {
    name: "getPublicVenueSchedule (slug)",
    call: (b) => getPublicVenueSchedule(s(b)),
    outcome: { returns: null },
    values: MALFORMED_SLUGS,
  },
  {
    name: "getPublicVenueSchedule (skill level ids)",
    call: (b) => getPublicVenueSchedule("north-rink", { skillLevelIds: [s(b)] }),
    outcome: { returns: null },
  },
  {
    name: "getPublicVenueContent (venue id)",
    call: (b) => getPublicVenueContent(s(b)),
    outcome: { returns: { posts: [], lessons: [], events: [] } },
  },
  {
    name: "getPublicVenueContent (skill level ids)",
    call: (b) => getPublicVenueContent(IDS.venue, { skillLevelIds: b as string[] }),
    outcome: { returns: { posts: [], lessons: [], events: [] } },
    values: MALFORMED_PRESENT,
  },
  // Server-only helpers (not server actions).
  {
    name: "hasLeagueAccess",
    call: (b) => hasLeagueAccess(IDS.user, s(b)),
    outcome: { returns: false },
  },
  {
    name: "verifyLeagueAdmin",
    call: (b) => verifyLeagueAdmin(s(b), IDS.user),
    outcome: { returns: false },
  },
  {
    name: "verifyTeamAdminInLeague (team id)",
    call: (b) => verifyTeamAdminInLeague(s(b), IDS.league, IDS.user),
    outcome: { returns: false },
  },
  {
    name: "verifyTeamAdminInLeague (league id)",
    call: (b) => verifyTeamAdminInLeague(IDS.team, s(b), IDS.user),
    outcome: { returns: false },
  },
  ...(["team", "league", "venue"] as const).map((entity) => ({
    name: `canBrandEntity (${entity} id)`,
    call: (b: unknown) => canBrandEntity(IDS.user, entity, s(b)),
    outcome: { returns: false },
  })),
  {
    name: "canUserAccessVenue (team id)",
    call: (b) => canUserAccessVenue(IDS.user, { visibility: "TEAM", teamId: s(b), leagueId: null }),
    outcome: { returns: false },
    values: MALFORMED_PRESENT,
  },
  {
    name: "canUserAccessVenue (league id)",
    call: (b) => canUserAccessVenue(IDS.user, { visibility: "LEAGUE", teamId: null, leagueId: s(b) }),
    outcome: { returns: false },
    values: MALFORMED_PRESENT,
  },
  {
    name: "isActiveTeamInLeague (team id)",
    call: (b) => isActiveTeamInLeague(s(b), IDS.league),
    outcome: { returns: false },
  },
  {
    name: "canAccessActiveTeamInLeague (league id)",
    call: (b) => canAccessActiveTeamInLeague(IDS.team, s(b)),
    outcome: { returns: false },
  },
  { name: "requireSeasonManager", call: (b) => requireSeasonManager(s(b)), outcome: { rejects: /Season not found/ } },
  { name: "requireSeasonViewer", call: (b) => requireSeasonViewer(s(b)), outcome: { rejects: /Season not found/ } },
];

beforeEach(() => {
  recorder.reset();
  mockAuth.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe.each(cases)("$name", ({ call, outcome, values = MALFORMED }) => {
  it.each(values)("refuses %s without a session lookup or query", async (_label, bad) => {
    if ("rejects" in outcome) {
      await expect(call(bad)).rejects.toThrow(outcome.rejects);
    } else {
      await expect(call(bad)).resolves.toEqual(outcome.returns);
    }
    expect(mockAuth).not.toHaveBeenCalled();
    expect(nonStringIdArguments(recorder.calls)).toEqual([]);
    expect(recorder.calls).toEqual([]);
  });
});

describe("well-formed values still reach their reads", () => {
  it("getPublicSignupEvent looks the event up by a well-formed link token", async () => {
    await expect(getPublicSignupEvent({ linkToken: HEX })).resolves.toBeNull();
    expect(recorder.calls.find((c) => c.model === "signupEvent")?.args[0]).toMatchObject({
      where: { linkToken: HEX },
    });
  });

  it("listPublicSignupEvents leaves out filters that were not supplied", async () => {
    await expect(listPublicSignupEvents({ venueId: IDS.venue })).resolves.toEqual([]);
    const where = (recorder.calls[0].args[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ venueId: IDS.venue, visibility: "PUBLIC" });
    expect(Object.keys(where)).not.toContain("hostLeagueId");
    expect(Object.keys(where)).not.toContain("hostOrganizationId");
  });

  it("getPublicGearWishlist looks the wishlist up by a well-formed share token", async () => {
    await expect(getPublicGearWishlist(SHARE)).resolves.toBeNull();
    expect(recorder.calls[0].args[0]).toMatchObject({ where: { shareToken: SHARE } });
  });

  it("getPublicAssociationTeams lists a league's published teams", async () => {
    recorder.mock("team", "findMany").mockResolvedValue([{ id: "clteamx1", name: "North Stars" }]);
    await expect(getPublicAssociationTeams(IDS.league)).resolves.toEqual([{ id: "clteamx1", name: "North Stars" }]);
    expect(recorder.calls[0].args[0]).toMatchObject({ where: { leagueId: IDS.league } });
  });

  it("exportFinancialReportCSV still checks league admin for a well-formed id", async () => {
    await expect(exportFinancialReportCSV(IDS.league)).resolves.toEqual(notAdmin);
    expect(recorder.calls.find((c) => c.model === "leagueUser")?.args[0]).toMatchObject({
      where: { leagueId: IDS.league, role: "LEAGUE_ADMIN" },
    });
  });
});
