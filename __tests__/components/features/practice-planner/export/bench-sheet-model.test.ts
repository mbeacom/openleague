/** buildBenchSheetModel: the bench sheet as plain strings and images, shared by the HTML and Word exports. */
import { describe, expect, it, vi } from "vitest";
import {
    benchSheetPages,
    buildBenchSheetModel,
    drillLines,
    firstPageDrillCount,
    firstPageLines,
    type BenchSheetDrillItem,
    type BenchSheetLayoutInput,
    type BenchSheetRenderers,
    type ExportSession,
    type ExportSessionPlay,
} from "@/components/features/practice-planner/export/bench-sheet-model";
import { DIAGRAM_UNAVAILABLE_TEXT, NO_DRILLS_TEXT } from "@/components/features/practice-planner/export/labels";
import { NO_DRILLS_MESSAGE } from "@/components/features/practice-planner/print/BenchSheet";
import { DIAGRAM_UNAVAILABLE } from "@/components/features/practice-planner/print/PrintDiagram";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { BlockKind, PlayData } from "@/types/practice-planner";
import { logoPng } from "@/__tests__/helpers/logo-png";

const pass = (id: string) => ({
    id,
    action: "pass" as const,
    path: "straight" as const,
    end: "arrow" as const,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    color: "#000000",
    strokeWidth: 2,
});
const withPass = (id: string): PlayData => ({ ...createEmptyPlayData(), drawings: [pass(id)] });

function play(
    name: string,
    sequence: number,
    duration: number,
    runsWithPrevious = false,
    extra: { instructions?: string | null; description?: string | null; playData?: PlayData | null } = {},
): ExportSessionPlay {
    return {
        sequence,
        duration,
        runsWithPrevious,
        instructions: extra.instructions ?? null,
        play: { name, description: extra.description ?? null, playData: extra.playData === undefined ? createEmptyPlayData() : extra.playData },
    };
}

const BOOKED: ExportSession = {
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on Tuesday, April 7
    venueTimezone: "America/Denver",
    teamName: "Hawks U12",
    venueName: "Ice House",
    surfaceName: "Rink A",
    segmentName: null,
    plays: [
        play("Breakout", 0, 10, false, { instructions: "Hard to the net", playData: withPass("a") }),
        play("Regroup", 1, 8, true, { description: "Neutral zone", playData: withPass("b") }),
        play("Shooting", 2, 15, false, { playData: null }),
    ],
};

const UNBOOKED: ExportSession = { ...BOOKED, startAt: null, venueTimezone: null, venueName: null, surfaceName: null };

function renderers(overrides: Partial<BenchSheetRenderers> = {}): BenchSheetRenderers {
    return {
        diagram: vi.fn((_data: PlayData, ratio: number) => `data:image/png;base64,DIA${ratio}`),
        swatch: vi.fn(() => "data:image/png;base64,SWAT"),
        crest: vi.fn(() => "data:image/png;base64,CREST"),
        ...overrides,
    };
}

