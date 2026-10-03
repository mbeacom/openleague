import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma, tx } = vi.hoisted(() => {
    const tx = {
        practiceSessionPlay: { findMany: vi.fn(), updateMany: vi.fn() },
        play: {
            findUniqueOrThrow: vi.fn(),
            createManyAndReturn: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    };
    return {
        tx,
        mockPrisma: {
            $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
            play: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: tx.play.update },
        },
    };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
    requireTeamMember: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx"),
    requireTeamAdmin: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deletePlay, getPlaysByTeam, updatePlay } from "@/lib/actions/plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAY = "cplayxxxxxxxxxxxxxxxxxxxx";
const OLD_DIAGRAM = { version: 2, players: [{ id: "old" }], drawings: [], equipment: [], annotations: [] };

function referencedBy(...sessionIds: string[]) {
    tx.practiceSessionPlay.findMany.mockResolvedValue(sessionIds.map((sessionId) => ({ sessionId })));
}

beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: null, isTemplate: true });
    referencedBy();
    tx.play.findUniqueOrThrow.mockResolvedValue({
        id: PLAY, name: "Breakout", description: null, thumbnail: null, playData: OLD_DIAGRAM,
        sourcePlayId: null, isTemplate: true, sessionId: null,
    });
    tx.play.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ name: string; sourcePlayId: string; sessionId: string }> }) =>
        data.map((d, i) => ({ id: `ccopy${i}xxxxxxxxxxxxxxxxxxx`, name: d.name, sourcePlayId: d.sourcePlayId, sessionId: d.sessionId })));
    tx.practiceSessionPlay.updateMany.mockResolvedValue({ count: 1 });
    tx.play.update.mockResolvedValue({ id: PLAY, name: "Breakout v2", isTemplate: true });
    tx.play.delete.mockResolvedValue({ id: PLAY });
});

describe("updatePlay detaches sessions before editing a library drill", () => {
    it("copies the OLD diagram into each referencing session, repoints it, then updates the library row", async () => {
        referencedBy("csessionaxxxxxxxxxxxxxxxx");
        const result = await updatePlay({ id: PLAY, teamId: TEAM, name: "Breakout v2", playData: createEmptyPlayData() });

        expect(result.success).toBe(true);
        const copy = tx.play.createManyAndReturn.mock.calls[0][0].data[0];
        expect(copy).toMatchObject({ sessionId: "csessionaxxxxxxxxxxxxxxxx", playData: OLD_DIAGRAM, sourcePlayId: PLAY, isTemplate: false });
        expect(tx.practiceSessionPlay.updateMany).toHaveBeenCalledWith({
            where: { sessionId: "csessionaxxxxxxxxxxxxxxxx", playId: PLAY },
            data: { playId: "ccopy0xxxxxxxxxxxxxxxxxxx" },
        });
        expect(tx.play.update.mock.invocationCallOrder[0])
            .toBeGreaterThan(tx.practiceSessionPlay.updateMany.mock.invocationCallOrder[0]);
    });

    it("refuses to edit a session's private copy from the library", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: "csessionxxxxxxxxxxxxxxxxx", isTemplate: false });
        const result = await updatePlay({ id: PLAY, teamId: TEAM, name: "Drill", playData: createEmptyPlayData() });

        expect(result).toEqual({
            success: false,
            error: "This drill belongs to a practice session. Edit it from that session.",
        });
        expect(tx.play.update).not.toHaveBeenCalled();
        expect(tx.play.createManyAndReturn).not.toHaveBeenCalled();
    });
});

describe("deletePlay detaches, then hard-deletes", () => {
    it("detaches a referenced play, then deletes it", async () => {
        referencedBy("csessionaxxxxxxxxxxxxxxxx");
        const result = await deletePlay({ id: PLAY, teamId: TEAM });

        expect(result).toEqual({ success: true, data: { id: PLAY, detachedSessions: 1 } });
        expect(tx.play.delete).toHaveBeenCalledWith({ where: { id: PLAY } });
        expect(tx.play.delete.mock.invocationCallOrder[0])
            .toBeGreaterThan(tx.practiceSessionPlay.updateMany.mock.invocationCallOrder[0]);
    });

    it("deletes an unreferenced play directly", async () => {
        const result = await deletePlay({ id: PLAY, teamId: TEAM });

        expect(result).toEqual({ success: true, data: { id: PLAY, detachedSessions: 0 } });
        expect(tx.play.createManyAndReturn).not.toHaveBeenCalled();
        expect(tx.play.delete).toHaveBeenCalledWith({ where: { id: PLAY } });
    });

    it("gives each referencing session its own copy (one per session)", async () => {
        referencedBy("csessionaxxxxxxxxxxxxxxxx", "csessionaxxxxxxxxxxxxxxxx", "csessionbxxxxxxxxxxxxxxxx");
        const result = await deletePlay({ id: PLAY, teamId: TEAM });

        expect(result).toEqual({ success: true, data: { id: PLAY, detachedSessions: 2 } });
        const sessions = tx.play.createManyAndReturn.mock.calls[0][0].data.map((d: { sessionId: string }) => d.sessionId);
        expect(sessions).toEqual(["csessionaxxxxxxxxxxxxxxxx", "csessionbxxxxxxxxxxxxxxxx"]);
        expect(tx.practiceSessionPlay.updateMany).toHaveBeenCalledTimes(2);
    });

    it("maps a racing reference (FK P2003) to a friendly error", async () => {
        tx.play.delete.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: "7.10.0" }),
        );
        const result = await deletePlay({ id: PLAY, teamId: TEAM });
        expect(result).toEqual({ success: false, error: "This drill is still used by a session" });
    });
});

describe("only library plays are detached", () => {
    it("does not detach a non-template play on update or delete", async () => {
        referencedBy("csessionaxxxxxxxxxxxxxxxx");
        mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: null, isTemplate: false });

        await updatePlay({ id: PLAY, teamId: TEAM, name: "Drill", playData: createEmptyPlayData() });
        await deletePlay({ id: PLAY, teamId: TEAM });

        expect(tx.practiceSessionPlay.findMany).not.toHaveBeenCalled();
        expect(tx.play.createManyAndReturn).not.toHaveBeenCalled();
    });
});

describe("library listing", () => {
    it("never lists session-owned plays", async () => {
        mockPrisma.play.findMany.mockResolvedValue([]);
        mockPrisma.play.count.mockResolvedValue(0);
        await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });

        expect(mockPrisma.play.findMany.mock.calls[0][0].where).toMatchObject({
            teamId: TEAM,
            sessionId: null,
            isTemplate: true,
        });
    });
});
