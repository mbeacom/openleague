import { describe, it, expect } from "vitest";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { playDataSchema } from "@/lib/utils/play-data";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { areaRect, countElementsOutside } from "@/lib/utils/ice-area";
import { PLAYER_RADIUS_FT } from "@/lib/utils/canvas/glyph-metrics";
import { PLAY_FOCUS, PLAY_GOALIES, type IceArea } from "@/types/practice-planner";

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

            it("opens every net toward center ice", () => {
                for (const item of play.playData.equipment.filter((e) => e.kind === "net")) {
                    expect(item.rotation, item.id).toBe(item.position.x < 100 ? 180 : 0);
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

    it("ships nine goalie drills, every one needing a goalie", () => {
        const goalieDrills = STARTER_PLAYS.filter((p) => p.focus === "goalies");
        expect(goalieDrills.map((p) => p.id).sort()).toEqual([
            "starter-goalie-angles-depth",
            "starter-goalie-breakaways",
            "starter-goalie-butterfly-recovery",
            "starter-goalie-crease-pattern",
            "starter-goalie-post-to-post",
            "starter-goalie-puck-handling",
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

    it("ships eight skater fundamentals and 26 starters in all", () => {
        expect(STARTER_PLAYS.filter((p) => p.id.startsWith("starter-skate-")).map((p) => p.focus)).toEqual(Array(8).fill("skaters"));
        expect(STARTER_PLAYS).toHaveLength(26);
    });
});
