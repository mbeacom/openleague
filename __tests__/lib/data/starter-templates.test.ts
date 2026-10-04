import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, starterTemplatePlan } from "@/lib/data/starter-templates";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { parsePlan } from "@/lib/plan-document";
import {
    MAX_STATIONS_PER_GROUP,
    goalieWarnings,
    groupStations,
    sessionWallMinutes,
    stationGroupError,
    stationWarnings,
} from "@/lib/utils/session-timeline";

const NOW = new Date("2026-10-03T18:00:00.000Z");

describe("starter templates", () => {
    it("ships three templates with stable unique ids and names", () => {
        expect(STARTER_TEMPLATES.map((t) => t.id)).toEqual([
            "template-skills-stations",
            "template-goalie-skater-rotation",
            "template-team-stations",
        ]);
        expect(new Set(STARTER_TEMPLATES.map((t) => t.name)).size).toBe(3);
    });

    describe.each(STARTER_TEMPLATES.map((t) => [t.name, t] as const))("%s", (_name, template) => {
        const drills = template.session.drills;

        it("serializes to a valid plan document for either app, stamped at use time", () => {
            for (const generator of ["openleague-static", "openleague-hosted"] as const) {
                const doc = starterTemplatePlan(template, generator, NOW);
                expect(doc.generator).toBe(generator);
                expect(doc.exportedAt).toBe(NOW.toISOString());
                const parsed = parsePlan(JSON.parse(JSON.stringify(doc)));
                expect(parsed.ok ? [] : parsed.error.issues).toEqual([]);
            }
        });

        it("has a coaching description and fits its duration", () => {
            expect(template.description.length).toBeGreaterThan(40);
            expect(sessionWallMinutes(drills)).toBeLessThanOrEqual(template.session.durationMinutes);
            expect(stationGroupError(drills)).toBeNull();
        });

        it("has station blocks of 2–4 drills, each with a goalie station", () => {
            const blocks = groupStations(drills).filter((group) => group.stations.length > 1);
            expect(blocks.length).toBeGreaterThan(0);
            for (const block of blocks) {
                expect(block.stations.length).toBeLessThanOrEqual(MAX_STATIONS_PER_GROUP);
                expect(block.stations.some((station) => station.goalies === "required")).toBe(true);
            }
        });

        it("puts stations on ice that doesn't overlap", () => {
            const withAreas = drills.map((d) => ({ ...d, area: d.playData?.area }));
            expect(stationWarnings(groupStations(withAreas), null).overlaps).toEqual([]);
        });

        it("runs with a single goalie", () => {
            expect(goalieWarnings(groupStations(drills), 1).short).toEqual([]);
        });

        it("gives each drill the time its own description states", () => {
            // Time one group spends on the drill: a station that goalies stay at runs the whole block;
            // otherwise a rotation or switch interval ("every 5 minutes", "at 6 minutes") if one is given.
            for (const drill of drills) {
                const stated = (drill.description ?? "").match(/(\d+)(?:–(\d+))? min\b/);
                if (!stated) continue;
                const [lo, hi] = [Number(stated[1]), Number(stated[2] ?? stated[1])];
                const instructions = drill.instructions ?? "";
                const interval = instructions.startsWith("Goalies stay")
                    ? null
                    : instructions.match(/(?:every|at) (\d+) minutes/);
                const minutes = interval ? Number(interval[1]) : drill.duration;
                expect(minutes, drill.name).toBeGreaterThanOrEqual(lo);
                expect(minutes, drill.name).toBeLessThanOrEqual(hi);
            }
        });

        it("uses starter drills verbatim", () => {
            for (const drill of drills) {
                const starter = STARTER_PLAYS.find((p) => p.name === drill.name);
                expect(starter, drill.name).toBeDefined();
                expect(drill).toMatchObject({
                    description: starter!.description,
                    focus: starter!.focus,
                    goalies: starter!.goalies,
                    playData: starter!.playData,
                });
            }
        });
    });
});
