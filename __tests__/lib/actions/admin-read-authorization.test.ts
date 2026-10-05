import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDS } from "@/__tests__/helpers/prisma-recorder";

const recorder = await vi.hoisted(async () => {
  const { createPrismaRecorder } = await import("@/__tests__/helpers/prisma-recorder");
  return createPrismaRecorder();
});

const staffCheck = vi.hoisted(() => ({ requireVenueContentManager: vi.fn(), requireVenueProfileManager: vi.fn() }));

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
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    // The staff role check is stubbed to pass so these tests isolate the
    // action's own venue/organization check.
    requireVenueContentManager: staffCheck.requireVenueContentManager,
    requireVenueProfileManager: staffCheck.requireVenueProfileManager,
  };
});

import { getVenueContentAdminData } from "@/lib/actions/venue-content";
import { getVenueRelationshipAdminData } from "@/lib/actions/venue-relationships";
import { listHostGroupOptions } from "@/lib/actions/signup-events";

beforeEach(() => {
  recorder.reset();
  staffCheck.requireVenueContentManager.mockResolvedValue(IDS.user);
  staffCheck.requireVenueProfileManager.mockResolvedValue(IDS.user);
});

function queried(model: string) {
  return recorder.calls.some((call) => call.model === model);
}

describe("venue admin reads require the venue to belong to the organization", () => {
  it("getVenueContentAdminData refuses a venue that belongs to another organization", async () => {
    recorder.mock("venue", "findFirst").mockResolvedValue(null);

    const result = await getVenueContentAdminData(IDS.org, IDS.venue2);

    expect(result.success).toBe(false);
    expect(queried("lessonOffering")).toBe(false);
    expect(queried("venueContentPost")).toBe(false);
  });

  it("getVenueContentAdminData loads content for a venue in the organization", async () => {
    recorder.mock("venue", "findFirst").mockResolvedValue({ id: IDS.venue, slug: "north", timezone: "UTC" });
    recorder.mock("lessonOffering", "findMany").mockResolvedValue([]);
    recorder.mock("venueContentPost", "findMany").mockResolvedValue([]);

    const result = await getVenueContentAdminData(IDS.org, IDS.venue);

    expect(result).toEqual({ success: true, data: { venueId: IDS.venue, lessons: [], posts: [] } });
  });

  it("getVenueRelationshipAdminData refuses a venue that belongs to another organization", async () => {
    recorder.mock("venue", "findFirst").mockResolvedValue(null);

    const result = await getVenueRelationshipAdminData(IDS.org, IDS.venue2);

    expect(result.success).toBe(false);
    expect(queried("venueRelationship")).toBe(false);
  });

  it("getVenueRelationshipAdminData loads relationships for a venue in the organization", async () => {
    recorder.mock("venue", "findFirst").mockResolvedValue({ id: IDS.venue, name: "North", slug: "north" });
    recorder.mock("venueRelationship", "findMany").mockResolvedValue([]);

    const result = await getVenueRelationshipAdminData(IDS.org, IDS.venue);

    expect(result).toEqual({ success: true, data: { venueId: IDS.venue, relationships: [] } });
  });
});

describe("listHostGroupOptions requires rights over the host", () => {
  const empty = { divisions: [], teams: [] };

  it("returns no options for a league the caller does not administer", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "MEMBER", league: { isActive: true } });

    expect(await listHostGroupOptions({ kind: "league", id: IDS.league2 })).toEqual(empty);
    expect(queried("division")).toBe(false);
    expect(queried("team")).toBe(false);
  });

  it("returns no options for a team the caller does not administer", async () => {
    recorder.mock("teamMember", "findUnique").mockResolvedValue(null);

    expect(await listHostGroupOptions({ kind: "team", id: IDS.team2 })).toEqual(empty);
    expect(queried("team")).toBe(false);
  });

  it("returns no options for an organization the caller does not schedule for", async () => {
    recorder.mock("venueStaff", "findMany").mockResolvedValue([]);

    expect(await listHostGroupOptions({ kind: "organization", id: IDS.org2 })).toEqual(empty);
    expect(queried("team")).toBe(false);
  });

  it("returns the league's divisions and teams to a league admin", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "LEAGUE_ADMIN", league: { isActive: true } });
    recorder.mock("division", "findMany").mockResolvedValue([{ id: "cldiv1", name: "U12" }]);
    recorder.mock("team", "findMany").mockResolvedValue([{ id: IDS.team, name: "Hawks" }]);

    expect(await listHostGroupOptions({ kind: "league", id: IDS.league })).toEqual({
      divisions: [{ id: "cldiv1", name: "U12" }],
      teams: [{ id: IDS.team, name: "Hawks" }],
    });
  });

  it("returns options to a manager of an event hosted by that league", async () => {
    const eventId = "clevent0000000000000000001";
    recorder.mock("leagueUser", "findUnique").mockResolvedValue(null);
    recorder.mock("signupEvent", "findUnique").mockResolvedValue({
      hostOrganizationId: null,
      hostLeagueId: IDS.league,
      hostTeamId: null,
    });
    recorder.mock("eventManager", "findUnique").mockResolvedValue({ id: "clgrant00000000000000001" });
    recorder.mock("division", "findMany").mockResolvedValue([]);
    recorder.mock("team", "findMany").mockResolvedValue([{ id: IDS.team, name: "Hawks" }]);

    expect(await listHostGroupOptions({ kind: "league", id: IDS.league, eventId })).toEqual({
      divisions: [],
      teams: [{ id: IDS.team, name: "Hawks" }],
    });
  });

  it("does not let an event manager read a different host's options", async () => {
    const eventId = "clevent0000000000000000001";
    recorder.mock("leagueUser", "findUnique").mockResolvedValue(null);
    recorder.mock("signupEvent", "findUnique").mockResolvedValue({
      hostOrganizationId: null,
      hostLeagueId: IDS.league,
      hostTeamId: null,
    });
    recorder.mock("eventManager", "findUnique").mockResolvedValue({ id: "clgrant00000000000000001" });

    expect(await listHostGroupOptions({ kind: "league", id: IDS.league2, eventId })).toEqual(empty);
    expect(queried("division")).toBe(false);
  });
});
