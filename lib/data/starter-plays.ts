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
import { DEFAULT_END_FOR_ACTION, ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

export interface StarterPlay {
    /** Stable slug: React keys, thumbnail caching, and the static planner's seeded-id set */
    id: string;
    name: string;
    /** Coaching description, at most 500 characters (PlayEditor's limit) */
    description: string;
    focus: PlayFocus;
    goalies: PlayGoalies;
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
const cone = (id: string, x: number, y: number) => gear("cone", id, x, y);
const pylon = (id: string, x: number, y: number) => gear("pylon", id, x, y);
const pucks = (id: string, x: number, y: number) => gear("puckPile", id, x, y);

function note(id: string, text: string, x: number, y: number, color: string = "#000000"): TextAnnotation {
    return { id, text, position: { x, y }, fontSize: 8, color };
}

export const STARTER_PLAYS: readonly StarterPlay[] = [
    {
        id: "starter-breakout-5man",
        name: "Breakout (5-Man)",
        description:
            "Standard controlled breakout out of the defensive zone. D1 retrieves behind the net and hits the strong-side winger on the wall; the winger chips to the center swinging through the middle with speed while the weak-side winger stretches the far wall.",
        focus: "team",
        goalies: "optional",
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
                pass("bo-pass1", [20, 51], [36, 16]),
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
                shot("pp-shot", [155, 17], [184, 39]),
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("cy-f1", "F1", 176, 68),
                player("cy-f2", "F2", 150, 73),
                player("cy-f3", "F3", 163, 44),
                player("cy-d1", "D1", 130, 58),
            ],
            drawings: [
                pass("cy-chip", [168, 78], [181, 71]),
                skate("cy-f1-route", [176, 62], [170, 48]),
                skate("cy-f2-route", [156, 74], [172, 71]),
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
            "Simple offensive-zone set to generate traffic goals. The corner forward wins the puck and moves it to the point; the net-front forward establishes a screen at the top of the crease while the high slot forward crashes for tips and rebounds off the point shot.",
        focus: "team",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ps-d1", "D1", 130, 30),
                player("ps-d2", "D2", 130, 60),
                player("ps-nf", "NF", 175, 45),
                player("ps-f2", "F2", 170, 72),
                player("ps-f3", "F3", 155, 22),
                goalie("ps-g", 187, 42.5),
            ],
            drawings: [
                pass("ps-pass1", [164, 66], [136, 36]),
                shot("ps-shot", [136, 31], [183, 42]),
                skate("ps-f3-route", [158, 27], [170, 37]),
            ],
            equipment: [
                { id: "ps-pucks", kind: "puckPile", position: { x: 128, y: 45 }, rotation: 0 },
                { id: "ps-net", kind: "net", position: { x: 189, y: 42.5 }, rotation: 0 },
            ],
            annotations: [note("ps-note", "Screen", 170, 57)],
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("dz-g", "G", 13, 42.5, "goalie"),
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
            annotations: [note("dz-note", "House", 24, 49, ZONE_COLOR)],
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
            "Five shooters on an arc from post to post. The coach points to a shooter; the goalie shuffles to square up, sets the feet and finds depth at the top of the crease before the release. Shooters wait until the goalie is set and shoot to the body first, then the corners. Teach: lead with the eyes, short shuffles between neighboring spots (T-pushes for bigger moves), shoulders square to the puck, and back off toward the post as the angle gets sharper. 8–10 min; rotate goalies every 10 shots.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ga-g", 14, 42.5),
                player("ga-s1", "1", 30, 14),
                player("ga-s2", "2", 40, 27),
                player("ga-s3", "3", 44, 42.5),
                player("ga-s4", "4", 40, 58),
                player("ga-s5", "5", 30, 71),
            ],
            drawings: [
                zoneLine("ga-angle-line", [40, 27], [11, 42.5]),
                lateral("ga-g-shuffle", [16, 37], [16, 48]),
                shot("ga-shot1", [33, 18], [17, 39]),
                shot("ga-shot3", [38, 42.5], [20, 42.5]),
                shot("ga-shot5", [33, 67], [17, 46]),
            ],
            equipment: [leftNet("ga-net"), pucks("ga-pucks", 54, 42.5)],
            annotations: [note("ga-note", "Set before the shot", 40, 82)],
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("bf-g", 14, 42.5),
                coach("bf-c", 34, 42.5),
                player("bf-s1", "S1", 28, 25),
                player("bf-s2", "S2", 28, 60),
            ],
            drawings: [
                shot("bf-shot1", [29, 43], [18, 46]),
                lateral("bf-recover-up", [15, 39], [15, 31]),
                shot("bf-shot2", [25, 28], [18, 33]),
                lateral("bf-recover-down", [15, 46], [15, 54]),
                shot("bf-shot3", [25, 57], [18, 52]),
            ],
            equipment: [leftNet("bf-net"), pucks("bf-pucks", 37, 50)],
            annotations: [note("bf-note", "Lead leg up", 36, 60)],
            area: { kind: "custom", rect: { x: 0, y: 17.5, w: 40, h: 50 } },
        },
    },
    {
        id: "starter-goalie-post-to-post",
        name: "Post-to-Post: RVH and Pushes",
        description:
            "F1 carries from the corner behind the net and tries a wrap-around at the far post. With the puck below the goal line, the goalie seals the near post in reverse-VH (RVH): post pad flat on the ice against the post, back skate loaded. As F1 wraps, the goalie rotates and pushes across to seal the far post. Option two: F1 stops and passes out to F2 in the slot; the goalie rises out of RVH and T-pushes to square up. Use RVH only while the puck is below the goal line. 6–8 min.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("pt-g", 14, 37),
                player("pt-f1", "F1", 16, 16),
                player("pt-f2", "F2", 34, 48),
            ],
            drawings: [
                carry("pt-wrap", [12, 19], [5, 30], [5, 55], [12, 64]),
                lateral("pt-g-push", [15, 40], [15, 47]),
                shot("pt-wrap-shot", [13, 63], [12, 48]),
                pass("pt-pass-out", [7, 57], [29, 50]),
                shot("pt-shot2", [30, 46], [18, 43]),
            ],
            equipment: [leftNet("pt-net"), pucks("pt-pucks", 30, 14)],
            annotations: [note("pt-note", "RVH", 24, 30)],
            area: { kind: "custom", rect: { x: 0, y: 10, w: 45, h: 65 } },
        },
    },
    {
        id: "starter-goalie-rebound-control",
        name: "Rebound Control: Steer to the Corners",
        description:
            "A shooter in the high slot shoots low to the pads while F1 and F2 crash the posts on every shot. The goalie angles the pad or the stick blade so the rebound kicks to the corner cones, never back into the slot. Anything left in front, the forwards bury. Count the rebounds that reach the cones. Progress to shots at the body (absorb and cover) and the blocker (deflect to the corner). 8 min.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("rc-g", 14, 42.5),
                player("rc-s", "S", 48, 42.5),
                player("rc-f1", "F1", 30, 22),
                player("rc-f2", "F2", 30, 63),
            ],
            drawings: [
                shot("rc-shot", [42, 42.5], [18, 46]),
                skate("rc-f1-crash", [33, 26], [22, 34]),
                skate("rc-f2-crash", [33, 59], [22, 51]),
                zoneLine("rc-steer-low", [16, 50], [9, 72]),
                zoneLine("rc-steer-high", [16, 35], [9, 13]),
            ],
            equipment: [leftNet("rc-net"), cone("rc-cone-low", 10, 76), cone("rc-cone-high", 10, 9), pucks("rc-pucks", 56, 42.5)],
            annotations: [note("rc-note", "Steer to the corners", 40, 80)],
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("sc-g", 14, 42.5),
                player("sc-x", "X", 27, 45),
                player("sc-d1", "D1", 68, 28),
                player("sc-d2", "D2", 68, 58),
            ],
            drawings: [
                pass("sc-pass", [68, 52], [68, 34]),
                shot("sc-shot", [64, 30], [19, 41]),
                skate("sc-screen-move", [31, 50], [31, 38]),
                lateral("sc-g-look", [16, 47], [16, 39]),
            ],
            equipment: [leftNet("sc-net"), pucks("sc-pucks", 72, 43)],
            annotations: [note("sc-note", "Look around, not over", 44, 78)],
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ph-g", 14, 42.5),
                coach("ph-c", 80, 72),
                player("ph-d1", "D1", 28, 14),
                player("ph-lw", "LW", 55, 7),
            ],
            drawings: [
                pass("ph-rim-pass", [76, 76], [40, 82], [12, 78], [4, 62], [4, 50]),
                skate("ph-g-route", [11, 47], [5, 52]),
                pass("ph-set-pass", [6, 47], [24, 18]),
                pass("ph-wall-pass", [8, 40], [50, 10]),
            ],
            equipment: [leftNet("ph-net"), pucks("ph-pucks", 86, 76)],
            annotations: [note("ph-note", "Set · Reverse · Wall", 45, 50)],
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("bk-g", 18, 42.5),
                player("bk-f1", "F1", 92, 42.5),
                player("bk-f2", "F2", 96, 28),
                player("bk-f3", "F3", 96, 57),
            ],
            drawings: [
                carry("bk-carry", [86, 42.5], [50, 40], [30, 37]),
                shot("bk-shot", [29, 37], [17, 40]),
                carry("bk-deke", [30, 46], [24, 53], [17, 50]),
                backskate("bk-g-glide", [23, 48], [15, 46]),
            ],
            equipment: [leftNet("bk-net"), pucks("bk-pucks", 98, 72)],
            annotations: [note("bk-note", "Match speed", 40, 22)],
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("wu-g", 14, 42.5),
                coach("wu-c", 40, 42.5),
                player("wu-f1", "F1", 36, 18),
                player("wu-f2", "F2", 36, 67),
            ],
            drawings: [
                shot("wu-shot1", [34, 42.5], [20, 41]),
                shot("wu-shot2", [33, 22], [18, 46]),
                shot("wu-shot3", [33, 63], [18, 39]),
            ],
            equipment: [leftNet("wu-net"), pucks("wu-pucks", 48, 47)],
            annotations: [note("wu-note", "Shoot to the goalie", 44, 80)],
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
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("cp-g", 14, 42.5),
                coach("cp-c", 40, 42.5),
                player("cp-f1", "F1", 36, 64),
            ],
            drawings: [
                lateral("cp-push-top", [15, 37], [15, 31]),
                skate("cp-out", [17, 31], [24, 40]),
                backskate("cp-back", [24, 45], [17, 54]),
                shot("cp-shot", [33, 61], [19, 52]),
            ],
            equipment: [leftNet("cp-net"), cone("cp-cone-top", 16, 28), cone("cp-cone-out", 27, 42.5), cone("cp-cone-bottom", 16, 57), pucks("cp-pucks", 44, 66)],
            annotations: [note("cp-note", "Post · top · post", 30, 20)],
            area: { kind: "custom", rect: { x: 0, y: 12.5, w: 50, h: 60 } },
        },
    },
];