describe("buildBenchSheetModel", () => {
    it("formats a booked session in the venue's zone with its short name", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.title).toBe("Tuesday Skills");
        expect(model.teamName).toBe("Hawks U12");
        expect(model.when).toBe("Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT");
        expect(model.place).toBe("Ice House · Rink A");
    });

    it("formats an unbooked session in the viewer's zone with no suffix and no place", () => {
        const start = new Date(UNBOOKED.date);
        const end = new Date(start.getTime() + 60 * 60_000);
        const model = buildBenchSheetModel(UNBOOKED, renderers());
        expect(model.when).toBe(`${formatLongDate(start)} · ${formatClockTime(start)} – ${formatClockTime(end)}`);
        expect(model.place).toBeNull();
        expect(model.timeline[0].start).toBe(formatClockTime(start));
    });

    it("omits the team when it is blank (a static device without Your team)", () => {
        expect(buildBenchSheetModel({ ...BOOKED, teamName: "   " }, renderers()).teamName).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, teamName: "" }, renderers()).teamName).toBeNull();
    });

    it("lists one timeline row per block, with station blocks expanded", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.timeline).toEqual([
            { start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min", "Regroup · 8 min"] },
            { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null },
        ]);
        expect(model.planned).toBe("Planned 25 of 60 min");
        expect(model.overTime).toBe(false);
    });

    it("flags a plan longer than the booking", () => {
        const model = buildBenchSheetModel({ ...BOOKED, duration: 20 }, renderers());
        expect(model.planned).toBe("Planned 25 of 20 min (over time!)");
        expect(model.overTime).toBe(true);
    });

    it("numbers drills in schedule order with station tags, block starts and text fallback", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.drills.map(({ number, name, start, minutes, station, text }) => ({ number, name, start, minutes, station, text }))).toEqual([
            { number: 1, name: "Breakout", start: "6:00 PM MDT", minutes: 10, station: "Station 1 of 2", text: "Hard to the net" },
            { number: 2, name: "Regroup", start: "6:00 PM MDT", minutes: 8, station: "Station 2 of 2", text: "Neutral zone" },
            { number: 3, name: "Shooting", start: "6:10 PM MDT", minutes: 15, station: null, text: null },
        ]);
    });

    it("draws readable diagrams at the bench sheet's pixel ratio and skips unreadable ones", () => {
        const r = renderers();
        const model = buildBenchSheetModel(BOOKED, r);
        expect(model.drills.map((d) => d.diagram)).toEqual(["data:image/png;base64,DIA3", "data:image/png;base64,DIA3", null]);
        expect(r.diagram).toHaveBeenCalledTimes(2);
    });

    it.each([
        [12, 3],
        [25, 2],
        [41, 2],
    ])("uses pixel ratio for %i readable drills: %i", (count, ratio) => {
        const plays = Array.from({ length: count }, (_, i) => play(`Drill ${i}`, i, 1));
        const r = renderers();
        buildBenchSheetModel({ ...BOOKED, duration: 300, plays }, r);
        expect(vi.mocked(r.diagram).mock.calls.every(([, used]) => used === ratio)).toBe(true);
    });

    it("leaves a diagram the renderer couldn't draw as null", () => {
        const model = buildBenchSheetModel(BOOKED, renderers({ diagram: () => null }));
        expect(model.drills.every((d) => d.diagram === null)).toBe(true);
    });

    it("builds one legend across all drills, each symbol once", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.legend).toEqual(buildLegend(withPass("x")).map((entry) => ({ label: entry.label, image: "data:image/png;base64,SWAT" })));
    });

    it("gives an empty session no rows, drills or legend", () => {
        const model = buildBenchSheetModel({ ...BOOKED, plays: [] }, renderers());
        expect([model.timeline, model.drills, model.legend]).toEqual([[], [], []]);
        expect(model.planned).toBe("Planned 0 of 60 min");
    });
});

describe("export copy", () => {
    it("matches the on-screen bench sheet", () => {
        expect(NO_DRILLS_TEXT).toBe(NO_DRILLS_MESSAGE);
        expect(DIAGRAM_UNAVAILABLE_TEXT).toBe(DIAGRAM_UNAVAILABLE);
    });
});

