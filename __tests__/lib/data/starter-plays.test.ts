import { describe, it, expect } from "vitest";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { playDataSchema } from "@/lib/utils/play-data";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { areaRect, countElementsOutside } from "@/lib/utils/ice-area";
import { PLAY_FOCUS, PLAY_GOALIES, type IceArea } from "@/types/practice-planner";

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
    };

    it("gives the obvious set plays an explicit area and leaves full-ice drills unset", () => {
        const actual = Object.fromEntries(STARTER_PLAYS.map((p) => [p.id, p.playData.area?.kind]));
        expect(actual).toEqual(EXPECTED);
    });

    it.each(STARTER_PLAYS.map((p) => [p.name, p] as const))("%s has no element outside its area", (_name, play) => {
        expect(countElementsOutside(play.playData, areaRect(play.playData.area))).toBe(0);
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
});
