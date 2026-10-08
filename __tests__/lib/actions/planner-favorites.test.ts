import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
    prisma: {
        plannerFavorite: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
        play: { findFirst: vi.fn() },
        practiceSession: { findUnique: vi.fn() },
    },
}));
vi.mock("@/lib/auth/session", () => ({ requireUserId: vi.fn(), getUserTeamRole: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { getUserTeamRole, requireUserId } from "@/lib/auth/session";
import { listPlannerFavorites, setPlannerFavorite } from "@/lib/actions/planner-favorites";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import {
    FAVORITE_DRILL_NOT_FOUND,
    FAVORITE_PRACTICE_NOT_FOUND,
    MAX_PLANNER_FAVORITES,
    plannerFavoriteLimitMessage,
} from "@/lib/utils/planner-favorites";

const USER = "cjld2cjxh0000qzrmn831i7us";
const TEAM = "cjld2cjxh0000qzrmn831i7rn";
const PLAY = "cjld2cyuq0000t3rmniod1foy";
const SESSION = "cjld2cyuq0000t3rmniod1fsx";

describe("planner favorite actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireUserId).mockResolvedValue(USER);
        vi.mocked(prisma.plannerFavorite.upsert).mockResolvedValue({} as never);
        vi.mocked(prisma.plannerFavorite.deleteMany).mockResolvedValue({ count: 1 } as never);
        vi.mocked(prisma.plannerFavorite.count).mockResolvedValue(0 as never);
        vi.mocked(prisma.plannerFavorite.findUnique).mockResolvedValue(null as never);
    });

    it("lists only the signed-in user's favorites of one kind", async () => {
        vi.mocked(prisma.plannerFavorite.findMany).mockResolvedValue([{ targetId: PLAY }, { targetId: STARTER_PLAYS[0].id }] as never);
        const result = await listPlannerFavorites({ kind: "DRILL" });
        expect(result).toEqual({ success: true, data: [PLAY, STARTER_PLAYS[0].id] });
        expect(vi.mocked(prisma.plannerFavorite.findMany).mock.calls[0][0]).toMatchObject({ where: { userId: USER, kind: "DRILL" } });
    });

    it("authenticates before validating", async () => {
        vi.mocked(requireUserId).mockRejectedValue(new Error("NEXT_REDIRECT"));
        await expect(listPlannerFavorites({ kind: "nope" as never })).rejects.toThrow("NEXT_REDIRECT");
        await expect(setPlannerFavorite({ kind: "DRILL", targetId: "bad", favorite: true })).rejects.toThrow("NEXT_REDIRECT");
        expect(prisma.plannerFavorite.findMany).not.toHaveBeenCalled();
    });

    it("rejects malformed input without touching the database", async () => {
        const result = await setPlannerFavorite({ kind: "DRILL", targetId: "not-a-cuid", favorite: true });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
        expect(prisma.play.findFirst).not.toHaveBeenCalled();
        expect(prisma.plannerFavorite.upsert).not.toHaveBeenCalled();
    });

    it("stars a library drill of a team the user belongs to, idempotently", async () => {
        vi.mocked(prisma.play.findFirst).mockResolvedValue({ teamId: TEAM } as never);
        vi.mocked(getUserTeamRole).mockResolvedValue("MEMBER");
        const result = await setPlannerFavorite({ kind: "DRILL", targetId: PLAY, favorite: true });
        expect(result).toEqual({ success: true, data: { kind: "DRILL", targetId: PLAY, favorite: true } });
        expect(vi.mocked(prisma.play.findFirst).mock.calls[0][0]).toMatchObject({ where: { id: PLAY, sessionId: null } });
        expect(getUserTeamRole).toHaveBeenCalledWith(USER, TEAM);
        expect(vi.mocked(prisma.plannerFavorite.upsert).mock.calls[0][0]).toMatchObject({
            where: { userId_kind_targetId: { userId: USER, kind: "DRILL", targetId: PLAY } },
            create: { userId: USER, kind: "DRILL", targetId: PLAY },
            update: {},
        });
    });

    it("refuses a drill outside the user's teams, or a session-owned copy, as not found", async () => {
        vi.mocked(prisma.play.findFirst).mockResolvedValue({ teamId: TEAM } as never);
        vi.mocked(getUserTeamRole).mockResolvedValue(null);
        expect(await setPlannerFavorite({ kind: "DRILL", targetId: PLAY, favorite: true })).toEqual({ success: false, error: FAVORITE_DRILL_NOT_FOUND });
        vi.mocked(prisma.play.findFirst).mockResolvedValue(null);
        expect(await setPlannerFavorite({ kind: "DRILL", targetId: PLAY, favorite: true })).toEqual({ success: false, error: FAVORITE_DRILL_NOT_FOUND });
        expect(prisma.plannerFavorite.upsert).not.toHaveBeenCalled();
    });

    it("stars a starter drill by its stable id without a lookup", async () => {
        const starter = STARTER_PLAYS[1].id;
        const result = await setPlannerFavorite({ kind: "DRILL", targetId: starter, favorite: true });
        expect(result.success).toBe(true);
        expect(prisma.play.findFirst).not.toHaveBeenCalled();
        expect(vi.mocked(prisma.plannerFavorite.upsert).mock.calls[0][0]).toMatchObject({ create: { targetId: starter } });
    });

    it("lets an admin star any practice of the team, and a member only a shared one", async () => {
        vi.mocked(prisma.practiceSession.findUnique).mockResolvedValue({ teamId: TEAM, isShared: false } as never);
        vi.mocked(getUserTeamRole).mockResolvedValue("ADMIN");
        expect((await setPlannerFavorite({ kind: "PRACTICE", targetId: SESSION, favorite: true })).success).toBe(true);

        vi.mocked(getUserTeamRole).mockResolvedValue("MEMBER");
        expect(await setPlannerFavorite({ kind: "PRACTICE", targetId: SESSION, favorite: true })).toEqual({
            success: false,
            error: FAVORITE_PRACTICE_NOT_FOUND,
        });

        vi.mocked(prisma.practiceSession.findUnique).mockResolvedValue({ teamId: TEAM, isShared: true } as never);
        expect((await setPlannerFavorite({ kind: "PRACTICE", targetId: SESSION, favorite: true })).success).toBe(true);

        vi.mocked(prisma.practiceSession.findUnique).mockResolvedValue(null);
        expect((await setPlannerFavorite({ kind: "PRACTICE", targetId: SESSION, favorite: true })).success).toBe(false);
        expect(prisma.plannerFavorite.upsert).toHaveBeenCalledTimes(2);
    });

    it("unstars by deleting only the caller's own row, with no target lookup", async () => {
        const result = await setPlannerFavorite({ kind: "PRACTICE", targetId: SESSION, favorite: false });
        expect(result).toEqual({ success: true, data: { kind: "PRACTICE", targetId: SESSION, favorite: false } });
        expect(prisma.practiceSession.findUnique).not.toHaveBeenCalled();
        expect(vi.mocked(prisma.plannerFavorite.deleteMany).mock.calls[0][0]).toEqual({
            where: { userId: USER, kind: "PRACTICE", targetId: SESSION },
        });
    });

    it("turns a database failure into a friendly error", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(prisma.plannerFavorite.findMany).mockRejectedValue(new Error("connection reset"));
        expect(await listPlannerFavorites({ kind: "PRACTICE" })).toMatchObject({ success: false });
    });
    it("lists every favorite, reading in pages with a stable order instead of dropping rows past a limit", async () => {
        const AT = new Date("2026-09-01T00:00:00Z");
        const row = (n: number) => ({ id: `cfav${String(n).padStart(21, "0")}`, targetId: `ctarget${String(n).padStart(18, "0")}`, createdAt: AT });
        let served = 0;
        // More rows than one read takes: the action must keep reading until a short page.
        vi.mocked(prisma.plannerFavorite.findMany).mockImplementation((async (args: { take: number }) => {
            const total = MAX_PLANNER_FAVORITES + 5;
            const page = Array.from({ length: Math.min(args.take, total - served) }, (_, i) => row(served + i));
            served += page.length;
            return page;
        }) as never);
        const result = await listPlannerFavorites({ kind: "PRACTICE" });
        expect(result.success && result.data.length).toBe(MAX_PLANNER_FAVORITES + 5);
        expect(result.success && result.data[MAX_PLANNER_FAVORITES + 4]).toBe(row(MAX_PLANNER_FAVORITES + 4).targetId);
        const calls = vi.mocked(prisma.plannerFavorite.findMany).mock.calls.map((call) => call[0] as Record<string, unknown>);
        expect(calls.length).toBeGreaterThan(1);
        expect(calls[0]).toMatchObject({ where: { userId: USER, kind: "PRACTICE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        expect((calls[0].where as Record<string, unknown>).OR).toBeUndefined();
        // Each later read continues strictly after the last row of the one before.
        const last = row((calls[0].take as number) - 1);
        expect(calls[1].where).toEqual({
            userId: USER,
            kind: "PRACTICE",
            OR: [{ createdAt: { lt: AT } }, { createdAt: AT, id: { lt: last.id } }],
        });
    });

    it("refuses a new star past the per-user limit with a friendly message", async () => {
        vi.mocked(prisma.play.findFirst).mockResolvedValue({ teamId: TEAM } as never);
        vi.mocked(getUserTeamRole).mockResolvedValue("MEMBER");
        vi.mocked(prisma.plannerFavorite.count).mockResolvedValue(MAX_PLANNER_FAVORITES as never);
        const result = await setPlannerFavorite({ kind: "DRILL", targetId: PLAY, favorite: true });
        expect(result).toEqual({ success: false, error: plannerFavoriteLimitMessage("DRILL") });
        expect(plannerFavoriteLimitMessage("DRILL")).toMatch(/2,000 drills/);
        expect(vi.mocked(prisma.plannerFavorite.count).mock.calls[0][0]).toEqual({ where: { userId: USER, kind: "DRILL" } });
        expect(prisma.plannerFavorite.upsert).not.toHaveBeenCalled();
    });

    it("still re-stars an already starred drill at the limit, and always allows unstarring", async () => {
        vi.mocked(prisma.play.findFirst).mockResolvedValue({ teamId: TEAM } as never);
        vi.mocked(getUserTeamRole).mockResolvedValue("MEMBER");
        vi.mocked(prisma.plannerFavorite.count).mockResolvedValue(MAX_PLANNER_FAVORITES as never);
        vi.mocked(prisma.plannerFavorite.findUnique).mockResolvedValue({ id: "cfavexistingxxxxxxxxxxxxx" } as never);
        expect((await setPlannerFavorite({ kind: "DRILL", targetId: PLAY, favorite: true })).success).toBe(true);
        expect((await setPlannerFavorite({ kind: "DRILL", targetId: PLAY, favorite: false })).success).toBe(true);
    });
});
