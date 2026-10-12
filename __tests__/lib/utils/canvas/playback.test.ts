/** Animated drill playback (design R1–R5): the automatic order, actors, pucks, timing and frames. */
import { describe, expect, it } from "vitest";
import {
    PLAY_DATA_VERSION,
    type DrawingElement,
    type EquipmentItem,
    type PlayData,
    type PlayerIcon,
    type Position,
    type StrokeAction,
    type StrokePath,
} from "@/types/practice-planner";
import {
    ATTACH_RADIUS_FT,
    MAX_STROKE_MS,
    MIN_STROKE_MS,
    PLAYBACK_ID_PREFIX,
    STEP_BEAT_MS,
    compilePlayback,
    describeStep,
    getPlayback,
    ghostColor,
    hasPlayback,
    mixHex,
    poseAt,
    posePlayData,
    poseStep,
} from "@/lib/utils/canvas/playback";
import { strokeCenterline } from "@/lib/utils/canvas/stroke-geometry";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";

const P = (x: number, y: number): Position => ({ x, y });

function player(id: string, x: number, y: number, label = id): PlayerIcon {
    return { id, role: "F", label, position: P(x, y), color: "#1976D2" };
}

function stroke(id: string, action: StrokeAction, points: [number, number][], path: StrokePath = "straight"): DrawingElement {
    return {
        id,
        action,
        path,
        end: action === "line" ? "none" : "arrow",
        points: points.map(([x, y]) => P(x, y)),
        color: "#212121",
        strokeWidth: 3,
    };
}

function puckItem(id: string, x: number, y: number, kind: EquipmentItem["kind"] = "puck"): EquipmentItem {
    return { id, kind, position: P(x, y), rotation: 0 };
}

function diagram(parts: Partial<PlayData>): PlayData {
    return { version: PLAY_DATA_VERSION, players: [], drawings: [], equipment: [], annotations: [], ...parts };
}

const at = (pb: ReturnType<typeof compilePlayback>, id: string) => {
    const s = pb.strokes.get(id);
    if (!s) throw new Error(`no stroke ${id}`);
    return s;
};

const round1 = (p: Position) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

/** Distance from a point to the nearest segment of a polyline. */
function distToPolyline(p: Position, line: Position[]): number {
    if (line.length === 1) return Math.hypot(p.x - line[0].x, p.y - line[0].y);
    return Math.min(
        ...line.slice(1).map((b, i) => {
            const a = line[i];
            const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
            const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
            return Math.hypot(p.x - (a.x + u * (b.x - a.x)), p.y - (a.y + u * (b.y - a.y)));
        })
    );
}

describe("actor inference (R4)", () => {
    it("picks the nearest player within the attach radius", () => {
        const pb = compilePlayback(
            diagram({ players: [player("a", 10, 10), player("b", 20, 10)], drawings: [stroke("s", "skate", [[18, 12], [60, 12]])] })
        );
        expect(at(pb, "s").actorId).toBe("b");
    });

    it("breaks a tie toward the earlier player", () => {
        const pb = compilePlayback(
            diagram({ players: [player("a", 10, 10), player("b", 20, 10)], drawings: [stroke("s", "skate", [[15, 10], [15, 60]])] })
        );
        expect(at(pb, "s").actorId).toBe("a");
    });

    it("finds no actor beyond the attach radius, and the stroke still draws itself", () => {
        const pb = compilePlayback(
            diagram({ players: [player("a", 10, 10)], drawings: [stroke("s", "skate", [[10 + ATTACH_RADIUS_FT + 0.5, 10], [60, 10]])] })
        );
        expect(at(pb, "s").actorId).toBeNull();
        expect(pb.durationMs).toBeGreaterThan(0);
    });

    it("keeps a route drawn as several strokes with its skater", () => {
        const pb = compilePlayback(
            diagram({
                players: [player("a", 10, 10)],
                drawings: [stroke("s1", "skate", [[14, 10], [40, 10]]), stroke("s2", "skate", [[41, 11], [41, 50]])],
            })
        );
        expect(at(pb, "s2").actorId).toBe("a");
        expect(at(pb, "s2").startMs).toBe(at(pb, "s1").endMs + STEP_BEAT_MS);
    });

    it("starts the actor's path at its marker, so motion is continuous", () => {
        const data = diagram({ players: [player("a", 10, 10)], drawings: [stroke("s", "skate", [[16, 10], [76, 10]])] });
        const pb = compilePlayback(data);
        const early = poseAt(pb, at(pb, "s").startMs + 1).data.players[0].position;
        expect(early.x).toBeGreaterThanOrEqual(10);
        expect(early.x).toBeLessThan(11);
    });
});

