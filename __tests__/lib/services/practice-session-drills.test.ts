import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
    SESSION_DRILL_REJECTED_MESSAGE,
    SessionDrillError,
    deleteOrphanedSessionDrills,
    detachLibraryPlay,
    materializeSessionDrills,
} from "@/lib/services/practice-session-drills";

const SESSION = "s1";
const OTHER_SESSION = "s2";
const TEAM = "t1";
const USER = "u1";

type Row = {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: unknown;
    sourcePlayId: string | null;
    isTemplate: boolean;
    sessionId: string | null;
};

function play(id: string, overrides: Partial<Row> = {}): Row {
    return {
        id,
        name: `Drill ${id}`,
        description: null,
        thumbnail: null,
        playData: { players: [{ id: "p" }] },
        sourcePlayId: null,
        isTemplate: true,
        sessionId: null,
        ...overrides,
    };
}

/** referencing: the session-play rows ({ sessionId, playId }) that exist. */
function fakeTx(plays: Row[], referencing: Array<{ sessionId: string; playId: string }> = []) {
    let next = 0;
    const mocks = {
        practiceSessionPlay: {
            findMany: vi.fn(async ({ where }: { where: { sessionId?: string; playId?: string } }) =>
                referencing.filter((r) =>
                    (where.sessionId === undefined || r.sessionId === where.sessionId)
                    && (where.playId === undefined || r.playId === where.playId))),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        play: {
            // The real query filters by teamId; rows of other teams are simply absent here.
            findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
                plays.filter((p) => where.id.in.includes(p.id))),
            findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
                const row = plays.find((p) => p.id === where.id);
                if (!row) throw new Error("not found");
                return row;
            }),
            createManyAndReturn: vi.fn(async ({ data }: { data: Array<{ name: string; sourcePlayId: string | null; sessionId: string }> }) =>
                data.map((row) => ({ id: `clone-${next++}`, name: row.name, sourcePlayId: row.sourcePlayId, sessionId: row.sessionId }))),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
    };
    return { mocks, tx: mocks as unknown as Prisma.TransactionClient };
}

function items(...ids: string[]) {
    return ids.map((playId, sequence) => ({ playId, clientKey: `k${sequence}`, sequence }));
}

const refs = (...playIds: string[]) => playIds.map((playId) => ({ sessionId: SESSION, playId }));

