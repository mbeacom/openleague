import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDS } from "@/__tests__/helpers/prisma-recorder";

/**
 * - A malformed link token is ignored rather than refused, so event managers
 *   still see the gallery, games and standings without it.
 * - Stored slugs minted from long names (a trailing hyphen, or a double
 *   hyphen before a numeric suffix) still resolve on the public readers.
 */

const recorder = await vi.hoisted(async () => {
  const { createPrismaRecorder } = await import("@/__tests__/helpers/prisma-recorder");
  return createPrismaRecorder();
});
const { manager } = vi.hoisted(() => ({ manager: { value: true } }));

vi.mock("@/lib/db/prisma", () => ({ prisma: recorder.prisma }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "cluser00000000000000000001" } })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/media/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/blob")>()),
  isBlobEnabled: () => true,
}));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isEventManager: vi.fn(async () => manager.value),
}));

import { listEventMedia } from "@/lib/actions/event-media";
import { getEventStandings, getPublicEventGames } from "@/lib/actions/event-teams";
import { getPublicSignupEvent } from "@/lib/actions/signup-events";
import {
  getPublicAssociationProfile,
  getPublicTeamProfile,
  resolveActiveAssociation,
  resolvePublicAssociation,
  resolvePublicTeam,
} from "@/lib/actions/association-profile";
import { getPublicContentItem } from "@/lib/actions/public-content";
import { getPublicRinkProfile } from "@/lib/actions/venue-organizations";
import { getPublicVenueSchedule } from "@/lib/actions/venue-schedules";
import { GET as associationIcs } from "@/app/api/associations/[slug]/schedule.ics/route";
import { slugifyName } from "@/lib/utils/slugify";
import { parseSlug } from "@/lib/utils/ids";

const EVENT_ID = IDS.team;
const BAD_TOKENS: Array<[string, unknown]> = [
  ["a filter object", { not: "x" }],
  ["an array", ["a"]],
  ["a string that is not a token", "not-a-token"],
];
const STORED_SLUGS = ["greater-northern-metropolitan-youth-hockey-association-of-t-", "north-stars--2"];

