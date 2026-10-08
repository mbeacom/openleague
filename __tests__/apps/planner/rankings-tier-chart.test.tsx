// __tests__/apps/planner/rankings-tier-chart.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { composite, type RatingsResult } from "@/lib/ratings";
import { toRatingInputs, type RankingsDocument } from "@/lib/rankings-document";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { RankingsTierChart, TIER_CHART_TITLE, VIEW_AS_TABLE_LABEL, dotLabel } from "@/apps/planner/src/screens/rankings/RankingsTierChart";
import {
    BELOW_LANE_KEY,
    LABEL_CHAR_PX,
    TIER_DISTINCT_LEVELS,
    TIER_RAMP,
    describeTierChart,
    dodgeRows,
    fitLabel,
    labelledTeams,
    nearestPoint,
    rowOffset,
    tierChartData,
    tierColor,
    tierLightness,
} from "@/apps/planner/src/screens/rankings/tierChart";
import { memoryStore, renderScreen } from "./render-screen";
import { leagueRankingsDoc, sampleRankingsDoc } from "./rankings-fixtures";
import { formatRating } from "@/apps/planner/src/screens/rankings/display";

function ratings(doc: RankingsDocument): RatingsResult {
    const { games, teams, options } = toRatingInputs(doc);
    return composite(games, teams, doc.method, options);
}

describe("tierChartData", () => {
    const doc = leagueRankingsDoc();
    const result = ratings(doc);
    const data = tierChartData(result.teams, doc.method.levels);

    it("puts every ranked team in exactly one lane, levels in order, then the lane past the last level", () => {
        expect(data.lanes.map((lane) => lane.level)).toEqual(["A1", "A2", "B1", "B2", "C1", "C2", "C3", null]);
        expect(data.lanes.at(-1)!.key).toBe(BELOW_LANE_KEY);
        const placed = data.lanes.flatMap((lane) => lane.teams.map((team) => team.number));
        expect(new Set(placed).size).toBe(result.ranked.length);
        expect(placed).toHaveLength(result.ranked.length);
        for (const lane of data.lanes) for (const team of lane.teams) expect(team.level).toBe(lane.level);
        const capacity = doc.method.levels.reduce((sum, level) => sum + level.size, 0);
        expect(capacity).toBe(47);
        expect(data.lanes.at(-1)!.teams).toHaveLength(result.ranked.length - capacity);
    });

    it("names the teams it can't place instead of dropping them", () => {
        const unranked = result.teams.filter((row) => row.rank === null).map((row) => row.number);
        expect(unranked.length).toBeGreaterThan(0);
        expect(data.unplotted.map((team) => team.number)).toEqual(unranked);
        expect(data.rankedCount + data.unplotted.length).toBe(result.teams.length);
    });

    it("cuts halfway between neighbouring levels, falling from the top", () => {
        expect(data.cuts).toHaveLength(data.lanes.filter((lane) => lane.teams.length > 0).length - 1);
        for (const cut of data.cuts) {
            const above = data.lanes.find((lane) => lane.key === cut.above)!;
            const below = data.lanes.find((lane) => lane.key === cut.below)!;
            expect(cut.rpi).toBeCloseTo((above.min! + below.max!) / 2, 9);
            expect(cut.rpi).toBeLessThanOrEqual(above.min!);
            expect(cut.rpi).toBeGreaterThanOrEqual(below.max!);
        }
        for (let i = 1; i < data.cuts.length; i++) expect(data.cuts[i].rpi).toBeLessThanOrEqual(data.cuts[i - 1].rpi);
    });

    it("keeps an empty level's lane and skips it when cutting", () => {
        const levels = [
            { name: "X", size: 2 },
            { name: "Empty", size: 0 },
            { name: "Y", size: 2 },
        ];
        const small = sampleRankingsDoc({ method: { ...sampleRankingsDoc().method, levels } });
        const shaped = tierChartData(ratings(small).teams, levels);
        expect(shaped.lanes.map((lane) => [lane.level, lane.teams.length])).toEqual([
            ["X", 2],
            ["Empty", 0],
            ["Y", 2],
        ]);
        expect(shaped.cuts.map((cut) => [cut.above, cut.below])).toEqual([["level:0", "level:2"]]);
    });

    it("has no lanes past the last level when the levels hold everyone, and nothing to plot without ranks", () => {
        const doc4 = sampleRankingsDoc();
        expect(tierChartData(ratings(doc4).teams, doc4.method.levels).lanes.some((lane) => lane.key === BELOW_LANE_KEY)).toBe(false);
        const empty = tierChartData([], doc4.method.levels);
        expect(empty.rankedCount).toBe(0);
        expect(empty.cuts).toEqual([]);
        expect(describeTierChart(empty, null)).toBe("No ranked teams yet.");
    });

    it("carries an optional logo through untouched", () => {
        const logos = new Map([[result.ranked[0].number, "data:image/png;base64,AAAA"]]);
        const shaped = tierChartData(result.teams, doc.method.levels, logos);
        expect(shaped.lanes[0].teams[0].logo).toBe("data:image/png;base64,AAAA");
        expect(shaped.lanes[0].teams[1].logo).toBeUndefined();
    });

    it("labels your team, the top team and the last ranked team", () => {
        expect(labelledTeams(data, doc.myTeam)).toEqual(new Set([doc.myTeam!, result.ranked[0].number, result.ranked.at(-1)!.number]));
        expect(labelledTeams(data, null).size).toBe(2);
    });

    it("describes the chart in words, with your team", () => {
        const text = describeTierChart(data, doc.myTeam);
        const mine = result.byNumber.get(doc.myTeam!)!;
        expect(text).toContain(`${result.ranked.length} ranked teams`);
        expect(text).toContain(`A1: 6 teams`);
        expect(text).toContain(`Your team, ${mine.name}, is rank ${mine.rank}`);
    });

    it("gives every cut between neighbouring levels in words, since the cut labels are hidden from assistive tech", () => {
        const text = describeTierChart(data, doc.myTeam);
        const name = (key: string) => data.lanes.find((lane) => lane.key === key)!.level ?? "Below the last level";
        expect(data.cuts.length).toBeGreaterThan(0);
        for (const cut of data.cuts) expect(text).toContain(`${name(cut.above)} and ${name(cut.below)} at RPI ${cut.rpi.toFixed(1)}`);
    });
});

