import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, starterTemplatePlan } from "@/lib/data/starter-templates";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { parsePlan } from "@/lib/plan-document";
import { areaRect } from "@/lib/utils/ice-area";
import { toAgeGroups } from "@/lib/utils/age-groups";
import { goalieMarkerCount } from "@/lib/utils/drill-tags";
import { drillRows, isDrillRow } from "@/lib/utils/session-rows";
import {
    MAX_STATIONS_PER_GROUP,
    MIN_ROTATING_STATIONS,
    goalieWarnings,
    groupStations,
    rotatingStations,
    sessionRowsError,
    sessionWallMinutes,
    stationWarnings,
} from "@/lib/utils/session-timeline";

const NOW = new Date("2026-10-03T18:00:00.000Z");
const GOALIE_WARMUP = STARTER_PLAYS.find((play) => play.id === "starter-goalie-warmup")?.name;

describe("starter templates", () => {
    it("ships seven templates with stable unique ids and names, the age-group templates last", () => {
        expect(STARTER_TEMPLATES.map((t) => t.id)).toEqual([
            "template-skills-stations",
            "template-goalie-skater-rotation",
            "template-team-stations",
            "template-8u-stations",
            "template-10u-stations",
            "template-12u-skills-games",
            "template-8u-tag-stops-battles",
        ]);
        expect(new Set(STARTER_TEMPLATES.map((t) => t.name)).size).toBe(7);
    });

    it("tags every template with its own age groups (never derived from its drills)", () => {
        expect(Object.fromEntries(STARTER_TEMPLATES.map((t) => [t.id, [...t.ageGroups]]))).toEqual({
            "template-skills-stations": ["u10", "u12", "u14", "u16plus"],
            "template-goalie-skater-rotation": ["u10", "u12", "u14", "u16plus"],
            "template-team-stations": ["u12", "u14", "u16plus"],
            "template-8u-stations": ["u6", "u8"],
            "template-10u-stations": ["u10"],
            "template-12u-skills-games": ["u12", "u14"],
            "template-8u-tag-stops-battles": ["u8"],
        });
        for (const template of STARTER_TEMPLATES) expect(toAgeGroups(template.ageGroups)).toEqual([...template.ageGroups]);
    });

    it.each(["template-8u-stations", "template-10u-stations", "template-12u-skills-games"])("%s fills 60 minutes exactly", (id) => {
        const template = STARTER_TEMPLATES.find((t) => t.id === id);
        if (!template) throw new Error(`${id} is missing`);
        expect(template.session.durationMinutes).toBe(60);
        expect(sessionWallMinutes(template.session.drills, template.session.transitionMinutes)).toBe(60);
    });

    it("puts the station blocks on quarters and zones as the spec lays them out", () => {
        const stationAreas = (id: string) => {
            const template = STARTER_TEMPLATES.find((t) => t.id === id);
            const block = groupStations(template?.session.drills ?? []).find((group) => group.stations.length > 1);
            return drillRows(block?.stations ?? []).map((row) => row.playData?.area?.kind);
        };
        expect(stationAreas("template-8u-stations")).toEqual(["zone-left-bottom", "zone-left-top", "zone-neutral-top", "zone-right-bottom"]);
        expect(stationAreas("template-10u-stations")).toEqual(["zone-left-bottom", "zone-left-top", "zone-right-top", "zone-neutral"]);
        expect(stationAreas("template-12u-skills-games")).toEqual(["zone-left", "zone-neutral", "zone-right"]);
        expect(stationAreas("template-8u-tag-stops-battles")).toEqual(["zone-left", "half-right"]);
        // Each quarter is half a zone's height.
        expect(areaRect({ kind: "zone-left-top" }).h).toBe(42.5);
    });

    it("8U Tag, Stops and Battles fills its 50 minutes exactly on one net", () => {
        const template = STARTER_TEMPLATES.find((t) => t.id === "template-8u-tag-stops-battles");
        if (!template) throw new Error("8U Tag, Stops and Battles is missing");
        expect(template.session.durationMinutes).toBe(50);
        expect(sessionWallMinutes(template.session.drills, template.session.transitionMinutes)).toBe(50);
        const nets = new Set(drillRows(template.session.drills).flatMap((row) =>
            (row.playData?.equipment ?? []).filter((item) => item.kind === "net").map((item) => `${item.position.x},${item.position.y}`)));
        expect([...nets]).toEqual(["11,42.5"]);
    });

    it("Skills Stations fills its 60 minutes exactly (spec R12)", () => {
        const skills = STARTER_TEMPLATES.find((t) => t.id === "template-skills-stations");
        if (!skills) throw new Error("Skills Stations is missing");
        expect(sessionWallMinutes(skills.session.drills, skills.session.transitionMinutes)).toBe(60);
        expect(skills.session.durationMinutes).toBe(60);
    });

    describe.each(STARTER_TEMPLATES.map((t) => [t.name, t] as const))("%s", (_name, template) => {
        const rows = template.session.drills;
        const gap = template.session.transitionMinutes ?? 0;
        const groups = groupStations(rows, gap);

        it("serializes to a valid plan document for either app, stamped at use time, that round-trips unchanged", () => {
            for (const generator of ["openleague-static", "openleague-hosted"] as const) {
                const doc = starterTemplatePlan(template, generator, NOW);
                expect(doc.generator).toBe(generator);
                expect(doc.exportedAt).toBe(NOW.toISOString());
                const parsed = parsePlan(JSON.parse(JSON.stringify(doc)));
                expect(parsed.ok ? [] : parsed.error.issues).toEqual([]);
                expect(parsed.ok && parsed.plan).toEqual(doc);
            }
        });

        it("has a coaching description, fits its duration with blocks, rotation and gaps, and breaks no row rule", () => {
            expect(template.description.length).toBeGreaterThan(40);
            expect(sessionWallMinutes(rows, gap)).toBeLessThanOrEqual(template.session.durationMinutes);
            expect(sessionRowsError(rows)).toBeNull();
        });

        it("warms the goalie up in its first block and closes with a cool-down", () => {
            // The first block is a warm-up block, or holds the Goalie Warm-Up drill, or its
            // lone drill's instructions warm the goalie up before anyone shoots for real.
            const first = groups[0].stations;
            const head = first[0];
            const warmsGoalie =
                head.kind === "warmup" ||
                drillRows(first).some((drill) => drill.name === GOALIE_WARMUP) ||
                (first.length === 1 && isDrillRow(head) && /warm the goalie up/i.test(head.instructions ?? ""));
            expect(warmsGoalie).toBe(true);
            expect(rows[rows.length - 1].kind).toBe("cooldown");
        });

        it("says who shoots at every goalie station that stays", () => {
            for (const drill of drillRows(rows).filter((row) => row.stays)) {
                expect((drill.instructions ?? "").trim(), drill.name).not.toBe("");
            }
        });

        it("describes the same rotation and gap the data runs", () => {
            for (const group of groups.filter((g) => g.rotation)) {
                expect(template.description).toContain(`every ${group.rotation?.minutes} minutes`);
            }
            if (gap > 0) expect(template.description).toMatch(/between blocks/);
            else expect(template.description).not.toMatch(/between blocks/);
        });

        it("has station blocks of 2–4 drills, each with a goalie station", () => {
            const blocks = groups.filter((group) => group.stations.length > 1);
            expect(blocks.length).toBeGreaterThan(0);
            for (const block of blocks) {
                expect(block.stations.length).toBeLessThanOrEqual(MAX_STATIONS_PER_GROUP);
                expect(drillRows(block.stations).some((station) => station.goalies === "required")).toBe(true);
            }
        });

        it("rotates with real rotation, never with instruction text", () => {
            const rotating = groups.filter((group) => group.rotation);
            expect(rotating.length).toBeGreaterThan(0);
            for (const group of rotating) expect(rotatingStations(group.stations).length).toBeGreaterThanOrEqual(MIN_ROTATING_STATIONS);
            for (const drill of drillRows(rows)) expect(drill.instructions ?? "", drill.name).not.toMatch(/rotate every|switch with .* at \d+ minutes/i);
        });

        it("puts stations on ice that doesn't overlap", () => {
            const withAreas = rows.map((row) => ({ ...row, area: isDrillRow(row) ? row.playData?.area : null }));
            expect(stationWarnings(groupStations(withAreas), null).overlaps).toEqual([]);
        });

        it("is built for one goalie and says so, so warnings work right after import", () => {
            expect(template.session.goaliesAttending).toBe(1);
            expect(goalieWarnings(groupStations(rows), template.session.goaliesAttending ?? null).short).toEqual([]);
        });

        it("never sends skaters to an empty net that the diagram shows a goalie in, without the second-goalie option", () => {
            for (const drill of drillRows(rows)) {
                if (!drill.playData || goalieMarkerCount(drill.playData) === 0) continue;
                const instructions = drill.instructions ?? "";
                if (instructions.includes("empty net")) expect(instructions, drill.name).toMatch(/second goalie/);
            }
        });

        it("gives each drill the time its own description states", () => {
            // One group's time on a drill: a stays station runs the whole block; a rotating
            // station runs the rotation's minutes; any other drill runs its own minutes.
            for (const group of groups) {
                for (const drill of drillRows(group.stations)) {
                    const stated = (drill.description ?? "").match(/(\d+)(?:–(\d+))? min\b/);
                    if (!stated) continue;
                    const [lo, hi] = [Number(stated[1]), Number(stated[2] ?? stated[1])];
                    const minutes = group.rotation ? (drill.stays ? group.wallMinutes : group.rotation.minutes) : drill.duration;
                    expect(minutes, drill.name).toBeGreaterThanOrEqual(lo);
                    expect(minutes, drill.name).toBeLessThanOrEqual(hi);
                }
            }
        });

        it("writes each rotating block's minutes as the editor would (M per rotating station, the block for a stays station)", () => {
            for (const group of groups.filter((g) => g.rotation)) {
                for (const drill of drillRows(group.stations)) {
                    expect(drill.duration, drill.name).toBe(drill.stays ? group.wallMinutes : group.rotation?.minutes);
                }
            }
        });

        it("uses starter drills verbatim", () => {
            for (const drill of drillRows(rows)) {
                const starter = STARTER_PLAYS.find((p) => p.name === drill.name);
                expect(starter, drill.name).toBeDefined();
                expect(drill).toMatchObject({
                    description: starter!.description,
                    focus: starter!.focus,
                    goalies: starter!.goalies,
                    ageGroups: [...starter!.ageGroups],
                    playData: starter!.playData,
                });
            }
        });
    });
});