describe("the automatic order (R3)", () => {
    it("runs independent skaters together", () => {
        const pb = compilePlayback(
            diagram({
                players: [player("a", 10, 10), player("b", 10, 40)],
                drawings: [stroke("s1", "skate", [[14, 10], [60, 10]]), stroke("s2", "skate", [[14, 40], [60, 40]])],
            })
        );
        expect(at(pb, "s1").startMs).toBe(0);
        expect(at(pb, "s2").startMs).toBe(0);
        expect(pb.steps).toHaveLength(1);
    });

    it("makes a receiver wait for the pass to arrive", () => {
        const pb = compilePlayback(
            diagram({
                players: [player("passer", 10, 10), player("receiver", 50, 10)],
                drawings: [stroke("pass", "pass", [[14, 10], [45, 10]]), stroke("go", "skate", [[54, 10], [90, 10]])],
            })
        );
        expect(at(pb, "pass").actorId).toBe("passer");
        expect(at(pb, "go").actorId).toBe("receiver");
        expect(at(pb, "go").startMs).toBe(at(pb, "pass").endMs + STEP_BEAT_MS);
    });

    it("only waits for earlier-drawn strokes", () => {
        const pb = compilePlayback(
            diagram({
                players: [player("passer", 10, 10), player("receiver", 50, 10)],
                drawings: [stroke("go", "skate", [[54, 10], [90, 10]]), stroke("pass", "pass", [[14, 10], [45, 10]])],
            })
        );
        expect(at(pb, "go").startMs).toBe(0);
    });

    it("queues one skater's routes one at a time", () => {
        const pb = compilePlayback(
            diagram({
                players: [player("a", 10, 10)],
                drawings: [stroke("s1", "skate", [[14, 10], [60, 10]]), stroke("s2", "skate", [[60, 14], [60, 70]])],
            })
        );
        expect(at(pb, "s2").actorId).toBe("a");
        expect(at(pb, "s2").startMs).toBe(at(pb, "s1").endMs + STEP_BEAT_MS);
    });

    it("starts a pass on the move when the skater reaches the nearest point", () => {
        const data = diagram({
            players: [player("a", 10, 10)],
            drawings: [stroke("route", "skate", [[14, 10], [74, 10]]), stroke("pass", "pass", [[44, 13], [44, 60]])],
        });
        const pb = compilePlayback(data);
        const route = at(pb, "route");
        const pass = at(pb, "pass");
        expect(pass.actorId).toBe("a");
        expect(pass.startMs).toBeGreaterThan(route.startMs);
        expect(pass.startMs).toBeLessThan(route.endMs);
        // The skater is level with the pass's first point when it starts.
        const skater = poseAt(pb, pass.startMs).data.players[0].position;
        expect(skater.x).toBeCloseTo(44, 0);
    });
});

