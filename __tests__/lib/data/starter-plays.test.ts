import { describe, it, expect } from "vitest";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { playDataSchema } from "@/lib/utils/play-data";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { areaRect, countElementsOutside } from "@/lib/utils/ice-area";
import { AGE_GROUPS, toAgeGroups } from "@/lib/utils/age-groups";
import { PLAYER_RADIUS_FT } from "@/lib/utils/canvas/glyph-metrics";
import { ICE_AREA_PRESETS, PLAY_FOCUS, PLAY_GOALIES, type IceArea } from "@/types/practice-planner";

/**
 * An annotation's text box in rink feet. drawTextAnnotation renders Arial at
 * `fontSize` feet, left-aligned, with the box spanning [y - fontSize, y]. There
 * is no headless text-measure helper, so the width is estimated at 0.6 em per
 * character, a little wider than Arial's average (~0.5 em), to stay conservative.
 */
const CHAR_WIDTH_EM = 0.6;
const annotationBox = (a: { text: string; fontSize: number; position: { x: number; y: number } }) => ({
    x0: a.position.x,
    x1: a.position.x + a.text.length * a.fontSize * CHAR_WIDTH_EM,
    y0: a.position.y - a.fontSize,
    y1: a.position.y,
});
const NOTE_MARGIN_FT = 2;

const withinRink = ({ x, y }: { x: number; y: number }) =>
    x >= 0 && x <= RINK_DIMENSIONS.width && y >= 0 && y <= RINK_DIMENSIONS.height;

describe("Starter plays pack", () => {
    it("contains at least 8 plays", () => {
        expect(STARTER_PLAYS.length).toBeGreaterThanOrEqual(8);
    });

    it("has unique play ids and names", () => {
        const ids = STARTER_PLAYS.map((p) => p.id);
        const names = STARTER_PLAYS.map((p) => p.name.toLowerCase());
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(names).size).toBe(names.length);
    });

    describe.each(STARTER_PLAYS.map((play) => [play.name, play] as const))(
        "%s",
        (_name, play) => {
            it("has a name and a coaching description", () => {
                expect(play.name.trim().length).toBeGreaterThan(0);
                expect(play.name.length).toBeLessThanOrEqual(100);
                expect(play.description.trim().length).toBeGreaterThan(20);
                expect(play.description.length).toBeLessThanOrEqual(500);
            });

            it("passes the v2 play-data schema", () => {
                const result = playDataSchema.safeParse(play.playData);
                expect(result.success ? [] : result.error.issues).toEqual([]);
            });

            it("has element ids unique within the play", () => {
                const ids = [
                    ...play.playData.players.map((p) => p.id),
                    ...play.playData.drawings.map((d) => d.id),
                    ...play.playData.equipment.map((e) => e.id),
                    ...play.playData.annotations.map((a) => a.id),
                ];
                expect(new Set(ids).size).toBe(ids.length);
            });

            it("keeps every coordinate within the rink bounds", () => {
                for (const player of play.playData.players) {
                    expect(withinRink(player.position)).toBe(true);
                }
                for (const drawing of play.playData.drawings) {
                    for (const point of drawing.points) {
                        expect(withinRink(point)).toBe(true);
                    }
                }
                for (const item of play.playData.equipment) {
                    expect(withinRink(item.position)).toBe(true);
                }
                for (const annotation of play.playData.annotations) {
                    expect(withinRink(annotation.position)).toBe(true);
                }
            });

            it("tags passes and shots semantically (not just by color)", () => {
                for (const d of play.playData.drawings) {
                    if (d.id.includes("pass")) expect(d.action).toBe("pass");
                    if (d.id.includes("shot")) expect(d.action).toBe("shot");
                }
            });

            it("places players on the ice with movement drawn", () => {
                expect(play.playData.players.length).toBeGreaterThanOrEqual(3);
                expect(play.playData.drawings.length).toBeGreaterThanOrEqual(3);
            });

            it("keeps player markers at least 12 ft apart (markers are 6 ft radius)", () => {
                const players = play.playData.players;
                for (let i = 0; i < players.length; i++) {
                    for (let j = i + 1; j < players.length; j++) {
                        const gap = Math.hypot(players[i].position.x - players[j].position.x, players[i].position.y - players[j].position.y);
                        expect(gap, `${players[i].id} – ${players[j].id}`).toBeGreaterThanOrEqual(12);
                    }
                }
            });

            it("opens goal-line nets toward center ice, and every other net toward the middle of the drill's area", () => {
                const rect = areaRect(play.playData.area);
                const middle = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
                for (const item of play.playData.equipment.filter((e) => e.kind === "net")) {
                    if (item.position.x === 11 || item.position.x === 189) {
                        expect(item.rotation, item.id).toBe(item.position.x < 100 ? 180 : 0);
                        continue;
                    }
                    // A small-area net: square to the boards, its mouth facing the play. The glyph's mouth
                    // faces (-cos θ, -sin θ) (drawEquipmentGlyph draws the back at +x, then rotates).
                    expect([0, 90, 180, 270], item.id).toContain(item.rotation);
                    const θ = (item.rotation * Math.PI) / 180;
                    const facing = -Math.cos(θ) * (middle.x - item.position.x) - Math.sin(θ) * (middle.y - item.position.y);
                    expect(facing, item.id).toBeGreaterThan(0);
                }
            });

            it("stands each goalie off the goal line, so the net and crease stay visible", () => {
                for (const g of play.playData.players.filter((p) => p.role === "G")) {
                    const goalLine = g.position.x < 100 ? 11 : 189;
                    expect(Math.abs(g.position.x - goalLine), g.id).toBeGreaterThanOrEqual(PLAYER_RADIUS_FT);
                }
            });

            it("ends every arrow clear of the player markers, so its head shows", () => {
                for (const d of play.playData.drawings.filter((d) => d.end !== "none")) {
                    const tip = d.points[d.points.length - 1];
                    for (const p of play.playData.players) {
                        const gap = Math.hypot(tip.x - p.position.x, tip.y - p.position.y);
                        expect(gap, `${d.id} – ${p.id}`).toBeGreaterThanOrEqual(PLAYER_RADIUS_FT);
                    }
                }
            });

            it("has known tags, and draws a goalie exactly when the tags say one is in net", () => {
                expect(PLAY_FOCUS).toContain(play.focus);
                expect(PLAY_GOALIES).toContain(play.goalies);
                const goalies = play.playData.players.filter((p) => p.role === "G").length;
                if (play.goalies === "required") expect(goalies).toBeGreaterThanOrEqual(1);
                if (play.goalies === "none") expect(goalies).toBe(0);
            });
        }
    );
});

