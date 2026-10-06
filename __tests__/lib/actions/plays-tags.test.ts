import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, tx } = vi.hoisted(() => {
    const tx = {
        play: { update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn() },
    };
    return {
        tx,
        mockPrisma: {
            $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
            play: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        },
    };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireTeamMember: vi.fn(), requireTeamAdmin: vi.fn().mockResolvedValue("user-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPlay, getPlayById, getPlaysByTeam, updatePlay } from "@/lib/actions/plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { AGE_GROUP_REPEAT_MESSAGE, AGE_GROUP_UNKNOWN_MESSAGE } from "@/lib/utils/age-groups";

const TEAM = "cjld2cjxh0000qzrmn831i7rn";
const PLAY = "cjld2cyuq0000t3rmniod1foy";
const AT = new Date("2026-10-03T12:00:00Z");

beforeEach(() => {
    vi.clearAllMocks();
    tx.practiceSessionPlay.findMany.mockResolvedValue([]); // detach finds no sessions
    tx.play.update.mockResolvedValue({ id: PLAY, name: "Drill", isTemplate: true });
    mockPrisma.play.create.mockResolvedValue({ id: PLAY, name: "Drill", isTemplate: true });
});

describe("plays: drill tags", () => {
    it("createPlay stores the defaults when no tags are sent", async () => {
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData() });
        expect(mockPrisma.play.create.mock.calls[0][0].data).toMatchObject({ focus: "team", goalies: "optional" });
    });

    it("createPlay stores the sent tags", async () => {
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), focus: "goalies", goalies: "required" });
        expect(mockPrisma.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required" });
    });

    it("updatePlay writes a tag only when it is sent", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: null });
        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData() });
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("focus");
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("goalies");

        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData(), goalies: "none" });
        expect(tx.play.update.mock.calls[1][0].data).toMatchObject({ goalies: "none" });
        expect(tx.play.update.mock.calls[1][0].data).not.toHaveProperty("focus");
    });

    it("getPlaysByTeam filters by tags, keeps pagination and total, and narrows stored strings", async () => {
        mockPrisma.play.findMany.mockResolvedValue([
            { id: PLAY, name: "Drill", description: null, thumbnail: null, isTemplate: true, focus: "goalies", goalies: "bogus", createdAt: AT, updatedAt: AT },
        ]);
        mockPrisma.play.count.mockResolvedValue(21);
        const result = await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 2, limit: 20, dateFilter: "all", focus: "goalies", goalies: "required" });

        const query = mockPrisma.play.findMany.mock.calls[0][0];
        expect(query.where).toMatchObject({ teamId: TEAM, sessionId: null, isTemplate: true, focus: "goalies", goalies: "required" });
        expect(query).toMatchObject({ skip: 20, take: 20 });
        // A stable order (id breaks createdAt ties), so offset pages never skip or repeat a drill.
        expect(query.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
        expect(query.select).toMatchObject({ focus: true, goalies: true });
        expect(mockPrisma.play.count.mock.calls[0][0].where).toEqual(query.where);
        expect(result.success && result.data.total).toBe(21);
        expect(result.success && result.data.plays[0]).toMatchObject({ focus: "goalies", goalies: "optional" });
    });

    it("getPlaysByTeam adds no tag filter when none is asked", async () => {
        mockPrisma.play.findMany.mockResolvedValue([]);
        mockPrisma.play.count.mockResolvedValue(0);
        await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        const where = mockPrisma.play.findMany.mock.calls[0][0].where;
        expect(where).not.toHaveProperty("focus");
        expect(where).not.toHaveProperty("goalies");
    });

    it("getPlayById returns the tags", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({
            id: PLAY, name: "Drill", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            teamId: TEAM, sessionId: null, focus: "skaters", goalies: "none", createdAt: AT, updatedAt: AT,
        });
        const result = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(mockPrisma.play.findUnique.mock.calls[0][0].select).toMatchObject({ focus: true, goalies: true });
        expect(result.success && result.data).toMatchObject({ focus: "skaters", goalies: "none" });
    });
});

