import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDS, MALFORMED_IDS, nonStringIdArguments } from "@/__tests__/helpers/prisma-recorder";

/**
 * Server actions that read by league, team, organization or venue id must
 * refuse malformed id arguments before any authorization lookup or query, and
 * keep returning their usual "no access" result.
 */

const recorder = await vi.hoisted(async () => {
  const { createPrismaRecorder } = await import("@/__tests__/helpers/prisma-recorder");
  return createPrismaRecorder();
});

vi.mock("@/lib/db/prisma", () => ({ prisma: recorder.prisma }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "cluser00000000000000000001" } })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { getVenueScheduleAdminData } from "@/lib/actions/venue-schedules";
import { getVenueContentAdminData } from "@/lib/actions/venue-content";
import {
  getLeagueWithStats,
  getLeagueTeamsWithDivisions,
  getLeagueDivisions,
  getLeagueStatisticsData,
} from "@/lib/actions/league";
import { listHostGroupOptions } from "@/lib/actions/signup-events";
import { getProposalsForTeam, getProposalsForLeague } from "@/lib/actions/game-proposals";
import { getTeamEvents } from "@/lib/actions/events";
import { getVenueRequestQueue } from "@/lib/actions/venue-requests";
import { getGearPledgeAdminContext, getGearPledgesForAdmin } from "@/lib/actions/gear-pledges";
import { getVenueRegistrations } from "@/lib/actions/session-registrations";
import { getTeamMembersWithRoles } from "@/lib/actions/permissions";
import { exportLeagueRoster } from "@/lib/actions/roster";
import { getGearInventoryContext, getGearReservationContext } from "@/lib/actions/gear-context";
import {
  getLeagueRosterData,
  getLeagueInvitationsData,
  getLeagueMessagesData,
  getLeagueScheduleData,
  getNewLeagueGameContext,
} from "@/lib/actions/league-context";
import { getGearNeedsContext, getGearNeedDetail, getTeamGearNeeds } from "@/lib/actions/gear-needs";
import { listAssociationResponsibilityGrants } from "@/lib/actions/association-roles";
import { listAssociationContent } from "@/lib/actions/public-content";
import { getSeasons } from "@/lib/actions/seasons";
import { getVenueRelationshipAdminData } from "@/lib/actions/venue-relationships";
import { getAuditActionsForLeague } from "@/lib/actions/audit";

type Outcome = { returns: unknown } | { rejects: RegExp };

type Case = {
  /** Describes which argument carries the malformed id. */
  name: string;
  call: (bad: unknown) => Promise<unknown>;
  outcome: Outcome;
};

const s = (value: unknown) => value as string;
const unauthorized = /Unauthorized/;