describe("Starter play ice areas", () => {
    const EXPECTED: Record<string, IceArea["kind"] | undefined> = {
        "starter-breakout-5man": "half-left",
        "starter-3man-weave": undefined,
        "starter-pp-umbrella": "zone-right",
        "starter-pk-box": "zone-left",
        "starter-122-forecheck": undefined,
        "starter-low-cycle": "zone-right",
        "starter-point-shot-screen": "zone-right",
        "starter-dzone-coverage": "zone-left",
        "starter-nz-regroup": undefined,
        "starter-goalie-angles-depth": "zone-left",
        "starter-goalie-butterfly-recovery": "custom",
        "starter-goalie-post-to-post": "custom",
        "starter-goalie-rebound-control": "zone-left",
        "starter-goalie-screens": "zone-left",
        "starter-goalie-puck-handling": "half-left",
        "starter-goalie-breakaways": "half-left",
        "starter-goalie-warmup": "zone-left",
        "starter-goalie-crease-pattern": "custom",
        "starter-skate-edges-crossovers": "zone-right",
        "starter-skate-transitions": "zone-neutral",
        "starter-skate-passing-lanes": undefined,
        "starter-skate-wrist-shots": "zone-right",
        "starter-skate-puck-protection": "custom",
        "starter-skate-small-area-2v2": "zone-right",
        "starter-skate-stops-starts": undefined,
        "starter-skate-stickhandling": "zone-neutral",
        "starter-goalie-quarter-station": "zone-left-bottom",
        "starter-skate-edge-circuit": "zone-left-top",
        "starter-skate-obstacle-lane": "zone-neutral-top",
        "starter-skate-quarter-2v2": "zone-right-bottom",
        "starter-skate-give-and-go": "zone-left-top",
        "starter-skate-quick-release": "zone-right-top",
        "starter-skate-keep-away": "zone-neutral-bottom",
        "starter-game-3v3-cross-ice": "zone-neutral",
        "starter-game-4v4-cross-ice": "zone-right",
        "starter-skate-backward-tag": "half-right",
        "starter-skate-paint-the-cones": "zone-right-top",
        "starter-skate-low-1v1-2v1": "zone-left",
        "starter-game-3v3-designated-shooter": "zone-left",
        "starter-skate-trucks-trailers": "zone-right",
        "starter-skate-mirror-puck-control": "zone-neutral",
        "starter-skate-forecheck-breakout": "zone-left",
        "starter-skate-chariot-relay": "zone-neutral",
    };

    it("gives the obvious set plays an explicit area and leaves full-ice drills unset", () => {
        const actual = Object.fromEntries(STARTER_PLAYS.map((p) => [p.id, p.playData.area?.kind]));
        expect(actual).toEqual(EXPECTED);
    });

    it.each(STARTER_PLAYS.map((p) => [p.name, p] as const))("%s has no element outside its area", (_name, play) => {
        expect(countElementsOutside(play.playData, areaRect(play.playData.area))).toBe(0);
    });

    it.each(STARTER_PLAYS.map((p) => [p.name, p] as const))(
        "%s keeps every note's text box inside its area, clear of the edges",
        (_name, play) => {
            const rect = areaRect(play.playData.area);
            for (const a of play.playData.annotations) {
                const box = annotationBox(a);
                expect(box.x0, a.id).toBeGreaterThanOrEqual(rect.x + NOTE_MARGIN_FT);
                expect(box.x1, a.id).toBeLessThanOrEqual(rect.x + rect.w - NOTE_MARGIN_FT);
                expect(box.y0, a.id).toBeGreaterThanOrEqual(rect.y + NOTE_MARGIN_FT);
                expect(box.y1, a.id).toBeLessThanOrEqual(rect.y + rect.h - NOTE_MARGIN_FT);
            }
        }
    );

    it.each(STARTER_PLAYS.map((p) => [p.name, p] as const))("%s keeps notes off the player markers", (_name, play) => {
        for (const a of play.playData.annotations) {
            const box = annotationBox(a);
            for (const p of play.playData.players) {
                const nx = Math.min(Math.max(p.position.x, box.x0), box.x1);
                const ny = Math.min(Math.max(p.position.y, box.y0), box.y1);
                const gap = Math.hypot(p.position.x - nx, p.position.y - ny);
                expect(gap, `${a.id} – ${p.id}`).toBeGreaterThanOrEqual(PLAYER_RADIUS_FT);
            }
        }
    });
});