describe("pucks (R4)", () => {
    it("picks up a puck the diagram contains", () => {
        const data = diagram({
            players: [player("a", 10, 10)],
            equipment: [puckItem("pk", 15, 12)],
            drawings: [stroke("pass", "pass", [[14, 10], [60, 10]])],
        });
        const pb = compilePlayback(data);
        expect(at(pb, "pass").puckId).toBe("pk");
        const end = poseAt(pb, pb.durationMs).data.equipment.find((e) => e.id === "pk");
        expect(end?.position).toEqual(P(60, 10));
        expect(poseAt(pb, 0).data.equipment.find((e) => e.id === "pk")?.position).toEqual(P(15, 12));
    });

    it("creates a puck when there is none, and a later pass picks it up", () => {
        const data = diagram({
            players: [player("a", 10, 10), player("b", 60, 10)],
            drawings: [stroke("p1", "pass", [[14, 10], [56, 10]]), stroke("p2", "pass", [[58, 14], [58, 60]])],
        });
        const pb = compilePlayback(data);
        const synthetic = `${PLAYBACK_ID_PREFIX}puck-p1`;
        expect(at(pb, "p1").puckId).toBe(synthetic);
        expect(at(pb, "p2").puckId).toBe(synthetic);
        expect(at(pb, "p2").startMs).toBe(at(pb, "p1").endMs + STEP_BEAT_MS);
        expect(poseAt(pb, 0).data.equipment).toHaveLength(0);
        const mid = poseAt(pb, at(pb, "p1").startMs + 100).data.equipment;
        expect(mid.map((e) => e.id)).toEqual([synthetic]);
        const end = poseAt(pb, pb.durationMs).data.equipment;
        expect(end).toHaveLength(1);
        expect(end[0].position).toEqual(P(58, 60));
    });

    it("moves the skater and the puck together on a carry", () => {
        const data = diagram({ players: [player("a", 10, 10)], drawings: [stroke("c", "carry", [[14, 10], [74, 10]])] });
        const pb = compilePlayback(data);
        const c = at(pb, "c");
        const mid = poseAt(pb, (c.startMs + c.endMs) / 2).data;
        const skater = mid.players[0].position;
        const puck = mid.equipment.find((e) => e.id === c.puckId);
        expect(skater.x).toBeGreaterThan(30);
        expect(puck?.position.x).toBeCloseTo(skater.x + 2, 5);
        expect(puck?.position.y).toBeCloseTo(skater.y, 5);
    });

    it("never moves a puck pile", () => {
        const data = diagram({
            players: [player("a", 10, 10)],
            equipment: [puckItem("pile", 12, 12, "puckPile")],
            drawings: [stroke("pass", "pass", [[14, 10], [60, 10]])],
        });
        const pb = compilePlayback(data);
        expect(at(pb, "pass").puckId).toBe(`${PLAYBACK_ID_PREFIX}puck-pass`);
        for (const t of [0, pb.durationMs / 2, pb.durationMs]) {
            expect(poseAt(pb, t).data.equipment.find((e) => e.id === "pile")?.position).toEqual(P(12, 12));
        }
    });
});

describe("timing (R5)", () => {
    const single = (action: StrokeAction, length: number) =>
        compilePlayback(diagram({ drawings: [stroke("s", action, [[0, 40], [length, 40]])] })).strokes.get("s")!;

    it("follows the speed table", () => {
        expect(single("skate", 60).endMs).toBe(5000);
        expect(single("carry", 60).endMs).toBe(6000);
        expect(single("lateral", 45).endMs).toBe(5000);
        expect(single("backskate", 40).endMs).toBe(5000);
        expect(single("pass", 60).endMs).toBe(2000);
        expect(single("shot", 90).endMs).toBe(2000);
    });

    it("never runs a stroke under 600 ms or over 10 s", () => {
        expect(single("pass", 3).endMs).toBe(MIN_STROKE_MS);
        expect(single("backskate", 190).endMs).toBe(MAX_STROKE_MS);
    });

    it("accepts other speeds", () => {
        const pb = compilePlayback(diagram({ drawings: [stroke("s", "skate", [[0, 40], [60, 40]])] }), { speeds: { skate: 30 } });
        expect(pb.strokes.get("s")!.endMs).toBe(2000);
    });

    it("puts a beat before a stroke that waits, and steps at each distinct start", () => {
        const pb = compilePlayback(
            diagram({
                players: [player("a", 10, 10)],
                drawings: [stroke("s1", "skate", [[14, 10], [50, 10]]), stroke("s2", "skate", [[50, 14], [50, 50]])],
            })
        );
        expect(pb.steps.map((s) => s.startMs)).toEqual([0, at(pb, "s1").endMs + STEP_BEAT_MS]);
        expect(pb.steps[1].strokeIds).toEqual(["s2"]);
        expect(pb.durationMs).toBe(at(pb, "s2").endMs);
    });
});