const cases: Case[] = [
  {
    name: "getVenueScheduleAdminData (organization id)",
    call: (bad) => getVenueScheduleAdminData(s(bad), IDS.venue),
    outcome: { returns: { success: false, error: "Failed to load venue schedule data." } },
  },
  {
    name: "getVenueScheduleAdminData (venue id)",
    call: (bad) => getVenueScheduleAdminData(IDS.org, s(bad)),
    outcome: { returns: { success: false, error: "Failed to load venue schedule data." } },
  },
  {
    name: "getVenueContentAdminData (organization id)",
    call: (bad) => getVenueContentAdminData(s(bad), IDS.venue),
    outcome: { returns: { success: false, error: "Failed to load venue content." } },
  },
  {
    name: "getVenueContentAdminData (venue id)",
    call: (bad) => getVenueContentAdminData(IDS.org, s(bad)),
    outcome: { returns: { success: false, error: "Failed to load venue content." } },
  },
  { name: "getLeagueWithStats", call: (bad) => getLeagueWithStats(s(bad)), outcome: { returns: null } },
  {
    name: "getLeagueTeamsWithDivisions",
    call: (bad) => getLeagueTeamsWithDivisions(s(bad)),
    outcome: { returns: null },
  },
  { name: "getLeagueDivisions", call: (bad) => getLeagueDivisions(s(bad)), outcome: { returns: [] } },
  {
    name: "getLeagueStatisticsData",
    call: (bad) => getLeagueStatisticsData(s(bad)),
    outcome: { returns: { success: false, error: "Unauthorized - you are not a member of this league" } },
  },
  {
    name: "listHostGroupOptions (league host id)",
    call: (bad) => listHostGroupOptions({ kind: "league", id: s(bad) }),
    outcome: { returns: { divisions: [], teams: [] } },
  },
  {
    name: "listHostGroupOptions (organization host id)",
    call: (bad) => listHostGroupOptions({ kind: "organization", id: s(bad) }),
    outcome: { returns: { divisions: [], teams: [] } },
  },
  {
    name: "listHostGroupOptions (event id)",
    call: (bad) =>
      bad === undefined
        ? listHostGroupOptions({ kind: "team", id: "not a host" })
        : listHostGroupOptions({ kind: "team", id: IDS.team, eventId: s(bad) }),
    outcome: { returns: { divisions: [], teams: [] } },
  },
  { name: "getProposalsForTeam", call: (bad) => getProposalsForTeam(s(bad)), outcome: { rejects: unauthorized } },
  {
    name: "getProposalsForLeague",
    call: (bad) => getProposalsForLeague(s(bad)),
    outcome: { rejects: unauthorized },
  },
  { name: "getTeamEvents", call: (bad) => getTeamEvents(s(bad)), outcome: { rejects: unauthorized } },
  {
    name: "getVenueRequestQueue (organization id)",
    call: (bad) => getVenueRequestQueue(s(bad), IDS.venue),
    outcome: { returns: { success: false, error: "Failed to load request queue." } },
  },
  {
    name: "getVenueRequestQueue (venue id)",
    call: (bad) => getVenueRequestQueue(IDS.org, s(bad)),
    outcome: { returns: { success: false, error: "Failed to load request queue." } },
  },
  {
    name: "getGearPledgeAdminContext",
    call: (bad) => getGearPledgeAdminContext(s(bad)),
    outcome: { rejects: unauthorized },
  },
  {
    name: "getGearPledgesForAdmin",
    call: (bad) => getGearPledgesForAdmin(s(bad)),
    outcome: { rejects: unauthorized },
  },
  {
    name: "getVenueRegistrations (organization id)",
    call: (bad) => getVenueRegistrations({ organizationId: s(bad), venueId: IDS.venue }),
    outcome: { rejects: unauthorized },
  },
  {
    name: "getVenueRegistrations (venue id)",
    call: (bad) => getVenueRegistrations({ organizationId: IDS.org, venueId: s(bad) }),
    outcome: { rejects: unauthorized },
  },
  {
    name: "getVenueRegistrations (whole input)",
    call: (bad) => getVenueRegistrations(bad as { organizationId: string; venueId: string }),
    outcome: { rejects: unauthorized },
  },
  {
    name: "getTeamMembersWithRoles (league id)",
    call: (bad) => getTeamMembersWithRoles(s(bad), IDS.team),
    outcome: { returns: { success: false, error: "Unauthorized - you are not a member of this league" } },
  },
  {
    name: "getTeamMembersWithRoles (team id)",
    call: (bad) => getTeamMembersWithRoles(IDS.league, s(bad)),
    outcome: { returns: { success: false, error: "Unauthorized - you are not a member of this league" } },
  },
  {
    name: "exportLeagueRoster",
    call: (bad) => exportLeagueRoster(s(bad)),
    outcome: { returns: { error: "Unauthorized: Only league admins can export roster data" } },
  },
  {
    name: "getGearInventoryContext",
    call: (bad) => getGearInventoryContext(s(bad)),
    outcome: { returns: null },
  },
  {
    name: "getGearReservationContext",
    call: (bad) => getGearReservationContext(s(bad)),
    outcome: { returns: null },
  },
  { name: "getLeagueRosterData", call: (bad) => getLeagueRosterData(s(bad)), outcome: { returns: null } },
  {
    name: "getLeagueInvitationsData",
    call: (bad) => getLeagueInvitationsData(s(bad)),
    outcome: { returns: null },
  },
  { name: "getLeagueMessagesData", call: (bad) => getLeagueMessagesData(s(bad)), outcome: { returns: null } },
  { name: "getLeagueScheduleData", call: (bad) => getLeagueScheduleData(s(bad)), outcome: { returns: null } },
  {
    name: "getNewLeagueGameContext",
    call: (bad) => getNewLeagueGameContext(s(bad)),
    outcome: { returns: null },
  },
  { name: "getGearNeedsContext", call: (bad) => getGearNeedsContext(s(bad)), outcome: { returns: null } },
  {
    name: "getGearNeedDetail (league id)",
    call: (bad) => getGearNeedDetail(s(bad), IDS.need),
    outcome: { returns: null },
  },
  {
    name: "getGearNeedDetail (need id)",
    call: (bad) => getGearNeedDetail(IDS.league, s(bad)),
    outcome: { returns: null },
  },
  {
    name: "getTeamGearNeeds (league id)",
    call: (bad) => getTeamGearNeeds(s(bad), IDS.team),
    outcome: { returns: [] },
  },
  {
    name: "getTeamGearNeeds (team id)",
    call: (bad) => getTeamGearNeeds(IDS.league, s(bad)),
    outcome: { returns: [] },
  },
  {
    name: "listAssociationResponsibilityGrants",
    call: (bad) => listAssociationResponsibilityGrants(s(bad)),
    outcome: { returns: { success: false, error: "You do not have permission to view responsibilities." } },
  },
  {
    name: "listAssociationContent",
    call: (bad) => listAssociationContent(s(bad)),
    outcome: { returns: { success: false, error: "You do not have permission to view content." } },
  },
  {
    name: "getSeasons (league id)",
    call: (bad) =>
      bad === undefined ? getSeasons({ leagueId: "t1" }) : getSeasons({ leagueId: s(bad) }),
    outcome: { rejects: unauthorized },
  },
  {
    name: "getSeasons (team id)",
    call: (bad) => (bad === undefined ? getSeasons({ teamId: "t1" }) : getSeasons({ teamId: s(bad) })),
    outcome: { rejects: unauthorized },
  },
  {
    name: "getVenueRelationshipAdminData (organization id)",
    call: (bad) => getVenueRelationshipAdminData(s(bad), IDS.venue),
    outcome: { returns: { success: false, error: "Failed to load venue relationships." } },
  },
  {
    name: "getVenueRelationshipAdminData (venue id)",
    call: (bad) => getVenueRelationshipAdminData(IDS.org, s(bad)),
    outcome: { returns: { success: false, error: "Failed to load venue relationships." } },
  },
  {
    name: "getAuditActionsForLeague",
    call: (bad) => getAuditActionsForLeague(s(bad)),
    outcome: { returns: [] },
  },
];

