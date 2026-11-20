/** The drill book's text lines and loading. */
import { describe, expect, it, vi } from "vitest";
import { PLAY_DATA_VERSION, type PlayData } from "@/types/practice-planner";
import type { PlannerStore } from "@/lib/planner-store";
import {
    DRILL_BOOK_LOAD_CONCURRENCY,
    DRILL_BOOK_MAX_DRILLS,
    drillSequenceLines,
    drillTagLine,
    loadDrillBookPlays,
    loadDrillBookSummaries,
} from "@/lib/utils/drill-book";

const data = (steps: (number | undefined)[]): PlayData => ({
    version: PLAY_DATA_VERSION,
    players: [
        { id: "a", role: "F", label: "LW", position: { x: 20, y: 20 }, color: "#1976D2" },
        { id: "b", role: "D", label: "", position: { x: 20, y: 60 }, color: "#1976D2" },
    ],
    drawings: steps.map((step, i) => ({
        id: `s${i}`,
        action: i === 0 ? "carry" : "skate",
        path: "straight",
        end: "arrow",
        points: [{ x: 22, y: 20 + 40 * i }, { x: 60, y: 20 + 40 * i }],
        color: "#212121",
        strokeWidth: 3,
        ...(step === undefined ? {} : { step }),
    })),
    equipment: [],
    annotations: [],
});

describe("drillTagLine", () => {
    it("names the ages in order, the focus and the goalie need", () => {
        expect(drillTagLine({ ageGroups: ["u12", "u8"], focus: "skaters", goalies: "required" })).toBe("8U, 12U · Skaters · Needs goalie");
        expect(drillTagLine({})).toBe("All ages · Team · Goalie optional");
    });
});

describe("drillSequenceLines", () => {
    it("lists an authored drill's steps, naming each skater", () => {
        expect(drillSequenceLines(data([2, 1]))).toEqual(["1. Defense: Skate", "2. LW: Puck carry"]);
    });

    it("prints nothing for a drill in the automatic order, or none at all", () => {
        expect(drillSequenceLines(data([undefined, undefined]))).toEqual([]);
        expect(drillSequenceLines(null)).toEqual([]);
    });
});

function storeWith(total: number, failing: Set<string> = new Set()) {
    let inFlight = 0;
    let peak = 0;
    const store = {
        getPlaysByTeam: vi.fn(async ({ page, limit }: { page: number; limit: number }) => ({
            success: true,
            data: {
                plays: Array.from({ length: Math.max(0, Math.min(limit, total - (page - 1) * limit)) }, (_, i) => ({ id: `p${(page - 1) * limit + i}`, name: "x" })),
                total,
                page,
                limit,
            },
        })),
        getPlayById: vi.fn(async ({ id }: { id: string }) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 1));
            inFlight--;
            if (id === "throws") throw new Error("boom");
            return failing.has(id) ? { success: false, error: "no" } : { success: true, data: { id } };
        }),
    } as unknown as PlannerStore;
    return { store, peak: () => peak };
}

describe("loading", () => {
    it("pages through the library up to the book's cap", async () => {
        const { store } = storeWith(DRILL_BOOK_MAX_DRILLS + 50);
        const plays = await loadDrillBookSummaries(store, "t");
        expect(plays).toHaveLength(DRILL_BOOK_MAX_DRILLS);
        expect(store.getPlaysByTeam).toHaveBeenCalledTimes(2);
    });

    it("loads diagrams a few at a time, in order, with a failed or thrown load as null", async () => {
        const { store, peak } = storeWith(0, new Set(["p3"]));
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const ids = ["p0", "p1", "p2", "p3", "throws", "p5", "p6", "p7", "p8", "p9"];
        const entries = await loadDrillBookPlays(store, "t", ids);
        expect(entries.map((e) => e.id)).toEqual(ids);
        expect(entries.map((e) => e.play === null)).toEqual([false, false, false, true, true, false, false, false, false, false]);
        expect(peak()).toBeLessThanOrEqual(DRILL_BOOK_LOAD_CONCURRENCY);
        error.mockRestore();
    });
});