describe("goalie markers (spec R7)", () => {
    const goalieBoard: PlayData = {
        ...createEmptyPlayData(),
        players: [
            { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
            { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
        ],
    };
    const session = (goaliesAttending: number | null): ExportSession => ({
        ...UNBOOKED,
        goaliesAttending,
        plays: [
            { ...play("D-Zone", 0, 10, false, { playData: goalieBoard }), play: { name: "D-Zone", description: null, playData: goalieBoard, goalies: "optional" } },
            { ...play("Warm-up", 1, 10, false, { playData: goalieBoard }), play: { name: "Warm-up", description: null, playData: goalieBoard, goalies: "required" } },
        ],
    });

    function drawn(goaliesAttending: number | null): string[][] {
        const diagrams: PlayData[] = [];
        const renderers: BenchSheetRenderers = {
            diagram: (playData) => {
                diagrams.push(playData);
                return "data:image/png;base64,AA==";
            },
            swatch: () => null,
            crest: () => null,
        };
        buildBenchSheetModel(session(goaliesAttending), renderers);
        return diagrams.map((d) => d.players.map((p) => p.role));
    }

    it("hides the goalie on optional-goalie drills when 0 goalies attend; keeps it on required drills", () => {
        expect(drawn(0)).toEqual([["F"], ["G", "F"]]);
    });

    it("changes nothing when goalies attend or the count is not set", () => {
        expect(drawn(1)).toEqual([["G", "F"], ["G", "F"]]);
        expect(drawn(null)).toEqual([["G", "F"], ["G", "F"]]);
    });

    it("never touches the stored diagram", () => {
        drawn(0);
        expect(goalieBoard.players).toHaveLength(2);
    });
});

describe("buildBenchSheetModel: block rows and the gap", () => {
    const blockRow = (kind: BlockKind, sequence: number, duration: number, label: string | null = null, instructions: string | null = null) =>
        ({ kind, sequence, duration, label, instructions, runsWithPrevious: false });
    const WITH_BLOCKS: ExportSession = {
        ...UNBOOKED,
        transitionMinutes: 2,
        plays: [
            blockRow("warmup", 0, 8, null, "Easy laps"),
            play("Breakout", 1, 10, false, { playData: withPass("a") }),
            blockRow("break", 2, 2, "Water"),
            play("Shooting", 3, 15, false, { playData: withPass("b") }),
        ],
    };

    it("lists blocks on the timeline by label and note, with the gap in the start times", () => {
        const model = buildBenchSheetModel(WITH_BLOCKS, renderers());
        const start = new Date(WITH_BLOCKS.date);
        const at = (minutes: number) => formatClockTime(new Date(start.getTime() + minutes * 60_000), undefined, false);
        expect(model.timeline).toEqual([
            { kind: "block", start: at(0), minutes: 8, label: "Warm-up", note: "Easy laps", stations: null },
            { start: at(10), minutes: 10, label: "Breakout", stations: null },
            { kind: "block", start: at(22), minutes: 2, label: "Water", note: null, stations: null },
            { start: at(26), minutes: 15, label: "Shooting", stations: null },
        ]);
        expect(model.planned).toBe("Planned 41 of 60 min");
    });

    it("numbers and draws drills only", () => {
        const model = buildBenchSheetModel(WITH_BLOCKS, renderers());
        expect(model.drills.map((d) => [d.number, d.name])).toEqual([[1, "Breakout"], [2, "Shooting"]]);
        // Both drills draw one pass: one legend entry, from the drills alone.
        expect(model.legend).toEqual(buildLegend(withPass("x")).map((entry) => ({ label: entry.label, image: "data:image/png;base64,SWAT" })));
    });
});

describe("buildBenchSheetModel: rotation and the gap (spec R10)", () => {
    const ROTATING: ExportSession = {
        ...UNBOOKED,
        transitionMinutes: 2,
        plays: [
            { ...play("Goalie", 0, 10, false, { playData: withPass("g") }), stays: true, rotateEveryMinutes: 5 },
            { ...play("Skate A", 1, 5, true), stays: false, rotateEveryMinutes: null },
            { ...play("Skate B", 2, 5, true), stays: false, rotateEveryMinutes: null },
        ],
    };
    const at = (minutes: number) => formatClockTime(new Date(new Date(ROTATING.date).getTime() + minutes * 60_000), undefined, false);

    it("emits a rotation row: its header, the stations with stays marked, and the grid at clock times", () => {
        const model = buildBenchSheetModel(ROTATING, renderers());
        expect(model.timeline).toEqual([
            {
                kind: "rotation",
                start: at(0),
                minutes: 10,
                label: "Stations · rotate every 5 min · 10 min",
                stations: ["Goalie · stays", "Skate A", "Skate B"],
                grid: {
                    columns: ["Goalie", "Skate A", "Skate B"],
                    rows: [
                        { start: at(0), cells: ["all", "A", "B"] },
                        { start: at(5), cells: ["all", "B", "A"] },
                    ],
                },
            },
        ]);
        expect(model.drills.map((d) => d.station)).toEqual(["Station 1 of 3", "Station 2 of 3", "Station 3 of 3"]);
    });

    it("names who runs each rotating station in its line, after stays, and puts no runBy on the rotation row", () => {
        const model = buildBenchSheetModel(
            {
                ...ROTATING,
                staff: [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }],
                plays: ROTATING.plays.map((row, index) => ({ ...row, staff: [["s1"], [], ["s2", "s1"]][index] })),
            },
            renderers(),
        );
        expect(model.timeline[0]).toMatchObject({
            kind: "rotation",
            stations: ["Goalie · stays · run by Coach Lee", "Skate A", "Skate B · run by Sam, Coach Lee"],
            grid: { columns: ["Goalie", "Skate A", "Skate B"] },
        });
        expect(model.timeline[0]).not.toHaveProperty("runBy");
    });

    it("says the gap for the header only when there is one", () => {
        expect(buildBenchSheetModel(ROTATING, renderers()).gap).toBe("2 min between blocks");
        expect(buildBenchSheetModel(UNBOOKED, renderers()).gap).toBeNull();
    });
});

describe("buildBenchSheetModel: practice staff (spec R9)", () => {
    const STAFFED: ExportSession = {
        ...BOOKED,
        staff: [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }],
        plays: [
            { ...play("Breakout", 0, 10, false, { playData: withPass("a") }), staff: ["s1"] },
            { ...play("Regroup", 1, 8, true, { playData: withPass("b") }), staff: ["s2", "s1"] },
            { ...play("Shooting", 2, 15, false, { playData: null }), staff: ["s2"] },
            { kind: "break", sequence: 3, duration: 2, instructions: null, runsWithPrevious: false, label: null, staff: ["s1", "gone"] },
        ],
    };

    it("names the staff in the header and who runs each row: in a station's line, or as the row's runBy", () => {
        const model = buildBenchSheetModel(STAFFED, renderers());
        expect(model.staff).toBe("Staff: Coach Lee, Sam");
        expect(model.timeline).toMatchObject([
            { label: "Stations · 2", stations: ["Breakout · 10 min · run by Coach Lee", "Regroup · 8 min · run by Sam, Coach Lee"] },
            { label: "Shooting", stations: null, runBy: "run by Sam" },
            { kind: "block", label: "Water break", runBy: "run by Coach Lee" },
        ]);
        expect(model.timeline[0]).not.toHaveProperty("runBy");
    });

    it("has no staff line and no runBy without a staff list", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.staff).toBeNull();
        expect(model.timeline.some((row) => "runBy" in row)).toBe(false);
    });
});