describe("frames (R2)", () => {
    const data = diagram({
        players: [player("a", 10, 10), player("b", 50, 10)],
        drawings: [
            stroke("zone", "line", [[0, 0], [100, 0]]),
            stroke("pass", "pass", [[14, 10], [45, 10]]),
            stroke("go", "skate", [[54, 10], [90, 30]], "freehand"),
        ],
        annotations: [{ id: "n", text: "Go", position: P(5, 5), fontSize: 8, color: "#000000" }],
    });
    const pb = compilePlayback(data);

    it("ghosts every stroke but lines on the first frame, players where the diagram has them", () => {
        const first = poseAt(pb, 0);
        expect(first.stepIndex).toBe(-1);
        expect(first.activeStrokeIds).toEqual([]);
        expect(first.data.players).toEqual(data.players);
        expect(first.data.drawings[0]).toBe(data.drawings[0]);
        expect(first.data.drawings.slice(1).map((d) => d.color)).toEqual([ghostColor("#212121"), ghostColor("#212121")]);
        expect(first.data.drawings.slice(1).map((d) => d.points)).toEqual(data.drawings.slice(1).map((d) => d.points));
    });

    it("shows every stroke as stored on the last frame", () => {
        const last = poseAt(pb, pb.durationMs);
        expect(last.data.drawings).toEqual(data.drawings);
        expect(last.completedStrokeIds).toEqual(["pass", "go"]);
        expect(last.stepIndex).toBe(pb.steps.length - 1);
        expect(last.data.annotations).toBe(data.annotations);
    });

    it("clamps t", () => {
        expect(poseAt(pb, -500)).toEqual(poseAt(pb, 0));
        expect(poseAt(pb, pb.durationMs + 5000)).toEqual(poseAt(pb, pb.durationMs));
        expect(poseAt(pb, Number.NaN)).toEqual(poseAt(pb, 0));
    });

    it("truncates the active stroke along its centerline", () => {
        const go = at(pb, "go");
        const frame = poseAt(pb, (go.startMs + go.endMs) / 2);
        expect(frame.activeStrokeIds).toEqual(["go"]);
        const active = frame.data.drawings[2];
        expect(active.path).toBe("straight");
        expect(active.end).toBe("arrow");
        const tip = active.points[active.points.length - 1];
        const centerline = strokeCenterline(data.drawings[2]);
        const nearestFt = distToPolyline(tip, centerline);
        expect(nearestFt).toBeLessThan(0.05);
    });

    it("shows a stop end only once the stroke completes", () => {
        const stopData = diagram({ drawings: [{ ...stroke("s", "skate", [[0, 40], [60, 40]]), end: "stop" }] });
        const stopPb = compilePlayback(stopData);
        expect(poseAt(stopPb, 1000).data.drawings[0].end).toBe("none");
        expect(poseAt(stopPb, stopPb.durationMs).data.drawings[0].end).toBe("stop");
    });

    it("is deterministic", () => {
        expect(poseAt(compilePlayback(data), 1234)).toEqual(poseAt(compilePlayback(data), 1234));
    });

    it("poses one-off frames and memoizes per diagram", () => {
        expect(getPlayback(data)).toBe(getPlayback(data));
        expect(posePlayData(data, 1234)).toEqual(poseAt(pb, 1234).data);
    });

    it("never changes the diagram it was given", () => {
        const copy = structuredClone(data);
        poseAt(pb, 1000);
        poseStep(pb, 0);
        expect(data).toEqual(copy);
    });

    it("shows a step's end state with no tweening", () => {
        expect(poseStep(pb, -1)).toEqual(poseAt(pb, 0));
        const afterPass = poseStep(pb, 0);
        expect(afterPass.completedStrokeIds).toEqual(["pass"]);
        expect(afterPass.activeStrokeIds).toEqual([]);
        expect(afterPass.data.players[1].position).toEqual(P(50, 10));
        expect(poseStep(pb, pb.steps.length - 1).data).toEqual(poseAt(pb, pb.durationMs).data);
    });
});

describe("edge cases", () => {
    it("plays nothing for a diagram of lines only", () => {
        const data = diagram({ players: [player("a", 10, 10)], drawings: [stroke("l", "line", [[0, 0], [50, 0]])] });
        expect(hasPlayback(data)).toBe(false);
        const pb = compilePlayback(data);
        expect(pb.durationMs).toBe(0);
        expect(pb.steps).toEqual([]);
        expect(poseAt(pb, 100).data.drawings).toEqual(data.drawings);
    });

    it("plays an empty diagram as an empty frame", () => {
        const pb = compilePlayback(diagram({}));
        expect(pb.durationMs).toBe(0);
        expect(poseAt(pb, 0).stepIndex).toBe(-1);
    });

    it("draws strokes with no players", () => {
        const data = diagram({ drawings: [stroke("s", "skate", [[0, 0], [60, 0]]), stroke("p", "pass", [[0, 40], [60, 40]])] });
        const pb = compilePlayback(data);
        expect(hasPlayback(data)).toBe(true);
        expect(at(pb, "s").actorId).toBeNull();
        expect(at(pb, "p").actorId).toBeNull();
        expect(poseAt(pb, 1000).activeStrokeIds).toEqual(["s", "p"]);
    });

    it("follows freehand and curve paths", () => {
        const pts: [number, number][] = [[14, 10], [30, 30], [50, 10], [70, 30]];
        for (const path of ["freehand", "curve"] as const) {
            const data = diagram({ players: [player("a", 10, 10)], drawings: [stroke("s", "skate", pts, path)] });
            const pb = compilePlayback(data);
            const end = poseAt(pb, pb.durationMs).data.players[0].position;
            expect(round1(end)).toEqual(P(70, 30));
            const centerline = strokeCenterline(data.drawings[0]);
            const mid = poseAt(pb, pb.durationMs / 2).data.players[0].position;
            expect(distToPolyline(mid, centerline)).toBeLessThan(0.3);
        }
    });

    it("handles a stroke of coincident points", () => {
        const data = diagram({ players: [player("a", 10, 10)], drawings: [stroke("s", "skate", [[12, 10], [12, 10]])] });
        const pb = compilePlayback(data);
        expect(at(pb, "s").endMs).toBe(MIN_STROKE_MS);
        expect(() => poseAt(pb, 300)).not.toThrow();
    });
});

