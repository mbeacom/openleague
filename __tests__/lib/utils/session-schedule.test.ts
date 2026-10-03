/** buildSchedule (3b): each block's start and end instant. */
import { describe, expect, it } from "vitest";
import { buildSchedule } from "@/lib/utils/session-timeline";

const START = new Date("2026-04-07T22:00:00.000Z");

const play = (id: string, sequence: number, duration: number, runsWithPrevious = false) => ({
    id,
    sequence,
    duration,
    runsWithPrevious,
});

const iso = (date: Date) => date.toISOString();

describe("buildSchedule", () => {
    it("returns no rows for a session with no drills", () => {
        expect(buildSchedule([], START)).toEqual([]);
    });

    it("starts sequential drills back to back", () => {
        const rows = buildSchedule([play("a", 0, 15), play("b", 1, 10), play("c", 2, 20)], START);
        expect(rows.map((row) => [row.group.stations[0].id, iso(row.startsAt), iso(row.endsAt)])).toEqual([
            ["a", "2026-04-07T22:00:00.000Z", "2026-04-07T22:15:00.000Z"],
            ["b", "2026-04-07T22:15:00.000Z", "2026-04-07T22:25:00.000Z"],
            ["c", "2026-04-07T22:25:00.000Z", "2026-04-07T22:45:00.000Z"],
        ]);
    });

    it("gives a station block its longest drill's minutes, and starts the next block after it", () => {
        const rows = buildSchedule(
            [play("a", 0, 10), play("b", 1, 15, true), play("c", 2, 5, true), play("d", 3, 10)],
            START,
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].group.stations.map((station) => station.id)).toEqual(["a", "b", "c"]);
        expect(iso(rows[0].endsAt)).toBe("2026-04-07T22:15:00.000Z");
        expect(iso(rows[1].startsAt)).toBe("2026-04-07T22:15:00.000Z");
        expect(iso(rows[1].endsAt)).toBe("2026-04-07T22:25:00.000Z");
    });

    it("orders by sequence, not by array order", () => {
        const rows = buildSchedule([play("b", 1, 10), play("a", 0, 5)], START);
        expect(rows.map((row) => [row.group.stations[0].id, iso(row.startsAt)])).toEqual([
            ["a", "2026-04-07T22:00:00.000Z"],
            ["b", "2026-04-07T22:05:00.000Z"],
        ]);
    });

    it("keeps the caller's objects and leaves the start untouched", () => {
        const a = play("a", 0, 5);
        const rows = buildSchedule([a], START);
        expect(rows[0].group.stations[0]).toBe(a);
        expect(iso(START)).toBe("2026-04-07T22:00:00.000Z");
    });
});