describe("buildBenchSheetModel: practice roster (roster spec R10, R15)", () => {
    const ROSTERED: ExportSession = {
        ...BOOKED,
        roster: {
            ageGroup: "u8",
            roles: ["S", "G"],
            players: [
                { key: "a", name: "Alex", number: "7", role: "S" },
                { key: "b", name: "", number: "", role: "S" },
                { key: "c", name: "Pat", number: "", role: "G" },
            ],
        },
    };

    it("prints the counts always and the names only when included", () => {
        const plain = buildBenchSheetModel(ROSTERED, renderers());
        expect(plain.roster).toBe("Roster: 2 skaters · 1 goalie");
        expect(plain.rosterPlayers).toEqual([]);
        expect(JSON.stringify(plain)).not.toContain("Alex");
        const named = buildBenchSheetModel(ROSTERED, renderers(), { includeRosterNames: true });
        expect(named.rosterPlayers).toEqual(["Skater: #7 Alex, Skater 2", "Goalie: Pat"]);
    });

    it("has no roster line without players", () => {
        expect(buildBenchSheetModel(BOOKED, renderers()).roster).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, roster: { ageGroup: null, roles: ["S", "G"], players: [] } }, renderers()).roster).toBeNull();
    });
});

describe("buildBenchSheetModel: the team mark (practice logo spec R2, R3, R5)", () => {
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const MARK = { id: "cteamxxxxxxxxxxxxxxxxxxxx", name: "Hawks <U12>", logoUrl: "https://x.blob.vercel-storage.com/a.png", color: "#9B1B30" };

    it("embeds the logo 48 px high, its ratio kept, with the team's alt text", () => {
        const model = buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers(), { logo: { dataUrl: logoPng(512, 256), width: 512, height: 256 } });
        expect(model.mark).toEqual({ image: logoPng(512, 256), width: 96, height: 48, alt: "Hawks <U12> logo" });
    });

    it("fits a wide wordmark within 144 px", () => {
        expect(buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers(), { logo: { dataUrl: logoPng(512, 85), width: 512, height: 85 } }).mark).toMatchObject({ width: 144, height: 24 });
    });

    it("draws the Crest in the team's color when there is no logo, or the logo isn't a valid PNG", () => {
        const crest = vi.fn(() => "data:image/png;base64,CREST");
        expect(buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers({ crest })).mark).toEqual({ image: "data:image/png;base64,CREST", width: 48, height: 48, alt: "Hawks <U12> logo" });
        expect(crest).toHaveBeenCalledWith("Hawks <U12>", "#9B1B30");
        const bad = buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers({ crest }), { logo: { dataUrl: "https://x/a.png", width: 10, height: 10 } });
        expect(bad.mark?.image).toBe("data:image/png;base64,CREST");
    });

    it("shows no mark without a team mark, without a team name, or when the Crest can't be drawn", () => {
        expect(buildBenchSheetModel(BOOKED, renderers()).mark).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, teamName: "", teamMark: MARK }, renderers()).mark).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, teamMark: MARK }, renderers({ crest: () => null })).mark).toBeNull();
    });
});