beforeEach(() => {
  recorder.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(cases)("$name", ({ call, outcome }) => {
  it.each(MALFORMED_IDS)("returns the no-access result for %s without querying", async (_label, bad) => {
    if ("rejects" in outcome) {
      await expect(call(bad)).rejects.toThrow(outcome.rejects);
    } else {
      await expect(call(bad)).resolves.toEqual(outcome.returns);
    }
    expect(nonStringIdArguments(recorder.calls)).toEqual([]);
    expect(recorder.calls).toEqual([]);
  });
});

describe("well-formed ids still load data", () => {
  it("getLeagueDivisions returns the league's divisions to a member", async () => {
    recorder.mock("leagueUser", "findFirst").mockResolvedValue({ id: "clmember1" });
    recorder.mock("division", "findMany").mockResolvedValue([{ id: "cldiv1", name: "U12" }]);

    await expect(getLeagueDivisions(IDS.league)).resolves.toEqual([{ id: "cldiv1", name: "U12" }]);
    expect(nonStringIdArguments(recorder.calls)).toEqual([]);
  });

  it("getTeamEvents returns the team's events to a member", async () => {
    recorder.mock("teamMember", "findUnique").mockResolvedValue({ role: "MEMBER" });
    recorder.mock("event", "findMany").mockResolvedValue([{ id: "clevent1" }]);

    await expect(getTeamEvents(IDS.team)).resolves.toEqual([{ id: "clevent1" }]);
    expect(recorder.calls.find((c) => c.model === "event")?.args[0]).toMatchObject({
      where: { teamId: IDS.team },
    });
  });

  it("getProposalsForLeague returns proposals to a league admin", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "LEAGUE_ADMIN", league: { isActive: true } });
    recorder.mock("gameProposal", "findMany").mockResolvedValue([]);

    await expect(getProposalsForLeague(IDS.league)).resolves.toEqual([]);
    expect(recorder.calls.find((c) => c.model === "gameProposal")?.args[0]).toMatchObject({
      where: { leagueId: IDS.league },
    });
  });

  it("getProposalsForTeam refuses a caller who is not a team admin", async () => {
    recorder.mock("teamMember", "findUnique").mockResolvedValue({ role: "MEMBER" });

    await expect(getProposalsForTeam(IDS.team)).rejects.toThrow(unauthorized);
    expect(recorder.calls.some((c) => c.model === "gameProposal")).toBe(false);
  });

  it("getSeasons lists a league's seasons for a member", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "MEMBER", league: { isActive: true } });
    recorder.mock("season", "findMany").mockResolvedValue([{ id: "clseason1" }]);

    await expect(getSeasons({ leagueId: IDS.league })).resolves.toEqual([{ id: "clseason1" }]);
    expect(nonStringIdArguments(recorder.calls)).toEqual([]);
  });

  it("getGearNeedsContext returns an empty context to a league admin with no teams", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "LEAGUE_ADMIN", league: { isActive: true } });

    await expect(getGearNeedsContext(IDS.league)).resolves.toEqual({
      canManageAll: true,
      teamIds: [],
      teams: [],
      needs: [],
    });
  });

  it("getAuditActionsForLeague lists action names for a league admin", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "LEAGUE_ADMIN", league: { isActive: true } });
    recorder.mock("auditLog", "findMany").mockResolvedValue([{ action: "league_updated" }]);

    await expect(getAuditActionsForLeague(IDS.league)).resolves.toEqual(["league_updated"]);
  });

  it("getVenueScheduleAdminData refuses staff of a different organization's venue", async () => {
    recorder.mock("venue", "findUnique").mockResolvedValue({ organizationId: IDS.org2 });
    recorder.mock("venueStaff", "findMany").mockResolvedValue([{ role: "OWNER" }]);

    await expect(getVenueScheduleAdminData(IDS.org, IDS.venue)).resolves.toEqual({
      success: false,
      error: "Failed to load venue schedule data.",
    });
    expect(recorder.calls.some((c) => c.model === "iceSurface")).toBe(false);
  });
});