describe("dodgeRows", () => {
    it("never puts two points in a row closer than the gap", () => {
        const xs = [10, 12, 13, 30, 31, 31, 31, 50, 59, 60];
        const rows = dodgeRows(xs, 10);
        for (let i = 0; i < xs.length; i++) {
            for (let j = i + 1; j < xs.length; j++) if (rows[i] === rows[j]) expect(Math.abs(xs[i] - xs[j])).toBeGreaterThanOrEqual(10);
        }
    });

    it("is deterministic and keeps isolated points on the centre row", () => {
        expect(dodgeRows([5, 100, 200], 10)).toEqual([0, 0, 0]);
        expect(dodgeRows([31, 31, 31], 10)).toEqual([0, 1, 2]);
        expect(dodgeRows([31, 31, 31], 10)).toEqual(dodgeRows([31, 31, 31], 10));
    });

    it("spreads rows out from the centre", () => {
        expect([0, 1, 2, 3, 4].map(rowOffset)).toEqual([0, -1, 1, -2, 2]);
    });
});

describe("fitLabel", () => {
    it("keeps a label that fits and shortens one that doesn't, keeping the suffix", () => {
        expect(fitLabel("Hilltop M1", 200)).toBe("Hilltop M1");
        const long = "Riverside ".repeat(10).trim();
        const fitted = fitLabel(long, 100, " (you)");
        expect(fitted.endsWith("… (you)")).toBe(true);
        expect(fitted.length * LABEL_CHAR_PX).toBeLessThanOrEqual(100);
        expect(fitLabel(long, 0).length).toBeGreaterThan(0);
    });
});

describe("nearestPoint", () => {
    it("picks the closest point within reach, so neighbouring dots never share a tap", () => {
        const points = [
            { id: "a", x: 50, y: 40 },
            { id: "b", x: 50, y: 52 },
        ];
        // Inside both 12px hit circles, but nearer b.
        expect(nearestPoint(points, 50, 49, 22)?.id).toBe("b");
        expect(nearestPoint(points, 50, 45, 22)?.id).toBe("a");
        expect(nearestPoint(points, 200, 200, 22)).toBeNull();
    });
});

describe("tierColor", () => {
    it.each(["light", "dark"] as const)("steps lightness at least 0.06 between neighbouring levels in %s", (scheme) => {
        const steps = Array.from({ length: 7 }, (_v, i) => tierLightness(scheme, i, 7));
        for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i] - steps[i - 1])).toBeGreaterThanOrEqual(0.06 - 1e-9);
        expect(steps[0]).toBe(TIER_RAMP[scheme].top);
    });

    it.each(["light", "dark"] as const)("only promises the 0.06 step up to the distinct-level count in %s", (scheme) => {
        const step = (count: number) => Math.abs(tierLightness(scheme, 1, count) - tierLightness(scheme, 0, count));
        expect(step(TIER_DISTINCT_LEVELS)).toBeGreaterThanOrEqual(0.06 - 1e-9);
        expect(step(TIER_DISTINCT_LEVELS + 1)).toBeLessThan(0.06);
    });

    it("reads dark to light from the top level on light, and flips the anchor on dark", () => {
        expect(tierLightness("light", 0, 7)).toBeLessThan(tierLightness("light", 6, 7));
        expect(tierLightness("dark", 0, 7)).toBeGreaterThan(tierLightness("dark", 6, 7));
    });

    it("produces the validated seven-level ramps", () => {
        const ramp = (scheme: "light" | "dark") => Array.from({ length: 7 }, (_v, i) => tierColor(scheme, i, 7));
        expect(ramp("light")).toEqual(["#004090", "#1553a8", "#2a67bd", "#3e7ad3", "#518fe9", "#66a3fe", "#8ab9ff"]);
        expect(ramp("dark")).toEqual(["#c0d9fe", "#9cc4ff", "#78aefe", "#6499e8", "#5084d1", "#3d70bb", "#295ca5"]);
    });
});