describe("buildBenchSheetModel: equipment (practice equipment spec R4, R5)", () => {
    const gear = (kinds: Array<"cone" | "net" | "puck">, extra: Partial<PlayData> = {}): PlayData => ({
        ...createEmptyPlayData(),
        equipment: kinds.map((kind, i) => ({ id: `${kind}${i}`, kind, position: { x: 10 + i, y: 10 }, rotation: 0 })),
        ...extra,
    });

    it("rolls the drills up (stations summed, blocks maxed) and adds the practice's items", () => {
        const session: ExportSession = {
            ...UNBOOKED,
            equipment: [{ name: "Water bottles", count: 20 }],
            plays: [
                play("Solo", 0, 10, false, { playData: gear(["cone", "cone", "cone"]) }),
                play("Station A", 1, 10, false, { playData: gear(["cone", "cone", "net"]) }),
                play("Station B", 2, 10, true, { playData: gear(["cone", "cone", "net"], { equipmentNeeds: { kinds: [], custom: [{ name: "Tennis balls", count: 6 }] } }) }),
            ],
        };
        const model = buildBenchSheetModel(session, renderers());
        expect(model.equipment).toEqual(["Cones ×4", "Nets ×2", "Tennis balls ×6", "Water bottles ×20"]);
        expect(model.drills.map((drill) => drill.equipment)).toEqual([
            "Equipment: Cones ×3",
            "Equipment: Cones ×2 · Net ×1",
            "Equipment: Cones ×2 · Net ×1 · Tennis balls ×6",
        ]);
    });

    it("is empty for a practice that needs nothing, and null for an unreadable drill", () => {
        const model = buildBenchSheetModel(UNBOOKED, renderers());
        expect(model.equipment).toEqual([]);
        expect(model.drills.map((drill) => drill.equipment)).toEqual([null, null, null]);
    });
});

describe("buildBenchSheetModel: team colors", () => {
    const MARK = { id: "t1", name: "Ice Hawks", logoUrl: null, color: "#7A0019", secondaryColor: "#1B5E20" };
    const skaters = (): PlayData => ({
        ...createEmptyPlayData(),
        players: [
            { id: "x", role: "X", label: "", color: "#1976D2", position: { x: 10, y: 10 } },
            { id: "d", role: "D", label: "", color: "#0D47A1", position: { x: 20, y: 10 } },
            { id: "o", role: "O", label: "", color: "#D32F2F", position: { x: 30, y: 10 } },
        ],
    });
    const SESSION: ExportSession = { ...BOOKED, teamMark: MARK, plays: [play("Breakout", 0, 10, false, { playData: skaters() })] };

    it("paints the header from the team's palette, else League Blue", () => {
        expect(buildBenchSheetModel(SESSION, renderers()).palette).toMatchObject({ fromTeam: true, band: "#7A0019", accent: "#1B5E20" });
        expect(buildBenchSheetModel(BOOKED, renderers()).palette).toMatchObject({ fromTeam: false, band: "#0D47A1" });
        // No team name, no mark: no team colors either (spec R4).
        expect(buildBenchSheetModel({ ...SESSION, teamName: "" }, renderers()).palette.fromTeam).toBe(false);
    });

    it("keeps the diagrams' default colors unless the option is on", () => {
        const diagram = vi.fn((_data: PlayData, ratio: number) => `data:image/png;base64,DIA${ratio}`);
        buildBenchSheetModel(SESSION, renderers({ diagram }));
        expect(diagram.mock.calls[0][0].players.map((p) => p.color)).toEqual(["#1976D2", "#0D47A1", "#D32F2F"]);
    });

    it("draws team markers and their legend swatches in team colors when the option is on, never the opponent", () => {
        const diagram = vi.fn((_data: PlayData, ratio: number) => `data:image/png;base64,DIA${ratio}`);
        const swatch = vi.fn((_entry: LegendEntry) => "data:image/png;base64,SWAT");
        buildBenchSheetModel(SESSION, renderers({ diagram, swatch }), { teamColors: true });
        expect(diagram.mock.calls[0][0].players.map((p) => p.color)).toEqual(["#7A0019", "#1B5E20", "#D32F2F"]);
        const roles = swatch.mock.calls.map(([entry]) => entry as LegendEntry & { color?: string });
        expect(roles.find((entry) => entry.key === "role-X")?.color).toBe("#7A0019");
        expect(roles.find((entry) => entry.key === "role-D")?.color).toBe("#1B5E20");
        expect(roles.find((entry) => entry.key === "role-O")?.color).toBeUndefined();
        // The stored session is untouched.
        expect((SESSION.plays[0] as ExportSessionPlay).play.playData?.players[0].color).toBe("#1976D2");
    });
});