describe("colour", () => {
    it("mixes 70% toward the ice", () => {
        expect(mixHex("#000000", "#FFFFFF", 0.7)).toBe("#B3B3B3");
        expect(ghostColor("#F4F9FC")).toBe("#F4F9FC");
        expect(ghostColor("#212121")).toMatch(/^#[0-9A-F]{6}$/);
        expect(mixHex("red", "#FFFFFF", 0.7)).toBe("red");
    });
});

describe("captions", () => {
    it("names each step's skaters and actions", () => {
        const data = diagram({
            players: [player("a", 10, 10, "D1"), { ...player("b", 50, 10, ""), role: "D" }],
            drawings: [stroke("pass", "pass", [[14, 10], [45, 10]]), stroke("go", "carry", [[54, 10], [90, 10]]), stroke("x", "shot", [[150, 80], [189, 42]])],
        });
        const pb = compilePlayback(data);
        expect(describeStep(pb, 0)).toBe("D1: Pass · Shot");
        expect(describeStep(pb, 1)).toBe("Defense: Puck carry");
        expect(describeStep(pb, -1)).toBe("");
        expect(describeStep(pb, 9)).toBe("");
    });
});

describe("starter drills", () => {
    const breakout = STARTER_PLAYS.find((p) => p.id === "starter-breakout-5man")!;

    it("Breakout: the winger waits for D1's pass, then passes on the move", () => {
        const pb = compilePlayback(breakout.playData);
        expect(at(pb, "bo-pass1").actorId).toBe("bo-d1");
        expect(at(pb, "bo-lw-route").actorId).toBe("bo-lw");
        expect(at(pb, "bo-lw-route").startMs).toBe(at(pb, "bo-pass1").endMs + STEP_BEAT_MS);
        const pass2 = at(pb, "bo-pass2");
        const route = at(pb, "bo-lw-route");
        expect(pass2.actorId).toBe("bo-lw");
        expect(pass2.startMs).toBeGreaterThan(route.startMs);
        expect(pass2.startMs).toBeLessThan(route.endMs);
        // Independent skaters leave together.
        expect(at(pb, "bo-c-route").startMs).toBe(0);
        expect(at(pb, "bo-d2-route").actorId).toBe("bo-d2");
    });

    it("compiles every starter drill and ends on the stored diagram", () => {
        for (const play of STARTER_PLAYS) {
            const pb = compilePlayback(play.playData);
            expect(poseAt(pb, pb.durationMs).data.drawings, play.id).toEqual(play.playData.drawings);
            expect(poseAt(pb, 0).data.players, play.id).toEqual(play.playData.players);
            for (const [id, s] of pb.strokes) {
                expect(s.endMs, `${play.id} ${id}`).toBeGreaterThan(s.startMs);
                expect(s.startMs, `${play.id} ${id}`).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it("matches the golden schedules and step poses", () => {
        const golden = Object.fromEntries(
            STARTER_PLAYS.map((play) => {
                const pb = compilePlayback(play.playData);
                const strokes = Object.fromEntries([...pb.strokes].map(([id, s]) => [id, s]));
                const poses = pb.steps.map((step) => {
                    const frame = poseAt(pb, step.startMs);
                    return {
                        atMs: step.startMs,
                        players: Object.fromEntries(frame.data.players.map((p) => [p.id, round1(p.position)])),
                        pucks: Object.fromEntries(
                            frame.data.equipment.filter((e) => e.kind === "puck").map((e) => [e.id, round1(e.position)])
                        ),
                    };
                });
                return [play.id, { durationMs: pb.durationMs, strokes, poses }];
            })
        );
        expect(golden).toMatchSnapshot();
    });
});