describe("plays: age groups (age-group templates R2, R3)", () => {
    it("createPlay stores none by default, and the sent groups in table order", async () => {
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData() });
        expect(mockPrisma.play.create.mock.calls[0][0].data).toMatchObject({ ageGroups: [] });
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), ageGroups: ["u10", "u8"] });
        expect(mockPrisma.play.create.mock.calls[1][0].data).toMatchObject({ ageGroups: ["u8", "u10"] });
    });

    it("createPlay refuses an unknown or repeated group without writing", async () => {
        const unknown = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), ageGroups: ["u7" as never] });
        const repeated = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), ageGroups: ["u8", "u8"] });
        expect(unknown).toMatchObject({ success: false, error: "Invalid input" });
        expect(JSON.stringify(unknown)).toContain(AGE_GROUP_UNKNOWN_MESSAGE);
        expect(JSON.stringify(repeated)).toContain(AGE_GROUP_REPEAT_MESSAGE);
        expect(mockPrisma.play.create).not.toHaveBeenCalled();
    });

    it("updatePlay writes the groups only when sent; [] clears them", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: null });
        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData() });
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("ageGroups");
        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData(), ageGroups: [] });
        expect(tx.play.update.mock.calls[1][0].data).toMatchObject({ ageGroups: [] });
    });

    it("getPlaysByTeam filters by age with untagged drills included, beside the search, and narrows stored arrays", async () => {
        mockPrisma.play.findMany.mockResolvedValue([
            { id: PLAY, name: "Drill", description: null, thumbnail: null, isTemplate: true, focus: "team", goalies: "optional", ageGroups: ["u10", "u7", "u8", "u8"], createdAt: AT, updatedAt: AT },
        ]);
        mockPrisma.play.count.mockResolvedValue(1);
        const result = await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all", search: "breakout", ageGroup: "u10" });

        const query = mockPrisma.play.findMany.mock.calls[0][0];
        expect(query.where.AND).toEqual([{ OR: [{ ageGroups: { isEmpty: true } }, { ageGroups: { has: "u10" } }] }]);
        // The search keeps its own OR: the age clause never replaces it.
        expect(query.where.OR).toEqual([
            { name: { contains: "breakout", mode: "insensitive" } },
            { description: { contains: "breakout", mode: "insensitive" } },
        ]);
        expect(mockPrisma.play.count.mock.calls[0][0].where).toEqual(query.where);
        expect(query.select).toMatchObject({ ageGroups: true });
        expect(result.success && result.data.plays[0].ageGroups).toEqual(["u8", "u10"]);
    });

    it("getPlaysByTeam adds no age clause for All ages, and refuses an unknown age", async () => {
        mockPrisma.play.findMany.mockResolvedValue([]);
        mockPrisma.play.count.mockResolvedValue(0);
        await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(mockPrisma.play.findMany.mock.calls[0][0].where).not.toHaveProperty("AND");
        const refused = await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all", ageGroup: "u7" as never });
        expect(refused).toMatchObject({ success: false, error: "Invalid input" });
        expect(mockPrisma.play.findMany).toHaveBeenCalledTimes(1);
    });

    it("getPlayById returns the groups ([] for a play saved before them)", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({
            id: PLAY, name: "Drill", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            teamId: TEAM, sessionId: null, focus: "team", goalies: "optional", ageGroups: ["u12"], createdAt: AT, updatedAt: AT,
        });
        const result = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(mockPrisma.play.findUnique.mock.calls[0][0].select).toMatchObject({ ageGroups: true });
        expect(result.success && result.data.ageGroups).toEqual(["u12"]);
        mockPrisma.play.findUnique.mockResolvedValue({
            id: PLAY, name: "Drill", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            teamId: TEAM, sessionId: null, focus: "team", goalies: "optional", createdAt: AT, updatedAt: AT,
        });
        const legacy = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(legacy.success && legacy.data.ageGroups).toEqual([]);
    });
});
