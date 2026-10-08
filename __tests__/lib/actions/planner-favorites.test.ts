import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
    prisma: {
        plannerFavorite: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
        play: { findFirst: vi.fn() },
        practiceSession: { findUnique: vi.fn() },
    },
}));
vi.mock("@/lib/auth/session", () => ({ requireUserId: vi.fn(), getUserTeamRole: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { getUserTeamRole, requireUserId } from "@/lib/auth/session";
import { listPlannerFavorites, setPlannerFavorite } from "@/lib/actions/planner-favorites";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { FAVORITE_DRILL_NOT_FOUND, FAVORITE_PRACTICE_NOT_FOUND } from "@/lib/utils/planner-favorites";

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
});
