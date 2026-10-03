/** importPracticePlan (ADR-0020): re-parse, authorize, then one transaction of session + owned drills (+ library). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cowned${playIds.next++}xxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma, mockCache } = vi.hoisted(() => {
    const models = {
        practiceSession: { create: vi.fn() },
        play: { createMany: vi.fn() },
        practiceSessionPlay: { createMany: vi.fn() },
    };
    return {
        models,
        mockAuth: { requireUserId: vi.fn(), requireTeamAdmin: vi.fn() },
        mockPrisma: { $transaction: vi.fn(async (fn: (tx: typeof models) => unknown) => fn(models)), ...models },
        mockCache: { revalidatePath: vi.fn() },
    };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => mockCache);

import { importPracticePlan } from "@/lib/actions/practice-plan-import";
import { INVALID_PLAN_MESSAGE, NOT_A_PLAN_MESSAGE, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const DATE = "2026-10-06T23:00:00.000Z";

const BOARD: PlayData = {
    version: 2,
    players: [{ id: "p1", position: { x: 50, y: 40 }, role: "X", label: "F1", color: "#1976D2" }],
    drawings: [],
    equipment: [],
    annotations: [],
};

function doc(overrides: Partial<PlanSessionInput> = {}) {
    return serializePlan(
        {
            title: "Tuesday Skills Practice",
            durationMinutes: 60,
            date: "2026-10-06",
            startTime: "19:00",
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Two laps", name: "Warmup Laps", description: "", playData: BOARD },
                { sequence: 1, duration: 15, runsWithPrevious: false, instructions: "", name: "Breakout", description: "D to D", playData: BOARD },
                { sequence: 2, duration: 10, runsWithPrevious: true, instructions: "", name: "Regroup", description: "", playData: createEmptyPlayData() },
            ],
            ...overrides,
        },
        "openleague-static",
        new Date("2026-10-03T18:00:00.000Z"),
    );
}

function call(overrides: Record<string, unknown> = {}) {
    return importPracticePlan({ teamId: TEAM, document: doc(), date: DATE, addToLibrary: false, ...overrides });
}

beforeEach(() => {
    vi.clearAllMocks();
    playIds.next = 0;
    mockAuth.requireUserId.mockResolvedValue(USER);
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.practiceSession.create.mockResolvedValue({ id: SESSION });
    models.play.createMany.mockResolvedValue({ count: 3 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 3 });
});

describe("importPracticePlan", () => {
    it("lets the sign-in redirect propagate instead of swallowing it", async () => {
        mockAuth.requireUserId.mockRejectedValue(new Error("NEXT_REDIRECT"));
        await expect(call()).rejects.toThrow("NEXT_REDIRECT");
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a caller who can't schedule for the team", async () => {
        mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Only team admins can perform this action"));
        expect(await call()).toEqual({ success: false, error: "You can't schedule practices for this team." });
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects bad input fields", async () => {
        const result = await call({ teamId: "nope", date: "tomorrow" });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
        expect(mockAuth.requireTeamAdmin).not.toHaveBeenCalled();
    });

    it("re-parses the document: not a plan", async () => {
        expect(await call({ document: { format: "other" } })).toEqual({ success: false, error: NOT_A_PLAN_MESSAGE, details: undefined });
        expect(mockAuth.requireTeamAdmin).not.toHaveBeenCalled();
    });

    it("re-parses the document: invalid, with details", async () => {
        const broken = JSON.parse(JSON.stringify(doc()));
        broken.session.drills[0].durationMinutes = 0;
        const result = await call({ document: broken });
        expect(result).toMatchObject({ success: false, error: INVALID_PLAN_MESSAGE });
        expect(result.success === false && result.details).toContain('Drill 1 ("Warmup Laps"): Drill length must be at least 1 minute');
    });

    it("rejects a timeline longer than the session", async () => {
        const result = await call({ document: { ...doc(), session: { ...doc().session, durationMinutes: 20 } } });
        expect(result.success === false && result.details).toContain("Practice timeline (25 min) exceeds session duration (20 min)");
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("creates the session, its owned drills and the ordered rows in one transaction", async () => {
        const result = await call();

        expect(result).toEqual({ success: true, data: { sessionId: SESSION } });
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        expect(models.practiceSession.create).toHaveBeenCalledWith({
            data: {
                title: "Tuesday Skills Practice",
                date: new Date(DATE),
                duration: 60,
                isShared: false,
                teamId: TEAM,
                createdById: USER,
            },
            select: { id: true },
        });

        expect(models.play.createMany).toHaveBeenCalledTimes(1);
        const owned = models.play.createMany.mock.calls[0][0].data;
        expect(owned).toHaveLength(3);
        expect(owned[0]).toEqual({
            id: "cowned0xxxxxxxxxxxxxxxxxx",
            name: "Warmup Laps",
            description: null,
            thumbnail: null,
            playData: BOARD,
            isTemplate: false,
            teamId: TEAM,
            createdById: USER,
            sessionId: SESSION,
            sourcePlayId: null,
        });
        expect(owned[1].description).toBe("D to D");

        const rows = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(rows).toEqual([
            { sessionId: SESSION, playId: "cowned0xxxxxxxxxxxxxxxxxx", sequence: 0, duration: 10, instructions: "Two laps", runsWithPrevious: false },
            { sessionId: SESSION, playId: "cowned1xxxxxxxxxxxxxxxxxx", sequence: 1, duration: 15, instructions: null, runsWithPrevious: false },
            { sessionId: SESSION, playId: "cowned2xxxxxxxxxxxxxxxxxx", sequence: 2, duration: 10, instructions: null, runsWithPrevious: true },
        ]);
        expect(mockCache.revalidatePath).toHaveBeenCalledWith("/practice-planner");
    });

    it("adds separate library copies when asked", async () => {
        await call({ addToLibrary: true });

        expect(models.play.createMany).toHaveBeenCalledTimes(2);
        const library = models.play.createMany.mock.calls[1][0].data;
        expect(library).toHaveLength(3);
        for (const row of library) {
            expect(row).toMatchObject({ isTemplate: true, sessionId: null, sourcePlayId: null, thumbnail: null, teamId: TEAM, createdById: USER });
            expect(row).not.toHaveProperty("id");
        }
        expect(mockCache.revalidatePath).toHaveBeenCalledWith("/practice-planner/library");
    });

    it("imports a plan with no drills as an empty session", async () => {
        const result = await call({ document: doc({ drills: [] }) });
        expect(result).toEqual({ success: true, data: { sessionId: SESSION } });
        expect(models.play.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlay.createMany).not.toHaveBeenCalled();
    });

    it("rejects a diagram that parses but can't be written, naming the drill", async () => {
        const controlOnly: PlayData = {
            ...BOARD,
            annotations: [{ id: "a1", text: "\u0001", position: { x: 10, y: 10 }, fontSize: 14, color: "#000000" }],
        };
        const result = await call({
            document: doc({
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Warmup Laps", description: "", playData: controlOnly }],
            }),
        });
        expect(result).toMatchObject({ success: false, error: 'Drill 1 ("Warmup Laps") has a diagram that can\'t be saved.' });
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns a friendly error when the database fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        models.practiceSession.create.mockRejectedValue(new Error("connection reset"));
        expect(await call()).toEqual({ success: false, error: "Failed to import the practice plan. Please try again." });
        consoleError.mockRestore();
    });
});
