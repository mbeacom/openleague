/**
 * Curated starter plays for the Hockey Practice Planner
 *
 * A static pack of common drills and set plays that coaches can copy into
 * their team's play library as editable templates.
 *
 * Coordinate system (matches lib/utils/canvas/rink-renderer.ts):
 * - Rink coordinates are in feet: x 0-200 (left to right), y 0-85 (top to bottom)
 * - Left goal line x=11, right goal line x=189; blue lines x=75 and x=125
 * - Center ice (100, 42.5); end-zone faceoff dots at x=31/169, y=20.5/64.5
 *
 * Diagram conventions used across the pack:
 * - Meaning is carried by `action` (skate, backskate, carry, lateral, pass,
 *   shot, line) and `role` (F/D forwards and defense, O opponents, G goalie,
 *   C coach), never by color alone; colors are just the theme defaults
 * - Player markers are 6 ft radius, so centers are kept >= 12 ft apart
 * - A left-end net is rotated 180° so it opens toward center ice
 * - Drills confined to part of the ice carry an explicit ice area (practice
 *   planner 2a); drills that span the ice leave it unset (full ice)
 * - Every drill is tagged (focus, goalies); a "required" drill draws its
 *   goalie(s), a "none" drill draws none (goaltender-aware drills)
 * - Every drill carries age groups (age-group templates); [] means it suits
 *   every age
 * - Small-area nets sit off the goal lines, square to the boards, with their
 *   mouth facing the middle of the drill's area
 */

