import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, tx, mockPrisma } = vi.hoisted(() => {
    const tx = {
        practiceSession: { findUnique: vi.fn(), create: vi.fn() },
        practiceSessionPlay: { findFirst: vi.fn(), createMany: vi.fn() },
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

import { copySessionDrillToLibrary, saveSessionDrill } from "@/lib/actions/practice-session-drills";
import { createEmptyPlayData } from "@/lib/utils/play-data";

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