describe("Starter drill tags", () => {
    const tags = (id: string) => {
        const play = STARTER_PLAYS.find((p) => p.id === id);
        return play ? [play.focus, play.goalies] : null;
    };

    it("tags the original nine as the spec judges them", () => {
        expect(Object.fromEntries([
            "starter-breakout-5man", "starter-3man-weave", "starter-pp-umbrella", "starter-pk-box", "starter-122-forecheck",
            "starter-low-cycle", "starter-point-shot-screen", "starter-dzone-coverage", "starter-nz-regroup",
        ].map((id) => [id, tags(id)]))).toEqual({
            "starter-breakout-5man": ["team", "optional"],
            "starter-3man-weave": ["skaters", "optional"],
            "starter-pp-umbrella": ["team", "optional"],
            "starter-pk-box": ["team", "optional"],
            "starter-122-forecheck": ["team", "none"],
            "starter-low-cycle": ["team", "optional"],
            "starter-point-shot-screen": ["team", "required"],
            "starter-dzone-coverage": ["team", "optional"],
            "starter-nz-regroup": ["team", "none"],
        });
    });

    it("ships ten goalie drills, every one needing a goalie", () => {
        const goalieDrills = STARTER_PLAYS.filter((p) => p.focus === "goalies");
        expect(goalieDrills.map((p) => p.id).sort()).toEqual([
            "starter-goalie-angles-depth",
            "starter-goalie-breakaways",
            "starter-goalie-butterfly-recovery",
            "starter-goalie-crease-pattern",
            "starter-goalie-post-to-post",
            "starter-goalie-puck-handling",
            "starter-goalie-quarter-station",
            "starter-goalie-rebound-control",
            "starter-goalie-screens",
            "starter-goalie-warmup",
        ]);
        expect(goalieDrills.every((p) => p.goalies === "required")).toBe(true);
    });

    it("never passes or shoots a goalie-drill puck through its own net mouth", () => {
        // Goal lines x=11/189; the posts sit 3 ft either side of y=42.5.
        const crossesMouth = (a: { x: number; y: number }, b: { x: number; y: number }, line: number) => {
            if ((a.x - line) * (b.x - line) >= 0) return false;
            const y = a.y + ((line - a.x) / (b.x - a.x)) * (b.y - a.y);
            return y >= 39.5 && y <= 45.5;
        };
        for (const play of STARTER_PLAYS.filter((p) => p.focus === "goalies")) {
            for (const d of play.playData.drawings.filter((d) => d.action === "pass" || d.action === "shot")) {
                for (let i = 1; i < d.points.length; i++) {
                    for (const line of [11, 189]) {
                        expect(crossesMouth(d.points[i - 1], d.points[i], line), `${play.id} ${d.id}`).toBe(false);
                    }
                }
            }
        }
    });

    it("ships twenty-one skater drills, three small-area games and 43 starters in all", () => {
        expect(STARTER_PLAYS.filter((p) => p.id.startsWith("starter-skate-")).map((p) => p.focus)).toEqual(Array(21).fill("skaters"));
        expect(STARTER_PLAYS.filter((p) => p.id.startsWith("starter-game-")).map((p) => p.focus)).toEqual(["team", "team", "team"]);
        expect(STARTER_PLAYS).toHaveLength(43);
    });

    it("puts every small-area drill on a quarter-ice or zone preset", () => {
        const small = ["starter-goalie-quarter-station", "starter-skate-edge-circuit", "starter-skate-obstacle-lane", "starter-skate-quarter-2v2",
            "starter-skate-give-and-go", "starter-skate-quick-release", "starter-skate-keep-away", "starter-game-3v3-cross-ice", "starter-game-4v4-cross-ice"];
        for (const id of small) {
            const kind = STARTER_PLAYS.find((p) => p.id === id)?.playData.area?.kind;
            expect(kind && ICE_AREA_PRESETS.includes(kind as (typeof ICE_AREA_PRESETS)[number]) && /^zone-/.test(kind), id).toBe(true);
        }
    });

});