describe("bench sheet pagination: drills on page 1", () => {
    const drillItem = (number: number, extra: Partial<BenchSheetDrillItem> = {}): BenchSheetDrillItem => ({
        number, name: `Drill ${number}`, start: "6:00 PM", minutes: 10, station: null, diagram: null, text: null, equipment: null, ...extra,
    });
    const SHORT: BenchSheetLayoutInput = {
        teamName: "Hawks U12", place: null, staff: null, roster: null, rosterPlayers: [], gap: null,
        timeline: [{ start: "6:00 PM", minutes: 10, label: "Breakout", stations: null }],
        equipment: [],
        legend: [{ label: "Pass", image: null }],
        drills: [drillItem(1), drillItem(2), drillItem(3)],
    };
    const rows = (count: number): BenchSheetLayoutInput["timeline"] =>
        Array.from({ length: count }, (_, i) => ({ start: "6:00 PM", minutes: 5, label: `Drill ${i + 1}`, stations: null }));

    it("counts the header, timeline, equipment and legend lines page 1 holds", () => {
        const base = firstPageLines(SHORT);
        expect(firstPageLines({ ...SHORT, timeline: rows(5) })).toBe(base + 4);
        expect(firstPageLines({ ...SHORT, staff: "Staff: Lee", roster: "Roster: 7 skaters", rosterPlayers: ["Goalie: #30 Pat"] })).toBe(base + 3);
        expect(firstPageLines({ ...SHORT, equipment: ["Cones ×6", "Pucks ×30", "Net ×2", "Tires ×4"] })).toBe(base + 2 + 2);
        // A station block lists each station; a rotation adds its grid.
        expect(firstPageLines({ ...SHORT, timeline: [{ start: "6:00 PM", minutes: 10, label: "Stations · 2", stations: ["A", "B"] }] })).toBe(base + 2);
    });

    it("pulls the first drill onto a short page 1, and keeps a long page 1 drill-free", () => {
        expect(firstPageDrillCount(SHORT)).toBe(1);
        expect(firstPageDrillCount({ ...SHORT, timeline: rows(25) })).toBe(0);
        expect(firstPageDrillCount({ ...SHORT, rosterPlayers: Array.from({ length: 20 }, (_, i) => `Skater #${i}`) })).toBe(0);
    });

    it("pulls a second drill only when both fit, which a pair (nearly a page on its own) never does under a header", () => {
        const bare: BenchSheetLayoutInput = { ...SHORT, teamName: null, timeline: [], legend: [] };
        expect(firstPageDrillCount(bare)).toBe(1);
        expect(firstPageLines(bare) + 2 * drillLines(drillItem(1))).toBeGreaterThan(40);
    });

    it("counts a drill's text and equipment against the room left", () => {
        expect(drillLines(drillItem(1, { equipment: "Equipment: Cones ×6", text: "Line one\nLine two" }))).toBe(drillLines(drillItem(1)) + 3);
        expect(firstPageDrillCount({ ...SHORT, drills: [drillItem(1, { text: "x".repeat(2000) })] })).toBe(0);
    });

    it("never pulls a drill that isn't there", () => {
        expect(firstPageDrillCount({ ...SHORT, drills: [] })).toBe(0);
    });

    it("pages the drills: page 1's first, then two to a page", () => {
        const items = ["a", "b", "c", "d", "e"];
        expect(benchSheetPages(items, 0).map((page) => [page.items, page.first, page.onFirstPage])).toEqual([
            [["a", "b"], 0, false],
            [["c", "d"], 2, false],
            [["e"], 4, false],
        ]);
        expect(benchSheetPages(items, 1).map((page) => [page.items, page.first, page.onFirstPage])).toEqual([
            [["a"], 0, true],
            [["b", "c"], 1, false],
            [["d", "e"], 3, false],
        ]);
        expect(benchSheetPages(["a"], 2).map((page) => page.items)).toEqual([["a"]]);
        expect(benchSheetPages([], 1)).toEqual([]);
    });

    it("is the model's call, so the print and both downloads agree", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.firstPageDrills).toBe(firstPageDrillCount(model));
        expect(model.firstPageDrills).toBe(1);
    });
});