beforeEach(() => {
  recorder.reset();
  manager.value = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const gate = {
  id: EVENT_ID,
  status: "PUBLISHED",
  visibility: "LINK",
  linkToken: "a".repeat(64),
  galleryEnabled: true,
  galleryVisibility: "PUBLIC",
  teamsPublishedAt: new Date("2026-09-01T00:00:00Z"),
  category: "TOURNAMENT",
  ageClassification: "ADULT",
};

describe("malformed link tokens are ignored for managers", () => {
  it.each(BAD_TOKENS)("listEventMedia shows the gallery to a manager with %s", async (_label, bad) => {
    recorder.mock("signupEvent", "findUnique").mockResolvedValue(gate);
    const result = await listEventMedia({ eventId: EVENT_ID, linkToken: bad as string });
    expect(result).toMatchObject({ canModerate: true, items: [] });
    expect(recorder.calls.some((c) => c.model === "eventMediaItem")).toBe(true);
    expect(JSON.stringify(recorder.calls)).not.toContain("not-a-token");
  });

  it.each(BAD_TOKENS)("getPublicEventGames lists games for a manager with %s", async (_label, bad) => {
    recorder.mock("signupEvent", "findUnique").mockResolvedValue(gate);
    await expect(getPublicEventGames(EVENT_ID, bad as string)).resolves.not.toBeNull();
    expect(recorder.calls.find((c) => c.model === "eventGame")?.args[0]).toMatchObject({
      where: { eventId: EVENT_ID },
    });
  });

  it.each(BAD_TOKENS)("getEventStandings builds standings for a manager with %s", async (_label, bad) => {
    recorder.mock("signupEvent", "findUnique").mockResolvedValue(gate);
    recorder.mock("eventTeam", "findMany").mockResolvedValue([{ id: "clteamev1", name: "Red" }]);
    await expect(getEventStandings(EVENT_ID, bad as string)).resolves.not.toBeNull();
    expect(recorder.calls.some((c) => c.model === "eventTeam")).toBe(true);
  });

  it("a malformed token still grants nothing to a non-manager", async () => {
    manager.value = false;
    recorder.mock("signupEvent", "findUnique").mockResolvedValue(gate);
    await expect(getPublicEventGames(EVENT_ID, "not-a-token")).resolves.toBeNull();
    await expect(listEventMedia({ eventId: EVENT_ID, linkToken: "not-a-token" })).resolves.toBeNull();
  });

  it("getPublicSignupEvent with only a malformed token looks nothing up", async () => {
    await expect(getPublicSignupEvent({ linkToken: "not-a-token" })).resolves.toBeNull();
    expect(recorder.calls).toEqual([]);
  });
});

describe("stored slugs from long names still resolve", () => {
  it.each(STORED_SLUGS)("resolvePublicAssociation / resolveActiveAssociation accept %s", async (slug) => {
    recorder.mock("league", "findFirst").mockResolvedValue({ id: IDS.league, slug });
    await expect(resolvePublicAssociation(slug)).resolves.toEqual({
      id: IDS.league,
      canonicalSlug: slug,
      redirected: false,
    });
    await expect(resolveActiveAssociation(slug)).resolves.toMatchObject({ id: IDS.league });
    expect(recorder.calls[0].args[0]).toMatchObject({ where: { slug } });
  });

  it.each(STORED_SLUGS)("a retired slug %s still follows its redirect", async (slug) => {
    recorder.mock("publicSlugRedirect", "findFirst").mockResolvedValue({
      league: { id: IDS.league, slug: "north-stars", profileStatus: "PUBLISHED", isActive: true },
    });
    await expect(resolvePublicAssociation(slug)).resolves.toEqual({
      id: IDS.league,
      canonicalSlug: "north-stars",
      redirected: true,
    });
  });

  it.each(STORED_SLUGS)("getPublicAssociationProfile loads %s", async (slug) => {
    recorder.mock("league", "findFirst").mockResolvedValue({ id: IDS.league, slug, name: "Assoc" });
    await expect(getPublicAssociationProfile(slug)).resolves.toMatchObject({ canonicalSlug: slug });
  });

  it.each(STORED_SLUGS)("getPublicContentItem resolves the association %s", async (slug) => {
    recorder.mock("league", "findFirst").mockResolvedValue({ id: IDS.league, slug, name: "Assoc" });
    recorder.mock("publicContentItem", "findFirst").mockResolvedValue({ id: "clitem1" });
    await expect(getPublicContentItem(slug, "season-opener")).resolves.toMatchObject({
      item: { id: "clitem1" },
    });
  });

  it.each(STORED_SLUGS)("resolvePublicTeam / getPublicTeamProfile accept a team slug %s", async (slug) => {
    recorder.mock("team", "findFirst").mockResolvedValue({ id: IDS.team, slug });
    await expect(resolvePublicTeam(IDS.league, slug)).resolves.toMatchObject({ canonicalSlug: slug });
    await expect(getPublicTeamProfile(IDS.league, slug)).resolves.toMatchObject({ canonicalSlug: slug });
  });

  it.each(STORED_SLUGS)("getPublicRinkProfile and getPublicVenueSchedule look up %s", async (slug) => {
    await getPublicRinkProfile(slug);
    await getPublicVenueSchedule(slug);
    const lookups = recorder.calls.filter((c) => c.model === "venue");
    expect(lookups).toHaveLength(2);
    for (const call of lookups) expect(call.args[0]).toMatchObject({ where: { slug } });
  });

  it.each(STORED_SLUGS)("associations/[slug]/schedule.ics serves %s", async (slug) => {
    recorder.mock("league", "findFirst").mockResolvedValue({ id: IDS.league, slug, name: "Assoc" });
    const response = await associationIcs(new Request("https://example.test/x") as never, {
      params: Promise.resolve({ slug }),
    });
    expect(response.status).toBe(200);
  });

  it.each([
    ["a filter object", { not: "x" }],
    ["an array", ["a"]],
    ["undefined", undefined],
    ["a leading hyphen", "-north"],
    ["upper case", "North"],
    ["a space", "north stars"],
    ["over 160 characters", "a".repeat(161)],
  ])("parseSlug still rejects %s", (_label, value) => {
    expect(parseSlug(value)).toBeNull();
  });
});

describe("slugifyName", () => {
  it("does not end a slug with a hyphen when the 60th character is a separator", () => {
    const name = "Greater Northern Metropolitan Youth Hockey Association of T Valley League";
    const slug = slugifyName(name);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toBe("greater-northern-metropolitan-youth-hockey-association-of-t");
    expect(`${slug}-2`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it.each([
    ["  North Stars!! ", "north-stars"],
    ["***", "association"],
    ["A".repeat(70), "a".repeat(60)],
  ])("slugifies %j as %s", (name, expected) => {
    expect(slugifyName(name)).toBe(expected);
  });
});
