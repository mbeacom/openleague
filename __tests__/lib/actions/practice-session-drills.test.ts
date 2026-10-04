import { beforeEach, describe, expect, it, vi } from "vitest";

// Clone ids are generated before insert; a per-test counter keeps them readable.
const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cclone${playIds.next++}xxxxxxxxxxxxxxxxxx` }));
import { Prisma } from "@prisma/client";

const { mockAuth, tx, mockPrisma } = vi.hoisted(() => {
    const tx = {
        practiceSession: { findUnique: vi.fn(), create: vi.fn() },
        practiceSessionPlay: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
        practiceSessionStaff: { createMany: vi.fn() },
        practiceSessionPlayStaff: { createMany: vi.fn() },
        play: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), createManyAndReturn: vi.fn() },
    };
    return {
        tx,
        mockAuth: { requireTeamAdmin: vi.fn() },
        mockPrisma: {
            $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
            ...tx,
        },
    };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { copySessionDrillToLibrary, duplicatePracticeSession, saveSessionDrill } from "@/lib/actions/practice-session-drills";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import {
    PRACTICE_STAFF_COPY_SELECT,
    ROW_STAFF_COPY_SELECT,
    ROW_STAFF_FIELDS_NOT_COPIED,
    STAFF_FIELDS_NOT_COPIED,
} from "@/lib/services/practice-session-staff";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const NEW_ID = "cnewplayxxxxxxxxxxxxxxxxx";

function drillInput(playId?: string) {
    return { sessionId: SESSION, teamId: TEAM, playId, name: "Breakout", description: "Quick", playData: createEmptyPlayData() };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    tx.practiceSession.findUnique.mockResolvedValue({ teamId: TEAM });
    tx.play.create.mockResolvedValue({ id: NEW_ID });
    tx.play.update.mockResolvedValue({ id: OWNED });
});

describe("saveSessionDrill", () => {
    it("updates a drill the session owns in place", async () => {
        tx.play.findFirst.mockResolvedValue({ id: OWNED, sessionId: SESSION, isTemplate: false, sourcePlayId: LIB });
        const result = await saveSessionDrill(drillInput(OWNED));

        expect(tx.play.findFirst.mock.calls[0][0].where).toMatchObject({ id: OWNED, teamId: TEAM });
        expect(result).toEqual({ success: true, data: { playId: OWNED } });
        expect(tx.play.update).toHaveBeenCalledWith({
            where: { id: OWNED },
            data: expect.objectContaining({ name: "Breakout", description: "Quick" }),
        });
        expect(tx.play.create).not.toHaveBeenCalled();
    });

    it("forks a library drill into an owned copy with provenance", async () => {
        tx.play.findFirst.mockResolvedValue({ id: LIB, sessionId: null, isTemplate: true, sourcePlayId: null });
        const result = await saveSessionDrill(drillInput(LIB));

        expect(result).toEqual({ success: true, data: { playId: NEW_ID } });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({
            isTemplate: false, sessionId: SESSION, teamId: TEAM, createdById: USER, sourcePlayId: LIB,
        });
    });

    it("forks an unowned non-library play only when this session references it (pre-3a data)", async () => {
        tx.play.findFirst.mockResolvedValue({ id: LIB, sessionId: null, isTemplate: false, sourcePlayId: null });
        tx.practiceSessionPlay.findFirst.mockResolvedValue(null);
        const result = await saveSessionDrill(drillInput(LIB));
        expect(result).toEqual({ success: false, error: "One or more drills not found or do not belong to this session" });
        expect(tx.play.create).not.toHaveBeenCalled();
    });

    it("creates a brand-new owned drill without provenance", async () => {
        const result = await saveSessionDrill(drillInput());
        expect(result).toEqual({ success: true, data: { playId: NEW_ID } });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ sessionId: SESSION, sourcePlayId: null, isTemplate: false });
    });

    it("rejects another session's copy", async () => {
        tx.play.findFirst.mockResolvedValue({ id: OWNED, sessionId: "cothersessionxxxxxxxxxxxx", isTemplate: false, sourcePlayId: null });
        const result = await saveSessionDrill(drillInput(OWNED));
        expect(result.success).toBe(false);
    });

    it("rejects a session of another team", async () => {
        tx.practiceSession.findUnique.mockResolvedValue({ teamId: "cotherteamxxxxxxxxxxxxxxx" });
        const result = await saveSessionDrill(drillInput());
        expect(result).toEqual({ success: false, error: "Practice session not found" });
    });

    it("returns validation errors without writing", async () => {
        const result = await saveSessionDrill({ ...drillInput(), name: "" });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
        expect(tx.play.create).not.toHaveBeenCalled();
    });
});

describe("copySessionDrillToLibrary", () => {
    it("creates a library play from an owned copy", async () => {
        tx.play.findFirst.mockResolvedValue({ name: "Breakout", description: null, thumbnail: null, playData: { v: 1 }, sessionId: SESSION });
        const result = await copySessionDrillToLibrary({ playId: OWNED, teamId: TEAM });

        expect(tx.play.findFirst.mock.calls[0][0].where).toEqual({ id: OWNED, teamId: TEAM, session: { teamId: TEAM } });
        expect(result).toEqual({ success: true, data: { playId: NEW_ID } });
        expect(tx.play.create.mock.calls[0][0].data).toEqual({
            name: "Breakout", description: null, thumbnail: null, playData: { v: 1 },
            isTemplate: true, teamId: TEAM, createdById: USER,
        });
    });

    it("refuses a play that is not a session copy", async () => {
        tx.play.findFirst.mockResolvedValue({ name: "Lib", description: null, thumbnail: null, playData: {}, sessionId: null });
        const result = await copySessionDrillToLibrary({ playId: LIB, teamId: TEAM });
        expect(result).toEqual({ success: false, error: "Drill not found in this session" });
    });
});

describe("duplicatePracticeSession", () => {
    const SOURCE = "csourcexxxxxxxxxxxxxxxxxx";
    const COPY = "ccopyxxxxxxxxxxxxxxxxxxxx";
    const DATE = new Date("2026-04-14T22:00:00.000Z");

    // One source session-play row carrying EVERY scalar column the generated
    // client knows — so a column added later (e.g. runsWithPrevious) is in
    // the fixture automatically and must come out the other side.
    function sourceRow(index: number) {
        const row: Record<string, unknown> = {};
        for (const field of Object.values(Prisma.PracticeSessionPlayScalarFieldEnum)) row[field] = `${field}-${index}`;
        return {
            ...row,
            sequence: index,
            duration: 10 + index,
            instructions: `Do ${index}`,
            play: { id: `cplay${index}xxxxxxxxxxxxxxxxxxx`, name: `Drill ${index}`, description: null, thumbnail: null, playData: {}, sourcePlayId: null },
            staff: [] as Array<{ staffId: string; position: number }>,
        };
    }

    beforeEach(() => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75, staff: [], plays: [sourceRow(0), sourceRow(1)],
        });
        tx.practiceSession.create.mockResolvedValue({ id: COPY });
        playIds.next = 0;
        tx.play.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ id: string; name: string; sourcePlayId: string; sessionId: string }> }) =>
            data.map((d) => ({ id: d.id, name: d.name, sourcePlayId: d.sourcePlayId, sessionId: d.sessionId })));
        tx.practiceSessionPlay.createMany.mockResolvedValue({ count: 2 });
    });

    it("copies the session's goalie count", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75, goaliesAttending: 2, staff: [], plays: [sourceRow(0)],
        });
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(tx.practiceSession.create.mock.calls[0][0].data.goaliesAttending).toBe(2);
        expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].select).toMatchObject({ goaliesAttending: true });
    });

    it("creates an unshared, unbooked copy on the chosen date", async () => {
        const result = await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });

        expect(result).toEqual({ success: true, data: { id: COPY } });
        const data = tx.practiceSession.create.mock.calls[0][0].data;
        expect(data).toEqual({
            title: "Copy of Tuesday", date: DATE, duration: 75, goaliesAttending: null, isShared: false, teamId: TEAM, createdById: USER,
        });
        for (const key of ["venueId", "surfaceId", "segmentId", "startAt", "venueReservationId", "conflictOverriddenById"]) {
            expect(data).not.toHaveProperty(key);
        }
    });

    it("clones every drill into the new session", async () => {
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(tx.play.createManyAndReturn.mock.calls[0][0].data.map((d: { sessionId: string }) => d.sessionId))
            .toEqual([COPY, COPY]);
    });

    it("copies every session-play column except ids and foreign keys (new-column guard)", async () => {
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        const copied: Array<Record<string, unknown>> = tx.practiceSessionPlay.createMany.mock.calls[0][0].data;
        const source = sourceRow(0) as Record<string, unknown>;

        expect(copied[0].sessionId).toBe(COPY);
        expect(copied[0].playId).toBe("cclone0xxxxxxxxxxxxxxxxxx");
        for (const field of Object.values(Prisma.PracticeSessionPlayScalarFieldEnum)) {
            if (["id", "createdAt", "updatedAt"].includes(field)) expect(copied[0]).not.toHaveProperty(field);
            else if (field !== "sessionId" && field !== "playId") expect(copied[0][field]).toEqual(source[field]);
        }
    });

    it("copies each drill's station flag (runsWithPrevious)", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75, staff: [],
            plays: [{ ...sourceRow(0), runsWithPrevious: false }, { ...sourceRow(1), runsWithPrevious: true }],
        });

        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });

        const copied: Array<{ runsWithPrevious: boolean }> = tx.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(copied.map((row) => row.runsWithPrevious)).toEqual([false, true]);
    });

    it("refuses a session of another team", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({ teamId: "cotherteamxxxxxxxxxxxxxxx", title: "x", duration: 60, staff: [], plays: [] });
        const result = await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(result).toEqual({ success: false, error: "Practice session not found" });
        expect(tx.practiceSession.create).not.toHaveBeenCalled();
    });

    it("requires a team admin", async () => {
        mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Only team admins can perform this action"));
        const result = await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(result.success).toBe(false);
        expect(tx.practiceSession.create).not.toHaveBeenCalled();
    });

    it("copies block rows without cloning them, keeps each drill on its own copy, and copies the gap", async () => {
        const blockRow = { ...sourceRow(1), kind: "break", label: "Water", playId: null, play: null };
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75, transitionMinutes: 2, staff: [], plays: [sourceRow(0), blockRow, sourceRow(2)],
        });
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });

        expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].select).toMatchObject({ transitionMinutes: true });
        expect(tx.practiceSession.create.mock.calls[0][0].data.transitionMinutes).toBe(2);
        expect(tx.play.createManyAndReturn.mock.calls[0][0].data.map((d: { name: string }) => d.name)).toEqual(["Drill 0", "Drill 2"]);
        const copied: Array<Record<string, unknown>> = tx.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(copied.map((row) => row.playId)).toEqual(["cclone0xxxxxxxxxxxxxxxxxx", null, "cclone1xxxxxxxxxxxxxxxxxx"]);
        expect(copied[1]).toMatchObject({ kind: "break", label: "Water", sessionId: COPY });
    });

    describe("practice staff (spec R5)", () => {
        const OFFICIAL = "cofficialxxxxxxxxxxxxxxxx";
        const sourceStaff = [
            { id: "cstaffa", name: "Coach Lee", position: 0, teamOfficialId: OFFICIAL, userId: null },
            { id: "cstaffb", name: "Sam", position: 1, teamOfficialId: null, userId: null },
        ];

        beforeEach(() => {
            mockPrisma.practiceSession.findUnique.mockResolvedValue({
                teamId: TEAM, title: "Tuesday", duration: 75, staff: sourceStaff,
                plays: [
                    { ...sourceRow(0), staff: [{ staffId: "cstaffb", position: 0 }] },
                    { ...sourceRow(1), staff: [{ staffId: "cstaffa", position: 0 }, { staffId: "cstaffb", position: 1 }] },
                ],
            });
            tx.practiceSessionPlay.findMany.mockResolvedValue([{ id: "ccopyrow0", sequence: 0 }, { id: "ccopyrow1", sequence: 1 }]);
            tx.practiceSessionStaff.createMany.mockResolvedValue({ count: 2 });
            tx.practiceSessionPlayStaff.createMany.mockResolvedValue({ count: 3 });
        });

        it("copies the list with new ids, links kept, and each row's staff onto the copied rows", async () => {
            await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
            // Two drill clones take cclone0 and cclone1; the staff copies come next.
            expect(tx.practiceSessionStaff.createMany.mock.calls[0][0].data).toEqual([
                { id: "cclone2xxxxxxxxxxxxxxxxxx", sessionId: COPY, name: "Coach Lee", position: 0, teamOfficialId: OFFICIAL, userId: null },
                { id: "cclone3xxxxxxxxxxxxxxxxxx", sessionId: COPY, name: "Sam", position: 1, teamOfficialId: null, userId: null },
            ]);
            expect(tx.practiceSessionPlayStaff.createMany.mock.calls[0][0].data).toEqual([
                { playRowId: "ccopyrow0", staffId: "cclone3xxxxxxxxxxxxxxxxxx", position: 0 },
                { playRowId: "ccopyrow1", staffId: "cclone2xxxxxxxxxxxxxxxxxx", position: 0 },
                { playRowId: "ccopyrow1", staffId: "cclone3xxxxxxxxxxxxxxxxxx", position: 1 },
            ]);
        });

        it("reads and copies every staff and assignment column but ids and owners (guard built from the copy selects)", async () => {
            await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
            const select = mockPrisma.practiceSession.findUnique.mock.calls[0][0].select;
            expect(select.staff).toEqual({ orderBy: { position: "asc" }, select: PRACTICE_STAFF_COPY_SELECT });
            expect(select.plays.include.staff).toEqual({ orderBy: { position: "asc" }, select: ROW_STAFF_COPY_SELECT });
            const written: Array<Record<string, unknown>> = tx.practiceSessionStaff.createMany.mock.calls[0][0].data;
            for (const field of Object.values(Prisma.PracticeSessionStaffScalarFieldEnum)) {
                if (STAFF_FIELDS_NOT_COPIED.has(field)) continue;
                expect(PRACTICE_STAFF_COPY_SELECT).toHaveProperty(field, true);
                expect(written[0][field]).toEqual((sourceStaff[0] as Record<string, unknown>)[field]);
            }
            for (const field of Object.values(Prisma.PracticeSessionPlayStaffScalarFieldEnum)) {
                if (!ROW_STAFF_FIELDS_NOT_COPIED.has(field)) expect(ROW_STAFF_COPY_SELECT).toHaveProperty(field, true);
            }
        });

        it("writes no staff for a practice without any", async () => {
            mockPrisma.practiceSession.findUnique.mockResolvedValue({ teamId: TEAM, title: "Tuesday", duration: 75, staff: [], plays: [sourceRow(0)] });
            await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
            expect(tx.practiceSessionStaff.createMany).not.toHaveBeenCalled();
            expect(tx.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
        });
    });
});

describe("saveSessionDrill: drill tags", () => {
    it("a brand-new drill stores the sent tags", async () => {
        await saveSessionDrill({ ...drillInput(), focus: "goalies", goalies: "required" });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required" });
    });

    it("an owned drill keeps its tags when none are sent, and takes the ones that are", async () => {
        tx.play.findFirst.mockResolvedValue({ id: OWNED, sessionId: SESSION, isTemplate: false, sourcePlayId: LIB, focus: "skaters", goalies: "none" });
        await saveSessionDrill(drillInput(OWNED));
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("focus");
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("goalies");
        await saveSessionDrill({ ...drillInput(OWNED), goalies: "required" });
        expect(tx.play.update.mock.calls[1][0].data).toMatchObject({ goalies: "required" });
    });

    it("a fork inherits the source's tags unless new ones are sent", async () => {
        tx.play.findFirst.mockResolvedValue({ id: LIB, sessionId: null, isTemplate: true, sourcePlayId: null, focus: "goalies", goalies: "required" });
        await saveSessionDrill(drillInput(LIB));
        expect(tx.play.findFirst.mock.calls[0][0].select).toMatchObject({ focus: true, goalies: true });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required" });
        await saveSessionDrill({ ...drillInput(LIB), focus: "team" });
        expect(tx.play.create.mock.calls[1][0].data).toMatchObject({ focus: "team", goalies: "required" });
    });
});

describe("copySessionDrillToLibrary: drill tags", () => {
    it("copies the tags into the new library play", async () => {
        tx.play.findFirst.mockResolvedValue({ name: "Warm-up", description: null, thumbnail: null, playData: {}, sessionId: SESSION, focus: "goalies", goalies: "required" });
        tx.play.create.mockResolvedValue({ id: NEW_ID });
        await copySessionDrillToLibrary({ playId: OWNED, teamId: TEAM });
        expect(tx.play.findFirst.mock.calls[0][0].select).toMatchObject({ focus: true, goalies: true });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required", isTemplate: true });
    });
});