describe("materializeSessionDrills", () => {
    beforeEach(() => vi.clearAllMocks());

    it("keeps a drill the session already owns", async () => {
        const { mocks, tx } = fakeTx([play("o1", { isTemplate: false, sessionId: SESSION })]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("o1") });

        expect(result.mapping).toEqual([{ clientKey: "k0", sequence: 0, playId: "o1" }]);
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("clones a library play with provenance, restricted to the team", async () => {
        const { mocks, tx } = fakeTx([play("lib1")]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("lib1") });

        expect(mocks.play.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["lib1"] }, teamId: TEAM });
        expect(result.mapping).toEqual([{ clientKey: "k0", sequence: 0, playId: "clone-0" }]);
        expect(mocks.play.createManyAndReturn.mock.calls[0][0].data).toEqual([{
            name: "Drill lib1",
            description: null,
            thumbnail: null,
            playData: { players: [{ id: "p" }] },
            isTemplate: false,
            teamId: TEAM,
            createdById: USER,
            sessionId: SESSION,
            sourcePlayId: "lib1",
        }]);
    });

    it("clones a second occurrence of an owned drill once, keeping the root provenance", async () => {
        const { mocks, tx } = fakeTx([play("o2", { isTemplate: false, sessionId: SESSION, sourcePlayId: "lib9" })]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("o2", "o2") });

        expect(result.mapping.map((m) => m.playId)).toEqual(["o2", "clone-0"]);
        expect(mocks.play.createManyAndReturn.mock.calls[0][0].data).toHaveLength(1);
        expect(mocks.play.createManyAndReturn.mock.calls[0][0].data[0].sourcePlayId).toBe("lib9");
    });

    it("clones an unowned non-library play this session already references (pre-3a data)", async () => {
        const { mocks, tx } = fakeTx([play("old", { isTemplate: false })], refs("old"));
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("old") });

        expect(result.mapping[0].playId).toBe("clone-0");
        // The legacy row has no sourcePlayId, so provenance falls back to its own id.
        expect(mocks.play.createManyAndReturn.mock.calls[0][0].data[0].sourcePlayId).toBe("old");
        expect(result.previousPlayIds).toEqual(["old"]);
    });

    it("rejects an unowned non-library play this session never referenced", async () => {
        const { mocks, tx } = fakeTx([play("old", { isTemplate: false })]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("old") }),
        ).rejects.toThrow(SESSION_DRILL_REJECTED_MESSAGE);
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("rejects another session's private copy", async () => {
        const { tx } = fakeTx([play("x", { isTemplate: false, sessionId: OTHER_SESSION })]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("x") }),
        ).rejects.toBeInstanceOf(SessionDrillError);
    });

    it("rejects a play of another team or a missing play", async () => {
        const { mocks, tx } = fakeTx([play("lib1")]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("lib1", "gone") }),
        ).rejects.toBeInstanceOf(SessionDrillError);
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("keys the mapping by clientKey in payload order", async () => {
        const { tx } = fakeTx([play("lib1"), play("o1", { isTemplate: false, sessionId: SESSION })]);
        const result = await materializeSessionDrills(tx, {
            sessionId: SESSION,
            teamId: TEAM,
            userId: USER,
            items: [
                { playId: "lib1", clientKey: "first", sequence: 0 },
                { playId: "o1", clientKey: "second", sequence: 1 },
                { playId: "lib1", clientKey: "third", sequence: 2 },
            ],
        });
        expect(result.mapping).toEqual([
            { clientKey: "first", sequence: 0, playId: "clone-0" },
            { clientKey: "second", sequence: 1, playId: "o1" },
            { clientKey: "third", sequence: 2, playId: "clone-1" },
        ]);
    });

    it("aborts instead of mis-mapping when clones come back out of order", async () => {
        const { mocks, tx } = fakeTx([play("a"), play("b")]);
        mocks.play.createManyAndReturn.mockResolvedValueOnce([
            { id: "x", name: "Drill b", sourcePlayId: "b", sessionId: SESSION },
            { id: "y", name: "Drill a", sourcePlayId: "a", sessionId: SESSION },
        ]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("a", "b") }),
        ).rejects.toThrow("out of order");
    });

    it("reads nothing but the previous references for an empty payload", async () => {
        const { mocks, tx } = fakeTx([], refs("old"));
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: [] });
        expect(result).toEqual({ mapping: [], previousPlayIds: ["old"] });
        expect(mocks.play.findMany).not.toHaveBeenCalled();
    });
});

describe("deleteOrphanedSessionDrills (drop-only)", () => {
    it("deletes only owned plays this save dropped that nothing references", async () => {
        const { mocks, tx } = fakeTx([]);
        await deleteOrphanedSessionDrills(tx, { sessionId: SESSION, previousPlayIds: ["dropped", "kept"] });

        expect(mocks.play.deleteMany).toHaveBeenCalledWith({
            where: { sessionId: SESSION, id: { in: ["dropped", "kept"] }, sessions: { none: {} } },
        });
    });

    it("never touches a drill the session has not referenced yet (e.g. one the dialog just created)", async () => {
        const { mocks, tx } = fakeTx([]);
        await deleteOrphanedSessionDrills(tx, { sessionId: SESSION, previousPlayIds: [] });
        expect(mocks.play.deleteMany).not.toHaveBeenCalled();
    });
});