import {
    PLAY_DATA_VERSION,
    type DrawingElement,
    type EquipmentItem,
    type EquipmentKind,
    type PlayData,
    type PlayFocus,
    type PlayGoalies,
    type PlayerIcon,
    type PlayerRole,
    type Position,
    type StrokeAction,
    type TextAnnotation,
} from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
import { DEFAULT_END_FOR_ACTION, ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

export interface StarterPlay {
    /** Stable slug: React keys, thumbnail caching, and the static planner's seeded-id set */
    id: string;
    name: string;
    /** Coaching description, at most 500 characters (PlayEditor's limit) */
    description: string;
    focus: PlayFocus;
    goalies: PlayGoalies;
    /** [] = every age (age-group templates R2) */
    ageGroups: readonly AgeGroup[];
    playData: PlayData;
}

const SKATE_COLOR = "#212121";
const PASS_COLOR = "#1976D2";
const SHOT_COLOR = "#D32F2F";
const OPPONENT_ROUTE_COLOR = "#D32F2F";
const ZONE_COLOR = "#0D47A1";

type Point = [x: number, y: number];

const toPositions = (points: Point[]): Position[] =>
    points.map(([x, y]) => ({ x, y }));

type Side = "us" | "them" | "goalie" | "coach";

function player(id: string, label: string, x: number, y: number, side: Side = "us"): PlayerIcon {
    // A label "C" on side "us" means center (a forward); a coach is side "coach".
    const role: PlayerRole =
        side === "them" ? "O" : side === "goalie" ? "G" : side === "coach" ? "C" : label.startsWith("D") ? "D" : "F";
    return { id, role, label, position: { x, y }, color: ROLE_DEFAULT_COLORS[role] };
}

const goalie = (id: string, x: number, y: number) => player(id, "G", x, y, "goalie");
const coach = (id: string, x: number, y: number) => player(id, "C", x, y, "coach");

function stroke(action: StrokeAction, id: string, color: string, strokeWidth: number, points: Point[]): DrawingElement {
    return { id, action, path: "straight", end: DEFAULT_END_FOR_ACTION[action], points: toPositions(points), color, strokeWidth };
}

const skate = (id: string, ...points: Point[]) => stroke("skate", id, SKATE_COLOR, 3, points);
/** A skate that ends in a hockey stop (end "stop"). */
const skateStop = (id: string, ...points: Point[]): DrawingElement => ({ ...stroke("skate", id, SKATE_COLOR, 3, points), end: "stop" });
const backskate = (id: string, ...points: Point[]) => stroke("backskate", id, SKATE_COLOR, 3, points);
/** Shuffles, T-pushes and crossovers. */
const lateral = (id: string, ...points: Point[]) => stroke("lateral", id, SKATE_COLOR, 3, points);
const carry = (id: string, ...points: Point[]) => stroke("carry", id, SKATE_COLOR, 3, points);
const pass = (id: string, ...points: Point[]) => stroke("pass", id, PASS_COLOR, 2, points);
const shot = (id: string, ...points: Point[]) => stroke("shot", id, SHOT_COLOR, 2, points);
const opponentRoute = (id: string, ...points: Point[]) => stroke("skate", id, OPPONENT_ROUTE_COLOR, 2, points);
const zoneLine = (id: string, ...points: Point[]) => stroke("line", id, ZONE_COLOR, 2, points);

function gear(kind: EquipmentKind, id: string, x: number, y: number, rotation = 0): EquipmentItem {
    return { id, kind, position: { x, y }, rotation };
}
/** The left-end net, opening toward center ice. */
const leftNet = (id: string) => gear("net", id, 11, 42.5, 180);
const rightNet = (id: string) => gear("net", id, 189, 42.5);
/** A net on a goal line at height `y`, opening toward center ice. */
const goalLineNet = (id: string, x: 11 | 189, y: number) => gear("net", id, x, y, x === 11 ? 180 : 0);
/** A small-area net off the goal lines: rotation 90 opens toward the top boards, 270 toward the bottom, 180 toward the right end. */
const smallNet = (id: string, x: number, y: number, rotation: 90 | 180 | 270) => gear("net", id, x, y, rotation);
const cone = (id: string, x: number, y: number) => gear("cone", id, x, y);
const pylon = (id: string, x: number, y: number) => gear("pylon", id, x, y);
const pucks = (id: string, x: number, y: number) => gear("puckPile", id, x, y);

function note(id: string, text: string, x: number, y: number, color: string = "#000000", fontSize = 8): TextAnnotation {
    return { id, text, position: { x, y }, fontSize, color };
}

export const STARTER_PLAYS: readonly StarterPlay[] = [
    {
        id: "starter-breakout-5man",
        name: "Breakout (5-Man)",
        description:
            "Standard controlled breakout out of the defensive zone. D1 retrieves behind the net and hits the strong-side winger on the wall; the winger chips to the center swinging through the middle with speed while the weak-side winger stretches the far wall.",
        focus: "team",
        goalies: "optional",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("bo-d1", "D1", 16, 56),
                player("bo-d2", "D2", 27, 30),
                player("bo-lw", "LW", 40, 12),
                player("bo-rw", "RW", 40, 74),
                player("bo-c", "C", 48, 42.5),
            ],
            drawings: [
                pass("bo-pass1", [20, 51], [35.5, 16.8]),
                skate("bo-lw-route", [46, 11], [72, 9]),
                pass("bo-pass2", [58, 14], [66, 34]),
                skate("bo-c-route", [52, 40], [64, 36], [95, 38]),
                skate("bo-rw-route", [46, 73], [85, 71]),
                skate("bo-d2-route", [32, 32], [55, 34]),
            ],
            equipment: [],
            annotations: [],
            area: { kind: "half-left" },
        },
    },
    {
        id: "starter-3man-weave",
        name: "3-Man Weave",
        description:
            "Full-ice passing and timing drill in three lanes. Pass and follow behind the next two skaters, filling the lane the puck came from. Emphasize crisp tape-to-tape passes, skating full speed through the crossovers, and finishing with a shot in stride.",
        focus: "skaters",
        goalies: "optional",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("wv-f1", "F1", 16, 15),
                player("wv-f2", "F2", 16, 42.5),
                player("wv-f3", "F3", 16, 70),
            ],
            drawings: [
                skate("wv-f1-route", [24, 15], [70, 42.5], [120, 70], [170, 15]),
                skate("wv-f2-route", [24, 42.5], [70, 70], [120, 15], [170, 42.5]),
                skate("wv-f3-route", [24, 70], [70, 15], [120, 42.5], [170, 70]),
                pass("wv-pass1", [32, 36], [50, 28]),
                pass("wv-pass2", [88, 58], [106, 40]),
            ],
            equipment: [
                { id: "wv-pucks", kind: "puckPile", position: { x: 8, y: 42.5 }, rotation: 0 },
                { id: "wv-net", kind: "net", position: { x: 189, y: 42.5 }, rotation: 0 },
            ],
            annotations: [],
        },
    },
    {
        id: "starter-pp-umbrella",
        name: "Power-Play Umbrella",
        description:
            "1-3-1 umbrella setup on the power play. The point quarterback distributes to the flank shooters at the top of the circles for one-timers while the bumper occupies the middle of the box and the net-front player screens the goalie and hunts tips and rebounds.",
        focus: "team",
        goalies: "optional",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("pp-pt", "PT", 132, 42.5),
                player("pp-f1", "F1", 150, 13),
                player("pp-f2", "F2", 150, 72),
                player("pp-bp", "BP", 160, 41),
                player("pp-nf", "NF", 186, 44),
            ],
            drawings: [
                pass("pp-pass1", [136, 36], [148, 20]),
                pass("pp-pass2", [136, 49], [148, 66]),
                shot("pp-shot", [155, 17], [183, 38]),
            ],
            equipment: [],
            annotations: [note("pp-note", "Screen", 168, 58)],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-pk-box",
        name: "Penalty-Kill Box",
        description:
            "Basic box penalty kill in the defensive zone. All four killers keep sticks in passing lanes and shift as a unit toward the puck side, denying seam passes through the middle. Pressure only when the puck carrier bobbles or turns their back.",
        focus: "team",
        goalies: "optional",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("pk-d1", "D1", 24, 29),
                player("pk-d2", "D2", 24, 56),
                player("pk-f1", "F1", 50, 29),
                player("pk-f2", "F2", 50, 56),
                player("pk-o1", "O1", 34, 8, "them"),
                player("pk-o2", "O2", 70, 42.5, "them"),
            ],
            drawings: [
                skate("pk-shift1", [24, 25], [28, 16]),
                skate("pk-shift2", [48, 25], [42, 17]),
                skate("pk-shift3", [24, 52], [26, 42]),
                skate("pk-shift4", [50, 52], [48, 42]),
            ],
            equipment: [],
            annotations: [note("pk-note", "Shift", 36, 70)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-122-forecheck",
        name: "1-2-2 Forecheck",
        description:
            "Conservative forecheck that traps the breakout. F1 angles the puck carrier to one wall and takes away the D-to-D pass; F2 and F3 seal the boards on each side while both defensemen hold the middle of the neutral zone to swallow chips and stretch passes.",
        focus: "team",
        goalies: "none",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("fc-f1", "F1", 152, 42.5),
                player("fc-f2", "F2", 128, 18),
                player("fc-f3", "F3", 128, 67),
                player("fc-d1", "D1", 92, 28),
                player("fc-d2", "D2", 92, 58),
                player("fc-o1", "O1", 180, 62, "them"),
            ],
            drawings: [
                skate("fc-f1-route", [158, 46], [172, 58]),
                skate("fc-f2-route", [132, 15], [150, 10]),
                skate("fc-f3-route", [132, 70], [150, 75]),
                opponentRoute("fc-o1-route", [176, 68], [158, 76]),
            ],
            equipment: [],
            annotations: [note("fc-note", "Angle", 162, 52)],
        },
    },
    {
        id: "starter-low-cycle",
        name: "Low Cycle",
        description:
            "Offensive-zone puck protection below the goal line. The puck carrier drives up the half-wall and chips the puck back along the boards to the rotating teammate; the three forwards keep rotating corner, half-wall, and slot until a lane opens to attack the net.",
        focus: "team",
        goalies: "optional",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("cy-f1", "F1", 176, 68),
                player("cy-f2", "F2", 150, 73),
                player("cy-f3", "F3", 163, 44),
                player("cy-d1", "D1", 130, 58),
            ],
            drawings: [
                pass("cy-chip", [168, 78], [182, 70.8]),
                skate("cy-f1-route", [176, 62], [170, 48]),
                skate("cy-f2-route", [156, 74], [170.5, 71.5]),
                skate("cy-f3-route", [158, 48], [146, 64]),
            ],
            equipment: [],
            annotations: [],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-point-shot-screen",
        name: "Point Shot with Screen",
        description:
            "Simple offensive-zone set to generate traffic goals. The corner forward wins the puck and moves it to the point; the net-front forward establishes a screen in front of the goalie while the high slot forward crashes for tips and rebounds off the point shot.",
        focus: "team",
        goalies: "required",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ps-d1", "D1", 130, 30),
                player("ps-d2", "D2", 130, 60),
                player("ps-nf", "NF", 171, 45),
                player("ps-f2", "F2", 170, 72),
                player("ps-f3", "F3", 155, 22),
                goalie("ps-g", 183, 42.5),
            ],
            drawings: [
                pass("ps-pass1", [164, 66], [136, 36]),
                shot("ps-shot", [136, 31], [177, 38]),
                skate("ps-f3-route", [158, 27], [170, 37]),
            ],
            equipment: [
                { id: "ps-pucks", kind: "puckPile", position: { x: 128, y: 45 }, rotation: 0 },
                rightNet("ps-net"),
            ],
            annotations: [note("ps-note", "Screen", 160, 60, "#000000", 6)],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-dzone-coverage",
        name: "D-Zone Coverage",
        description:
            "Base defensive-zone structure. Defensemen own the net-front and battle in the corners, wingers cover the points, and the center supports low. Protect the house: keep opponents to the outside and box out on every shot.",
        focus: "team",
        goalies: "optional",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("dz-g", "G", 17, 42.5, "goalie"),
                player("dz-d1", "D1", 27, 26),
                player("dz-d2", "D2", 27, 59),
                player("dz-c", "C", 47, 42.5),
                player("dz-lw", "LW", 61, 13),
                player("dz-rw", "RW", 61, 72),
            ],
            drawings: [
                zoneLine("dz-house", [11, 27], [33, 27], [43, 42.5], [33, 58], [11, 58]),
                skate("dz-d1-route", [24, 22], [16, 14]),
                skate("dz-d2-route", [24, 63], [16, 71]),
                skate("dz-lw-route", [64, 10], [72, 7]),
                skate("dz-rw-route", [64, 75], [72, 78]),
                skate("dz-c-route", [43, 38], [36, 32]),
            ],
            equipment: [],
            annotations: [note("dz-note", "House", 23, 51, ZONE_COLOR, 6)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-nz-regroup",
        name: "Neutral-Zone Regroup",
        description:
            "Regroup to attack with speed instead of forcing a play at the offensive blue line. Forwards peel back, the defensemen move the puck D-to-D, and the center curls underneath to take the second pass in stride while both wingers stretch wide.",
        focus: "team",
        goalies: "none",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("rg-d1", "D1", 58, 30),
                player("rg-d2", "D2", 58, 55),
                player("rg-c", "C", 92, 34),
                player("rg-lw", "LW", 106, 12),
                player("rg-rw", "RW", 106, 73),
            ],
            drawings: [
                pass("rg-pass1", [58, 36], [58, 49]),
                skate("rg-c-route", [88, 26], [76, 38], [84, 50], [112, 49]),
                pass("rg-pass2", [63, 54], [80, 51]),
                skate("rg-lw-route", [112, 12], [138, 15]),
                skate("rg-rw-route", [112, 73], [138, 70]),
            ],
            equipment: [],
            annotations: [],
        },
    },
    {
        id: "starter-goalie-angles-depth",
        name: "Angles & Depth: Five-Spot Shooting",
        description:
            "Five shooters on an arc from post to post. The coach points to a shooter; the goalie shuffles to square up, sets the feet and finds depth at the top of the crease before the release. Shooters wait until the goalie is set and shoot to the body first, then the corners. Teach: lead with the eyes, short shuffles between neighboring spots (T-pushes for bigger moves), shoulders square to the puck, and back off toward the post as the angle gets sharper. 10–15 min; rotate goalies every 10 shots.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ga-g", 17, 42.5),
                player("ga-s1", "1", 30, 14),
                player("ga-s2", "2", 40, 27),
                player("ga-s3", "3", 44, 42.5),
                player("ga-s4", "4", 40, 58),
                player("ga-s5", "5", 30, 71),
            ],
            drawings: [
                zoneLine("ga-angle-line", [40, 27], [11, 42.5]),
                lateral("ga-g-shuffle", [23.5, 35.5], [26, 39], [26.5, 42.5], [26, 46], [23.5, 49.5]),
                shot("ga-shot1", [33, 18], [21, 36.5]),
                shot("ga-shot3", [38, 42.5], [24, 42.5]),
                shot("ga-shot5", [33, 67], [21, 48.5]),
            ],
            equipment: [leftNet("ga-net"), pucks("ga-pucks", 54, 42.5)],
            annotations: [note("ga-note", "Set first", 20, 83, "#000000", 6)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-butterfly-recovery",
        name: "Butterfly Drop & Recovery",
        description:
            "The coach shoots low to either pad from the slot. The goalie drops into the butterfly, smothers or controls the shot, then recovers toward the next shooter on the flank: lead leg up on the side the goalie is moving to, push off the trailing leg, and arrive square before the flank shooter releases. Teach: knees together, pads flat to seal the ice, hands out in front, stick blade covering the five-hole, and never recover by standing straight up. 6–8 min, alternate sides.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("bf-g", 17, 42.5),
                coach("bf-c", 38, 42.5),
                player("bf-s1", "S1", 32, 22),
                player("bf-s2", "S2", 32, 63),
            ],
            drawings: [
                shot("bf-shot1", [32, 43], [24, 44.5]),
                lateral("bf-recover-up", [17.5, 35.5], [17.5, 29.5]),
                shot("bf-shot2", [26.5, 26], [21, 31]),
                lateral("bf-recover-down", [17.5, 49.5], [17.5, 55.5]),
                shot("bf-shot3", [26.5, 59], [21, 54]),
            ],
            equipment: [leftNet("bf-net"), pucks("bf-pucks", 42, 50)],
            annotations: [note("bf-note", "Lead leg up", 8, 76, "#000000", 6)],
            area: { kind: "custom", rect: { x: 0, y: 10, w: 50, h: 68 } },
        },
    },
    {
        id: "starter-goalie-post-to-post",
        name: "Post-to-Post: RVH and Pushes",
        description:
            "F1 carries from the corner behind the net and tries a wrap-around at the far post. With the puck below the goal line, the goalie seals the near post in reverse-VH (RVH): post pad flat on the ice against the post, back skate loaded. As F1 wraps, the goalie rotates and pushes across to seal the far post. Option two: F1 stops and passes out to F2 in the slot; the goalie rises out of RVH and T-pushes to square up. Use RVH only while the puck is below the goal line. 6–8 min.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("pt-g", 17, 37.5),
                player("pt-f1", "F1", 16, 16),
                player("pt-f2", "F2", 38, 50),
            ],
            drawings: [
                carry("pt-wrap", [11, 21], [5, 30], [5, 55], [12, 64]),
                lateral("pt-g-push", [17, 44.5], [17, 50]),
                shot("pt-wrap-shot", [12, 56], [12.5, 48]),
                pass("pt-pass-out", [7, 57], [32, 51.5]),
                shot("pt-shot2", [32.5, 48], [23, 41.5]),
            ],
            equipment: [leftNet("pt-net"), pucks("pt-pucks", 30, 14)],
            annotations: [note("pt-note", "RVH", 24, 30, "#000000", 6)],
            area: { kind: "custom", rect: { x: 0, y: 10, w: 45, h: 65 } },
        },
    },
    {
        id: "starter-goalie-rebound-control",
        name: "Rebound Control: Steer to the Corners",
        description:
            "A shooter in the high slot shoots low to the pads while F1 and F2 crash the posts on every shot. The goalie angles the pad or the stick blade so the rebound kicks to the corner cones, never back into the slot. Anything left in front, the forwards bury. Count the rebounds that reach the cones. Progress to shots at the body (absorb and cover) and the blocker (deflect to the corner). 10–15 min.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("rc-g", 17, 42.5),
                player("rc-s", "S", 48, 42.5),
                player("rc-f1", "F1", 30, 22),
                player("rc-f2", "F2", 30, 63),
            ],
            drawings: [
                shot("rc-shot", [42, 42.5], [24, 44]),
                skate("rc-f1-crash", [33.5, 27], [23, 34]),
                skate("rc-f2-crash", [33.5, 58], [23, 51]),
                zoneLine("rc-steer-low", [16, 50], [9, 72]),
                zoneLine("rc-steer-high", [16, 35], [9, 13]),
            ],
            equipment: [leftNet("rc-net"), cone("rc-cone-low", 10, 76), cone("rc-cone-high", 10, 9), pucks("rc-pucks", 56, 42.5)],
            annotations: [note("rc-note", "To the corners", 20, 83, "#000000", 6)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-screens",
        name: "Tracking Through Screens",
        description:
            "D2 passes to D1, who shoots low through traffic while a screener stands at the top of the crease and moves across the goalie's eyes on the pass. The goalie finds the puck by looking around the screen, low and beside the screener's hips, not over the top; holds the crease and the angle; and stays big and patient instead of dropping early. Screener: stick on the ice, no contact with the goalie. 8 min; switch screeners every few shots.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("sc-g", 17, 42.5),
                player("sc-x", "X", 30, 47.5),
                player("sc-d1", "D1", 68, 28),
                player("sc-d2", "D2", 68, 58),
            ],
            drawings: [
                pass("sc-pass", [68, 52], [68, 34]),
                shot("sc-shot", [64, 30], [24, 40.5]),
                skate("sc-screen-move", [36, 49], [36, 40.5]),
                lateral("sc-g-look", [20, 35.5], [20, 30]),
            ],
            equipment: [leftNet("sc-net"), pucks("sc-pucks", 72, 43)],
            annotations: [note("sc-note", "Look around", 20, 83, "#000000", 6)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-puck-handling",
        name: "Goalie Puck Handling: Stop and Set",
        description:
            "The coach rims a puck around the boards. The goalie leaves the net early, stops the rim behind the net with the stick on the ice and the glove behind it, and either sets the puck flat beside the net for D1 or moves it up the wall to the winger, on D1's call: \"set\", \"reverse\" or \"wall\". Then the goalie gets back to the crease the short way, stick first. Teach: read the rim early, don't chase pucks you can't reach first, and leave it flat, never on edge. 6 min.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ph-g", 17, 42.5),
                coach("ph-c", 80, 72),
                player("ph-d1", "D1", 28, 14),
                player("ph-lw", "LW", 55, 7),
            ],
            drawings: [
                pass("ph-rim-pass", [75, 76.5], [40, 82], [12, 78], [4, 62], [4, 50]),
                skate("ph-g-route", [12, 47], [5, 53]),
                pass("ph-set-pass", [6, 50], [7, 33]),
                pass("ph-wall-pass", [6, 36], [10, 17], [18, 5], [48, 5]),
            ],
            equipment: [leftNet("ph-net"), pucks("ph-pucks", 86, 76)],
            annotations: [note("ph-note", "Set · Reverse · Wall", 24, 52, "#000000", 6)],
            area: { kind: "half-left" },
        },
    },
    {
        id: "starter-goalie-breakaways",
        name: "Breakaways and Shootout",
        description:
            "Shooters attack from center ice one at a time, alternating a shot and a deke. The goalie starts at the top of the crease, matches the shooter's speed with a controlled backward glide (C-cuts), keeps the gap so the shooter can't get wide, and stays patient: don't open up or drop first, and follow the puck on the deke. Shooters must finish within 8 seconds. Finish with a three-round shootout. 8–10 min.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("bk-g", 22, 42.5),
                player("bk-f1", "F1", 92, 42.5),
                player("bk-f2", "F2", 93, 28),
                player("bk-f3", "F3", 93, 57),
            ],
            drawings: [
                carry("bk-carry", [86, 42.5], [55, 40], [39, 38]),
                shot("bk-shot", [37, 38], [28.5, 40]),
                carry("bk-deke", [39, 40], [31, 52], [24, 50.5]),
                backskate("bk-g-glide", [24, 35.5], [15, 37]),
            ],
            equipment: [leftNet("bk-net"), pucks("bk-pucks", 98, 72)],
            annotations: [note("bk-note", "Match speed", 40, 22, "#000000", 6)],
            area: { kind: "half-left" },
        },
    },
    {
        id: "starter-goalie-warmup",
        name: "Goalie Warm-Up",
        description:
            "Every goalie's warm-up before team drills, run by a coach (5–8 min). Start with slow shots to the body so the goalie finds pucks: five to the blocker, five to the glove, five to each pad, all from the slot. Then the flank shooters shoot to the far pad so the goalie pushes and seals. Finish with five quicker shots anywhere. Shooters hit the goalie; the goal is touch and confidence, not goals.",
        focus: "goalies",
        goalies: "required",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("wu-g", 17, 42.5),
                coach("wu-c", 40, 42.5),
                player("wu-f1", "F1", 36, 18),
                player("wu-f2", "F2", 36, 67),
            ],
            drawings: [
                shot("wu-shot1", [34, 42.5], [24, 42]),
                shot("wu-shot2", [33, 22], [23, 49.5]),
                shot("wu-shot3", [33, 63], [23, 35.5]),
            ],
            equipment: [leftNet("wu-net"), pucks("wu-pucks", 48, 47)],
            annotations: [note("wu-note", "Hit the goalie", 20, 83, "#000000", 6)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-crease-pattern",
        name: "Crease Movement Pattern",
        description:
            "A skating pattern for crease movement, on the coach's whistle: T-push to the top post, step out to the top of the crease, C-cut back to the bottom post. Finish with a shot from F1 so every rep ends in a save. Teach: lead with the head and eyes, rotate the hips before the push, stop square with no drift, stick on the ice the whole time. With two goalies, run it at both ends. 5 min.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("cp-g", 17, 42.5),
                coach("cp-c", 40, 42.5),
                player("cp-f1", "F1", 36, 64),
            ],
            drawings: [
                lateral("cp-push-top", [17, 35.5], [17, 30]),
                skate("cp-out", [19, 31], [25, 39.5]),
                backskate("cp-back", [25, 45.5], [18, 54.5]),
                shot("cp-shot", [31.5, 60], [20, 53]),
            ],
            equipment: [leftNet("cp-net"), cone("cp-cone-top", 16, 28), cone("cp-cone-out", 27, 42.5), cone("cp-cone-bottom", 16, 57), pucks("cp-pucks", 44, 66)],
            annotations: [note("cp-note", "Post-top-post", 6, 20, "#000000", 5)],
            area: { kind: "custom", rect: { x: 0, y: 12.5, w: 50, h: 60 } },
        },
    },
    {
        id: "starter-skate-edges-crossovers",
        name: "Edges & Crossovers: Circle Figure-Eights",
        description:
            "Forward crossovers around both right-end circles in a figure eight, switching direction through the middle so both edges work. Teach: knees bent, a full push from the outside leg, the inside leg pushing under the body on its outside edge, shoulders level, head and stick up. Second time through, backward crossovers. Add a puck once the pattern is clean. 6–8 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ec-s1", "S1", 142, 26),
                player("ec-s2", "S2", 133, 14),
                player("ec-s3", "S3", 140, 64),
            ],
            drawings: [
                skate("ec-entry", [147, 28], [154, 31]),
                lateral(
                    "ec-figure-eight",
                    [157, 32.5], [152, 20.5], [157, 8.5], [169, 3.5], [181, 8.5], [186, 20.5], [181, 32.5],
                    [169, 42.5],
                    [157, 52.5], [152, 64.5], [157, 76.5], [169, 81.5], [181, 76.5], [186, 64.5], [181, 52.5], [172, 44],
                ),
                skate("ec-exit", [166, 46], [148, 48]),
            ],
            equipment: [pylon("ec-pylon-top", 169, 20.5), pylon("ec-pylon-bottom", 169, 64.5)],
            annotations: [note("ec-note", "Switch edges", 128, 40, "#000000", 5)],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-skate-transitions",
        name: "Pivots & Transitions: Cone Box",
        description:
            "Skate forward up one side of the box, open the hips and pivot to backward at the cone, skate backward across the top, pivot to forward down the far side, and so on around the box. Teach: pivot at the cone, not after it; turn the hips and shoulders together; keep the stick on the ice and the eyes up the ice; quick feet out of every pivot. Run both directions so the pivots go both ways. 5–8 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("tr-s1", "S1", 84, 77),
                player("tr-s2", "S2", 97, 77),
                player("tr-s3", "S3", 110, 77),
            ],
            drawings: [
                skate("tr-fwd-left", [85, 70], [85, 23]),
                backskate("tr-back-top", [88, 20], [112, 20]),
                skate("tr-fwd-right", [115, 23], [115, 62]),
                backskate("tr-back-bottom", [112, 65], [88, 65]),
            ],
            equipment: [cone("tr-cone1", 85, 20), cone("tr-cone2", 115, 20), cone("tr-cone3", 115, 65), cone("tr-cone4", 85, 65)],
            annotations: [note("tr-note", "Pivot at cones", 79, 10, "#000000", 5)],
            area: { kind: "zone-neutral" },
        },
    },
    {
        id: "starter-skate-passing-lanes",
        name: "Partner Passing Lanes",
        description:
            "Partners skate the length of the ice about 40 feet apart, passing back and forth at full speed without breaking stride. Pass ahead of your partner's stick so they skate into it; receive on the forehand and backhand alternately and cushion the puck (soft hands, blade angled over the puck). The last pass comes at the far blue line; the receiver drives wide and shoots. Count completed passes per trip. 8 min.",
        focus: "skaters",
        goalies: "optional",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("pl-a1", "A1", 28, 20),
                player("pl-a2", "A2", 28, 65),
                player("pl-b1", "B1", 15, 20),
                player("pl-b2", "B2", 15, 65),
            ],
            drawings: [
                skate("pl-a1-route", [34, 20], [160, 20]),
                skate("pl-a2-route", [34, 65], [160, 65]),
                pass("pl-pass1", [40, 23], [62, 62]),
                pass("pl-pass2", [78, 62], [100, 23]),
                pass("pl-pass3", [116, 23], [138, 62]),
                carry("pl-a2-drive", [160, 65], [176, 56]),
                shot("pl-shot", [176, 55], [187, 45]),
            ],
            equipment: [rightNet("pl-net"), pucks("pl-pucks", 20, 42.5)],
            annotations: [],
        },
    },
    {
        id: "starter-skate-wrist-shots",
        name: "Wrist-Shot Lanes",
        description:
            "Three lines at the tops of the circles and the high slot. On the whistle, each shooter takes a short pull-in carry and shoots a wrist shot in stride, lines alternating. Teach: the puck starts at the heel of the blade beside the back foot; weight moves from the back foot to the front; roll the wrists and follow through at the target, low for low shots and high for the top corners. Pick a spot before the release. 5–8 min; rotate lines every five shots.",
        focus: "skaters",
        goalies: "optional",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ws-g", 183, 42.5),
                player("ws-s1", "S1", 150, 18),
                player("ws-s2", "S2", 140, 42.5),
                player("ws-s3", "S3", 150, 67),
            ],
            drawings: [
                carry("ws-s1-carry", [154, 22], [162, 28]),
                shot("ws-shot1", [163, 29], [178, 38]),
                carry("ws-s2-carry", [146, 42.5], [158, 42.5]),
                shot("ws-shot2", [159, 42.5], [176, 42.5]),
                carry("ws-s3-carry", [154, 63], [162, 57]),
                shot("ws-shot3", [163, 56], [178, 47]),
            ],
            equipment: [rightNet("ws-net"), pucks("ws-pucks1", 139, 23), pucks("ws-pucks2", 130, 42.5), pucks("ws-pucks3", 139, 62)],
            annotations: [note("ws-note", "Pick a spot", 128, 83, "#000000", 6)],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-skate-puck-protection",
        name: "Puck Protection: Wall Battle",
        description:
            "The coach spots a puck into the corner. F1 wins it and protects it along the wall for 10 seconds against a live defender, staying inside the cones. Teach: wide base and bent knees, the puck on the far side of the body from the defender's stick, the inside arm and hip holding the defender off (legal body position, no hooking), and a cut back when the defender overcommits. Defender: stick on the puck, body between the puck and the net. Swap roles every rep. 5–6 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("pr-f1", "F1", 174, 77),
                player("pr-o1", "O1", 166, 66, "them"),
                coach("pr-c", 163.5, 51),
            ],
            drawings: [
                pass("pr-pass", [168, 56], [186, 72]),
                carry("pr-carry", [186, 72], [193, 65], [194, 58]),
                carry("pr-cutback", [192, 57], [182, 58]),
                opponentRoute("pr-o1-route", [170, 70], [181, 74]),
            ],
            equipment: [cone("pr-cone1", 157, 60), cone("pr-cone2", 157, 82), pucks("pr-pucks", 157, 51)],
            annotations: [note("pr-note", "10 seconds", 170, 51.5, "#000000", 4.5)],
            area: { kind: "custom", rect: { x: 155, y: 45, w: 45, h: 40 } },
        },
    },
    {
        id: "starter-skate-small-area-2v2",
        name: "Small-Area 2-on-2 Battle",
        description:
            "The coach spots pucks into the zone: two attackers against two defenders, 30–40 second shifts, everything below the tops of the circles. Attackers get to the net fast; one takes the puck to the net, the other finds open ice for a pass or a rebound. Defenders: stick on the puck, take away the middle, win it and move it to the coach to switch. Keep score, because battles need consequences. 10–12 min.",
        focus: "skaters",
        goalies: "optional",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("sa-g", 183, 42.5),
                player("sa-f1", "F1", 155, 26),
                player("sa-f2", "F2", 150, 56),
                player("sa-o1", "O1", 169, 31, "them"),
                player("sa-o2", "O2", 156, 70, "them"),
                coach("sa-c", 138, 78),
            ],
            drawings: [
                pass("sa-pass1", [141, 73], [146, 63]),
                carry("sa-f2-carry", [155, 60], [166, 66], [176, 62]),
                skate("sa-f1-route", [157, 31], [158, 40]),
                pass("sa-pass2", [176, 60], [160, 46]),
                shot("sa-shot", [161, 46], [176, 44]),
            ],
            equipment: [rightNet("sa-net"), pucks("sa-pucks", 128, 80)],
            annotations: [],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-skate-stops-starts",
        name: "Stops & Starts",
        description:
            "Skate from the goal line to the near blue line, two-foot hockey stop, and sprint back; then to the red line and back, then the far blue line and back. Stop facing the same wall on the way out and the other wall on the way back so both sides get worked. Teach: drop the hips, turn the hips and shoulders together, skates about shoulder-width apart, and dig in the inside edge of the front skate and the outside edge of the back skate. Explode out with short, quick first strides. 4–5 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ss-s1", "S1", 14, 20),
                player("ss-s2", "S2", 14, 42.5),
                player("ss-s3", "S3", 14, 65),
            ],
            drawings: [
                skateStop("ss-s1-out", [20, 20], [73, 20]),
                skateStop("ss-s1-back", [73, 25], [20, 25]),
                skateStop("ss-s2-out", [20, 42.5], [98, 42.5]),
                skateStop("ss-s3-out", [20, 65], [123, 65]),
            ],
            equipment: [],
            annotations: [note("ss-note", "Stop facing the same wall", 24, 36, "#000000", 5)],
        },
    },
    {
        id: "starter-skate-stickhandling",
        name: "Stickhandling: Cone Weave",
        description:
            "Carry the puck through the cones with quick side-to-side handles, finish around the last cone with a toe drag, and pass to the next skater. Teach: the puck in the middle of the blade, a loose bottom hand, the top hand doing the work, the puck moving wider than the body, and the eyes up between cones (glance down, don't stare). Progress: forehand only, backhand only, then one hand on the stick. 5–6 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("st-s1", "S1", 85, 15),
                player("st-s2", "S2", 98, 15),
                player("st-s3", "S3", 111, 15),
            ],
            drawings: [
                carry("st-weave", [84, 21], [82, 30], [86, 36], [96, 49], [106, 36], [116, 49], [122, 42.5], [119, 33]),
                pass("st-pass", [117, 29], [92, 29]),
                skate("st-s2-next", [95, 21], [92, 28]),
            ],
            equipment: [cone("st-cone1", 86, 42.5), cone("st-cone2", 96, 42.5), cone("st-cone3", 106, 42.5), cone("st-cone4", 116, 42.5), pucks("st-pucks", 78, 6)],
            annotations: [note("st-note", "Eyes up", 88, 70, "#000000", 6)],
            area: { kind: "zone-neutral" },
        },
    },
    {
        id: "starter-goalie-quarter-station",
        name: "Goalie Station: Track, Set, Save",
        description:
            "A goalie station in one quarter of the ice that stays put while the skater groups rotate. Set a net on the goal line, level with the bottom faceoff dot. A helper passes to the coach, so the goalie follows the pass, squares up and sets before the coach shoots from the slot. Start with shots to the body, then low to each pad. Teach: eyes on the puck, short shuffles, stick on the ice, glove up, and back to the feet after every save. Young players can take turns in net.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u8", "u10", "u12"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("gq-g", 17, 64.5),
                coach("gq-c", 42, 64.5),
                player("gq-h1", "H1", 34, 50),
                player("gq-h2", "H2", 34, 79),
            ],
            drawings: [
                pass("gq-pass1", [37, 54], [39, 57.5]),
                pass("gq-pass2", [37, 75], [39.5, 71]),
                lateral("gq-track", [21, 58], [21, 71]),
                shot("gq-shot", [36, 64.5], [24, 64.5]),
            ],
            equipment: [goalLineNet("gq-net", 11, 64.5), pucks("gq-pucks", 52, 64.5)],
            annotations: [note("gq-note", "Square up", 44, 83, "#000000", 5)],
            area: { kind: "zone-left-bottom" },
        },
    },
    {
        id: "starter-skate-edge-circuit",
        name: "Edge Circuit: Circle and Cones",
        description:
            "Edge work in one quarter of the ice. Skate forward crossovers all the way around the faceoff circle, then carve through the line of cones on deep inside and outside edges and rejoin the line. Teach: knees bent, a full push from the outside leg, the inside foot crossing over, shoulders level, eyes up. Change direction every other turn so both edges work, and add a puck once the pattern is easy. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u6", "u8", "u10"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ci-s1", "S1", 55, 33),
                player("ci-s2", "S2", 55, 20.5),
                player("ci-s3", "S3", 60, 8),
            ],
            drawings: [
                skate("ci-entry", [50, 31], [47.5, 27]),
                lateral("ci-circle", [47, 24], [42.3, 31.8], [31, 36.5], [19.7, 31.8], [15, 20.5], [19.7, 9.2], [31, 4.5], [42.3, 9.2], [46, 15]),
                skate("ci-weave", [64, 6], [73, 12], [66, 24], [73, 36], [68, 40]),
            ],
            equipment: [cone("ci-cone1", 69.5, 12), cone("ci-cone2", 69.5, 24), cone("ci-cone3", 69.5, 36)],
            annotations: [],
            area: { kind: "zone-left-top" },
        },
    },
    {
        id: "starter-skate-obstacle-lane",
        name: "Obstacle Lane: Puck Control",
        description:
            "A lane of cones and a tire across one quarter of the ice. Carry the puck through the lane, weaving above and below each obstacle, finish around the last cone, pass back to the next skater and join the line. Teach: soft hands, the puck in the middle of the blade, small quick steps, and eyes up between obstacles (glance down, don't stare). Progress to backhand only, then one hand on the stick. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u6", "u8", "u10"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ol-s1", "S1", 80, 36),
                player("ol-s2", "S2", 93, 36),
                player("ol-s3", "S3", 106, 36),
            ],
            drawings: [
                carry("ol-carry", [80, 30], [86, 11], [96, 27], [106, 11], [116, 27], [121, 19]),
                pass("ol-pass", [119, 24], [100, 31]),
                skate("ol-next", [93, 30], [84, 26]),
            ],
            equipment: [
                cone("ol-cone1", 86, 19),
                cone("ol-cone2", 96, 19),
                gear("tire", "ol-tire", 106, 19),
                cone("ol-cone3", 116, 19),
                pucks("ol-pucks", 78, 8),
            ],
            annotations: [],
            area: { kind: "zone-neutral-top" },
        },
    },
    {
        id: "starter-skate-quarter-2v2",
        name: "Quarter-Ice 2-on-2",
        description:
            "Two on two in one quarter of the ice, with a small net at each end. The coach spots a puck; the pair that wins it attacks the far net and the other pair defends, and every change of possession flips the direction. 30-second shifts, then the next four go. Attackers: support the puck carrier and get open. Defenders: stick on the puck, body between the puck and the net. Keep score. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("q2-f1", "F1", 150, 55),
                player("q2-f2", "F2", 158, 76),
                player("q2-o1", "O1", 166, 60, "them"),
                player("q2-o2", "O2", 146, 72, "them"),
                coach("q2-c", 130, 80),
            ],
            drawings: [
                pass("q2-pass", [135, 79], [150, 78]),
                carry("q2-carry", [162, 75], [172, 74], [178, 70]),
                shot("q2-shot", [179, 69], [185, 66.5]),
                skate("q2-f1-route", [154, 58], [166, 50]),
            ],
            equipment: [goalLineNet("q2-net-right", 189, 64.5), smallNet("q2-net-left", 136, 64.5, 180), pucks("q2-pucks", 128, 82)],
            annotations: [],
            area: { kind: "zone-right-bottom" },
        },
    },
    {
        id: "starter-skate-give-and-go",
        name: "Give-and-Go Triangle",
        description:
            "Three skaters in one quarter of the ice. S1 passes to S2, skates hard around the cone and gets the puck straight back, then carries to S3, who starts the next give-and-go. Teach: pass to the target, then move at once; the receiver shows a target with the stick on the ice; the return pass leads the skater; heads up before every pass. Switch direction after every few turns. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u10", "u12", "u14"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("gg-s1", "S1", 20, 32),
                player("gg-s2", "S2", 46, 8),
                player("gg-s3", "S3", 62, 30),
            ],
            drawings: [
                pass("gg-pass1", [25, 28], [40, 13]),
                skate("gg-s1-route", [26, 34], [36, 30], [44, 22]),
                pass("gg-pass2", [47, 14], [48, 24]),
                carry("gg-carry", [49, 26], [55, 30]),
            ],
            equipment: [cone("gg-cone", 34, 22), pucks("gg-pucks", 12, 36)],
            annotations: [],
            area: { kind: "zone-left-top" },
        },
    },
    {
        id: "starter-skate-quick-release",
        name: "Quick-Release Shooting",
        description:
            "A coach passes from the corner; the shooter takes it in stride at the top of the circle and shoots in one motion, without stopping the puck first. Two lines take turns. Teach: catch the pass in front of the body with soft hands, keep the puck moving toward the release, move the weight onto the front foot, and pick a corner before the pass arrives. Shoot at an empty net or targets unless a goalie is free. 8–10 min.",
        focus: "skaters",
        goalies: "optional",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("qr-s1", "S1", 140, 12),
                player("qr-s2", "S2", 140, 30),
                coach("qr-c", 176, 37),
            ],
            drawings: [
                pass("qr-pass", [171, 36], [156, 30]),
                skate("qr-s2-route", [146, 30], [154, 28]),
                shot("qr-shot", [157, 27], [182, 21.5]),
                skate("qr-s1-next", [146, 13], [152, 16]),
            ],
            equipment: [goalLineNet("qr-net", 189, 20.5), pucks("qr-pucks", 184, 38)],
            annotations: [],
            area: { kind: "zone-right-top" },
        },
    },
    {
        id: "starter-skate-keep-away",
        name: "Keep-Away in a Box",
        description:
            "Three skaters keep the puck away from two inside a box of cones. Every completed pass is a point; when a defender touches the puck, the skater who lost it swaps in as a defender. 30-second rounds. Teach: move to open ice right after passing, show a target with the stick, and shield the puck with the body when pressured. Run one game in each quarter of the ice so everyone plays. 12–15 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u6", "u8", "u10"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ka-f1", "F1", 84, 52),
                player("ka-f2", "F2", 114, 54),
                player("ka-f3", "F3", 100, 76),
                player("ka-o1", "O1", 96, 60, "them"),
                player("ka-o2", "O2", 110, 66, "them"),
            ],
            drawings: [
                pass("ka-pass1", [87, 57], [96, 70]),
                pass("ka-pass2", [104, 72], [115, 61]),
                skate("ka-f1-route", [83, 58], [82, 66]),
                opponentRoute("ka-o1-route", [99, 64], [102, 70]),
            ],
            equipment: [cone("ka-cone1", 78, 46), cone("ka-cone2", 122, 46), cone("ka-cone3", 122, 82), cone("ka-cone4", 78, 82)],
            annotations: [],
            area: { kind: "zone-neutral-bottom" },
        },
    },
    {
        id: "starter-game-3v3-cross-ice",
        name: "3-on-3 Cross-Ice Game",
        description:
            "Three on three across the neutral zone, with a small net against each side boards. Play keeps going after a goal: the coach spots a new puck at once. Shifts of 30–40 seconds, then the next three from each team jump on. Teach: move to open ice after every pass, support the puck carrier from below, and come back to the net to defend. 7–10 min.",
        focus: "team",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("c3-f1", "F1", 88, 30),
                player("c3-f2", "F2", 112, 36),
                player("c3-f3", "F3", 96, 56),
                player("c3-o1", "O1", 106, 22, "them"),
                player("c3-o2", "O2", 88, 46, "them"),
                player("c3-o3", "O3", 114, 58, "them"),
            ],
            drawings: [
                pass("c3-pass", [90, 35], [95, 49]),
                carry("c3-carry", [100, 60], [106, 68]),
                shot("c3-shot", [107, 70], [102, 76]),
                skate("c3-f2-route", [112, 42], [116, 46]),
                opponentRoute("c3-o2-route", [88, 52], [93, 62]),
            ],
            equipment: [smallNet("c3-net-top", 100, 6, 270), smallNet("c3-net-bottom", 100, 79, 90), pucks("c3-pucks", 122, 42.5)],
            annotations: [],
            area: { kind: "zone-neutral" },
        },
    },
    {
        id: "starter-game-4v4-cross-ice",
        name: "4-on-4 Cross-Ice Game",
        description:
            "Four on four across one end zone, with a net against each side boards. Lines change on the whistle every 45 seconds, and the coach spots a new puck whenever one leaves the zone. Play fast: support the puck in threes, use the back player to switch sides, and get a body to the net on every shot. Run a second game in the other end zone if numbers allow. 15–20 min.",
        focus: "team",
        goalies: "optional",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("c4-f1", "F1", 142, 52),
                player("c4-f2", "F2", 180, 56),
                player("c4-f3", "F3", 160, 64),
                player("c4-d1", "D1", 152, 30),
                player("c4-o1", "O1", 165, 48, "them"),
                player("c4-o2", "O2", 144, 68, "them"),
                player("c4-o3", "O3", 176, 70, "them"),
                player("c4-o4", "O4", 170, 22, "them"),
            ],
            drawings: [
                pass("c4-pass", [150, 36], [144, 45]),
                carry("c4-carry", [146, 56], [153, 68]),
                shot("c4-shot", [156, 70], [161, 75]),
                skate("c4-f3-route", [164, 68], [166, 74]),
                skate("c4-d1-route", [156, 34], [160, 40]),
            ],
            equipment: [smallNet("c4-net-top", 162.5, 8, 270), smallNet("c4-net-bottom", 162.5, 77, 90), pucks("c4-pucks", 128, 42.5)],
            annotations: [],
            area: { kind: "zone-right" },
        },
    },
];