describe("RankingsTierChart", () => {
    const doc = leagueRankingsDoc();
    const result = ratings(doc);

    function renderChart(onShowTable?: () => void, teams = result.teams) {
        const { store } = memoryStore();
        return renderScreen(<RankingsTierChart teams={teams} levels={doc.method.levels} myTeam={doc.myTeam} onShowTable={onShowTable} />, store);
    }

    function atWidth(width: number) {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
            width,
            height: 0,
            top: 0,
            left: 0,
            right: width,
            bottom: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shortens long direct labels to stay inside the chart, keeping the full name in the dot and tooltip", () => {
        atWidth(320);
        const longName = `Riverside ${"Northern Valley ".repeat(6)}Juniors`.slice(0, 100);
        const top = result.ranked[0].number;
        const teams = result.teams.map((row) => (row.number === top ? { ...row, name: longName } : row));
        const { container } = renderChart(undefined, teams);
        const svg = container.querySelector<SVGSVGElement>("svg[role='group']")!;
        const plotWidth = Number(svg.getAttribute("width"));
        const labels = [...container.querySelectorAll<SVGTextElement>(".tier-labels text")];
        expect(labels.length).toBeGreaterThan(0);
        const label = labels.find((node) => node.textContent!.startsWith("Riverside Northern"))!;
        expect(label.textContent!.endsWith("…")).toBe(true);
        const x = Number(label.getAttribute("x"));
        const extent = label.textContent!.length * LABEL_CHAR_PX;
        if (label.getAttribute("text-anchor") === "end") expect(x - extent).toBeGreaterThanOrEqual(0);
        else expect(x + extent).toBeLessThanOrEqual(plotWidth);
        expect(screen.getByRole("img", { name: new RegExp(`^${longName}, rank 1`) })).toBeInTheDocument();
        fireEvent.click(container.querySelector(`[data-team="${top}"]`)!);
        expect(screen.getByRole("tooltip")).toHaveTextContent(longName);
    });

    it("keeps each lane's RPI range in the narrow layout", () => {
        atWidth(320);
        const { container } = renderChart();
        const data = tierChartData(result.teams, doc.method.levels);
        for (const lane of data.lanes.filter((l) => l.teams.length > 0)) {
            const label = container.querySelector(`[data-lane="${lane.key}"]`)!;
            expect(label.textContent).toContain(`${formatRating(lane.min)}–${formatRating(lane.max)}`);
        }
    });

    it("resolves a tap to the nearest dot, so a neighbour's tooltip never opens", () => {
        const { container } = renderChart();
        const position = (number: string) => {
            const dot = container.querySelector(`[data-team="${number}"] .tier-dot`)!;
            return { x: Number(dot.getAttribute("cx")), y: Number(dot.getAttribute("cy")) };
        };
        // Two teams in one lane on neighbouring dodge rows: their old 12px hit circles overlapped.
        const data = tierChartData(result.teams, doc.method.levels);
        let pair: [string, string] | null = null;
        for (const lane of data.lanes) {
            for (const a of lane.teams) {
                for (const b of lane.teams) {
                    if (a === b || pair) continue;
                    const pa = position(a.number);
                    const pb = position(b.number);
                    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 24 && pb.y > pa.y) pair = [a.number, b.number];
                }
            }
        }
        expect(pair).not.toBeNull();
        const [, near] = pair!;
        const target = position(near);
        const layer = container.querySelector(".tier-hit-layer")!;
        fireEvent.click(layer, { clientX: target.x, clientY: target.y - 2 });
        expect(screen.getByRole("tooltip")).toHaveTextContent(result.byNumber.get(near)!.name);
    });

    it("draws a low-confidence selected team hollow inside its ring", () => {
        const teams = result.teams.map((row) => (row.number === doc.myTeam ? { ...row, lowConfidence: true } : row));
        const { container } = renderChart(undefined, teams);
        const mine = container.querySelector(`[data-team="${doc.myTeam}"] .tier-dot`)!;
        expect(mine.getAttribute("data-hollow")).toBe("true");
        const solid = container.querySelector(`[data-team="${doc.myTeam}"]`)!;
        expect(solid.getAttribute("data-mine")).toBe("true");
    });

    it("is a labelled, described group with one dot per ranked team", () => {
        const { container } = renderChart();
        const group = screen.getByRole("group", { name: TIER_CHART_TITLE });
        expect(group.tagName.toLowerCase()).toBe("svg");
        expect(container.querySelector("desc")?.textContent).toContain(`${result.ranked.length} ranked teams`);
        expect(within(group).getAllByRole("img")).toHaveLength(result.ranked.length);
    });

    it("names each dot in words, movement included, and marks your team", () => {
        renderChart();
        const mine = result.byNumber.get(doc.myTeam!)!;
        const mover = result.ranked.find((row) => row.movement === "up")!;
        expect(
            screen.getByRole("img", { name: new RegExp(`^${mine.name} \\(your team\\), rank ${mine.rank} of ${result.ranked.length}`) }),
        ).toBeInTheDocument();
        expect(screen.getByRole("img", { name: new RegExp(`^${mover.name}, .*Up from ${mover.startingBracket}`) })).toBeInTheDocument();
    });

    it("is a single tab stop, starting on your team", () => {
        const { container } = renderChart();
        const stops = container.querySelectorAll('[tabindex="0"]');
        expect(stops).toHaveLength(1);
        expect(stops[0].getAttribute("data-team")).toBe(doc.myTeam);
    });

    it("moves focus by rank with the arrow keys and shows the same details as hover", () => {
        const { container } = renderChart();
        const mine = result.byNumber.get(doc.myTeam!)!;
        const start = container.querySelector<SVGGElement>(`[data-team="${doc.myTeam}"]`)!;
        act(() => start.focus());
        expect(screen.getByRole("tooltip")).toHaveTextContent(mine.name);
        fireEvent.keyDown(start, { key: "ArrowRight" });
        const next = result.ranked[mine.rank!];
        expect(document.activeElement?.getAttribute("data-team")).toBe(next.number);
        expect(screen.getByRole("tooltip")).toHaveTextContent(next.name);
        expect(document.activeElement?.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
        fireEvent.keyDown(document.activeElement!, { key: "Home" });
        expect(document.activeElement?.getAttribute("data-team")).toBe(result.ranked[0].number);
        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("opens the tooltip on tap and closes it on a tap elsewhere", () => {
        const { container } = renderChart();
        const dot = container.querySelector<SVGGElement>(`[data-team="${result.ranked[0].number}"]`)!;
        fireEvent.click(dot);
        expect(screen.getByRole("tooltip")).toHaveTextContent(`rank 1 of ${result.ranked.length}`);
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("draws a labelled cut line between each pair of neighbouring levels and names unplaced teams", () => {
        const { container } = renderChart();
        const data = tierChartData(result.teams, doc.method.levels);
        const cutLabels = [...container.querySelectorAll(".tier-cut text")].map((node) => node.textContent);
        expect(cutLabels).toEqual(data.cuts.map((cut) => cut.rpi.toFixed(1)));
        for (const team of data.unplotted) expect(screen.getByText(new RegExp(team.name))).toBeInTheDocument();
    });

    it("offers the table view", () => {
        let shown = false;
        renderChart(() => {
            shown = true;
        });
        fireEvent.click(screen.getByRole("button", { name: VIEW_AS_TABLE_LABEL }));
        expect(shown).toBe(true);
    });

    it("dotLabel flags few games and the lane past the last level", () => {
        const last = result.ranked.at(-1)!;
        const team = tierChartData(result.teams, doc.method.levels).lanes.at(-1)!.teams.at(-1)!;
        expect(team.number).toBe(last.number);
        expect(dotLabel(team, 49, false)).toMatch(/Below the last level/);
        if (last.lowConfidence) expect(dotLabel(team, 49, false)).toMatch(/few games$/);
    });
});

describe("RankingsScreen with the tier chart", () => {
    it("shows every team in the chart whatever the filters, and View as table opens the table", async () => {
        const { store } = memoryStore();
        const doc = leagueRankingsDoc();
        await store.saveRankings(doc);
        renderScreen(<RankingsScreen store={store} />, store);
        const group = await screen.findByRole("group", { name: TIER_CHART_TITLE });
        const ranked = ratings(doc).ranked.length;
        fireEvent.change(screen.getByLabelText("Find a team"), { target: { value: "Hilltop" } });
        expect(within(group).getAllByRole("img")).toHaveLength(ranked);
        fireEvent.click(screen.getByRole("button", { name: VIEW_AS_TABLE_LABEL }));
        expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(10);
    });
});