describe("detachLibraryPlay", () => {
    const LIB = play("lib", { playData: { players: [{ id: "old-diagram" }] } });

    it("does nothing for a play no session references", async () => {
        const { mocks, tx } = fakeTx([LIB]);
        await expect(detachLibraryPlay(tx, { playId: "lib", teamId: TEAM, userId: USER })).resolves.toBe(0);
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
        expect(mocks.practiceSessionPlay.updateMany).not.toHaveBeenCalled();
    });

    it("gives each referencing session one copy of the current content and repoints its rows", async () => {
        const { mocks, tx } = fakeTx([LIB], [
            { sessionId: "sA", playId: "lib" },
            { sessionId: "sA", playId: "lib" },
            { sessionId: "sB", playId: "lib" },
        ]);
        await expect(detachLibraryPlay(tx, { playId: "lib", teamId: TEAM, userId: USER })).resolves.toBe(2);

        const data = mocks.play.createManyAndReturn.mock.calls[0][0].data;
        expect(data.map((d: { sessionId: string }) => d.sessionId)).toEqual(["sA", "sB"]);
        expect(data[0]).toMatchObject({ isTemplate: false, sourcePlayId: "lib", playData: { players: [{ id: "old-diagram" }] } });
        expect(mocks.practiceSessionPlay.updateMany.mock.calls).toEqual([
            [{ where: { sessionId: "sA", playId: "lib" }, data: { playId: "clone-0" } }],
            [{ where: { sessionId: "sB", playId: "lib" }, data: { playId: "clone-1" } }],
        ]);
    });
});

describe("team scoping (a session never references another team's play)", () => {
    beforeEach(() => vi.clearAllMocks());

    it("rejects another team's library play even when the id exists", async () => {
        const { mocks, tx } = fakeTx([play("foreign")]);
        // Model the real teamId filter: the row belongs to team t2.
        const owner: Record<string, string> = { foreign: "t2" };
        mocks.play.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] }; teamId?: string } }) =>
            [play("foreign")].filter((p) => where.id.in.includes(p.id) && owner[p.id] === where.teamId));

        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("foreign") }),
        ).rejects.toThrow(SESSION_DRILL_REJECTED_MESSAGE);
        expect(mocks.play.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["foreign"] }, teamId: TEAM });
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("loads the play to detach only within the caller's team", async () => {
        const { mocks, tx } = fakeTx([play("lib")], [{ sessionId: "sA", playId: "lib" }]);
        await detachLibraryPlay(tx, { playId: "lib", teamId: TEAM, userId: USER });
        expect(mocks.play.findUniqueOrThrow.mock.calls[0][0].where).toEqual({ id: "lib", teamId: TEAM });
    });

    it("looks up referencing session plays only within the caller's team", async () => {
        const { mocks, tx } = fakeTx([play("lib")], [{ sessionId: "sA", playId: "lib" }]);
        await detachLibraryPlay(tx, { playId: "lib", teamId: TEAM, userId: USER });
        expect(mocks.practiceSessionPlay.findMany.mock.calls[0][0].where).toEqual({
            playId: "lib",
            session: { teamId: TEAM },
        });
    });

    it("propagates the rejection when the play is not in the team", async () => {
        const { mocks, tx } = fakeTx([play("lib")], [{ sessionId: "sA", playId: "lib" }]);
        mocks.play.findUniqueOrThrow.mockRejectedValueOnce(new Error("No Play found"));
        await expect(
            detachLibraryPlay(tx, { playId: "lib", teamId: TEAM, userId: USER }),
        ).rejects.toThrow("No Play found");
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });
});

import { Prisma as PrismaRuntime } from "@prisma/client";
import {
    SESSION_PLAY_FIELDS_NOT_COPIED,
    copySessionPlayScalars,
    duplicateSessionTitle,
} from "@/lib/services/practice-session-drills";

describe("copySessionPlayScalars", () => {
    it("copies every session-play scalar except ids, foreign keys, and timestamps", () => {
        const row: Record<string, unknown> = { play: { id: "relation, not a scalar" } };
        for (const field of Object.values(PrismaRuntime.PracticeSessionPlayScalarFieldEnum)) row[field] = `value-${field}`;

        const copied = copySessionPlayScalars(row) as Record<string, unknown>;
        for (const field of Object.values(PrismaRuntime.PracticeSessionPlayScalarFieldEnum)) {
            if (SESSION_PLAY_FIELDS_NOT_COPIED.has(field)) expect(copied).not.toHaveProperty(field);
            else expect(copied).toHaveProperty(field, `value-${field}`);
        }
        expect(copied).not.toHaveProperty("play");
    });
});

describe("duplicateSessionTitle", () => {
    it("prefixes and keeps the 100-character limit", () => {
        expect(duplicateSessionTitle("Tuesday")).toBe("Copy of Tuesday");
        expect(duplicateSessionTitle("x".repeat(100))).toHaveLength(100);
    });
});