describe("8U partner puck control and forecheck drills", () => {
    const find = (id: string) => {
        const play = STARTER_PLAYS.find((p) => p.id === id);
        if (!play) throw new Error(`${id} is missing`);
        return play;
    };
    const kinds = (id: string, kind: string) => find(id).playData.equipment.filter((item) => item.kind === kind);

    it("adds the four drills with their tags", () => {
        expect(Object.fromEntries([
            "starter-skate-trucks-trailers",
            "starter-skate-mirror-puck-control",
            "starter-skate-forecheck-breakout",
            "starter-skate-chariot-relay",
        ].map((id) => [id, [find(id).name, find(id).focus, find(id).goalies]]))).toEqual({
            "starter-skate-trucks-trailers": ["Trucks and Trailers", "skaters", "none"],
            "starter-skate-mirror-puck-control": ["Mirror Puck Control", "skaters", "none"],
            "starter-skate-forecheck-breakout": ["Forecheck vs. Breakout", "skaters", "required"],
            "starter-skate-chariot-relay": ["Chariot Race Relay", "skaters", "none"],
        });
    });

    it("draws trucks and trailers as partner pairs, each carrying a puck", () => {
        const play = find("starter-skate-trucks-trailers");
        expect(play.playData.players).toHaveLength(6);
        expect(play.playData.drawings.every((d) => d.action === "carry")).toBe(true);
    });

    it("puts the mirror pairs on either side of the center red line, each with a figure eight on its own side", () => {
        const play = find("starter-skate-mirror-puck-control");
        const left = play.playData.players.filter((p) => p.position.x < 100);
        const right = play.playData.players.filter((p) => p.position.x > 100);
        expect([left.length, right.length]).toEqual([2, 2]);
        for (const d of play.playData.drawings) {
            const xs = d.points.map((point) => point.x);
            expect(xs.every((x) => x < 100) || xs.every((x) => x > 100), d.id).toBe(true);
        }
    });

    it("runs forecheck vs. breakout on one net with a two-cone exit gate", () => {
        const play = find("starter-skate-forecheck-breakout");
        expect(kinds(play.id, "net").map((n) => [n.position.x, n.position.y])).toEqual([[11, 42.5]]);
        expect(kinds(play.id, "cone")).toHaveLength(2);
        expect(play.playData.players.filter((p) => p.role === "G")).toHaveLength(1);
    });

    it("runs the chariot relay in two lanes around the practice's two cones", () => {
        expect(kinds("starter-skate-chariot-relay", "cone")).toHaveLength(2);
    });
});

describe("Starter age groups (age-group templates R2)", () => {
    const AGES: Record<string, string[]> = {
        "starter-breakout-5man": ["u10", "u12", "u14", "u16plus"],
        "starter-3man-weave": ["u10", "u12", "u14", "u16plus"],
        "starter-pp-umbrella": ["u12", "u14", "u16plus"],
        "starter-pk-box": ["u12", "u14", "u16plus"],
        "starter-122-forecheck": ["u12", "u14", "u16plus"],
        "starter-low-cycle": ["u12", "u14", "u16plus"],
        "starter-point-shot-screen": ["u12", "u14", "u16plus"],
        "starter-dzone-coverage": ["u12", "u14", "u16plus"],
        "starter-nz-regroup": ["u12", "u14", "u16plus"],
        "starter-goalie-angles-depth": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-butterfly-recovery": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-post-to-post": ["u12", "u14", "u16plus"],
        "starter-goalie-rebound-control": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-screens": ["u12", "u14", "u16plus"],
        "starter-goalie-puck-handling": ["u12", "u14", "u16plus"],
        "starter-goalie-breakaways": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-warmup": [],
        "starter-goalie-crease-pattern": ["u10", "u12", "u14", "u16plus"],
        "starter-skate-edges-crossovers": [],
        "starter-skate-transitions": [],
        "starter-skate-passing-lanes": ["u10", "u12", "u14", "u16plus"],
        "starter-skate-wrist-shots": [],
        "starter-skate-puck-protection": [],
        "starter-skate-small-area-2v2": [],
        "starter-skate-stops-starts": [],
        "starter-skate-stickhandling": [],
        "starter-goalie-quarter-station": ["u6", "u8", "u10", "u12"],
        "starter-skate-edge-circuit": ["u6", "u8", "u10"],
        "starter-skate-obstacle-lane": ["u6", "u8", "u10"],
        "starter-skate-quarter-2v2": [],
        "starter-skate-give-and-go": ["u10", "u12", "u14"],
        "starter-skate-quick-release": ["u10", "u12", "u14", "u16plus"],
        "starter-skate-keep-away": ["u6", "u8", "u10"],
        "starter-game-3v3-cross-ice": [],
        "starter-game-4v4-cross-ice": ["u10", "u12", "u14", "u16plus"],
        "starter-skate-backward-tag": ["u6", "u8", "u10"],
        "starter-skate-paint-the-cones": ["u6", "u8", "u10"],
        "starter-skate-low-1v1-2v1": ["u8", "u10", "u12"],
        "starter-game-3v3-designated-shooter": ["u8", "u10", "u12"],
        "starter-skate-trucks-trailers": ["u6", "u8", "u10"],
        "starter-skate-mirror-puck-control": ["u6", "u8", "u10"],
        "starter-skate-forecheck-breakout": ["u8", "u10", "u12"],
        "starter-skate-chariot-relay": ["u6", "u8", "u10"],
    };

    it("tags every starter, leaving drills that suit every age untagged", () => {
        expect(Object.fromEntries(STARTER_PLAYS.map((p) => [p.id, [...p.ageGroups]]))).toEqual(AGES);
    });

    it("uses known groups, once each, in age order", () => {
        for (const play of STARTER_PLAYS) {
            expect(play.ageGroups.every((group) => (AGE_GROUPS as readonly string[]).includes(group)), play.id).toBe(true);
            expect(toAgeGroups(play.ageGroups), play.id).toEqual([...play.ageGroups]);
        }
    });

    it("has a drill for every age group", () => {
        for (const group of AGE_GROUPS) {
            expect(STARTER_PLAYS.some((p) => p.ageGroups.includes(group)), group).toBe(true);
        }
    });
});
