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
 * - Player markers render with a 12 ft radius, so player centers are kept
 *   roughly 24+ ft apart to avoid overlapping circles
 *
 * Diagram conventions used across the pack:
 * - Blue players (#0000FF): our team; Red (#FF0000): opponents; Black: goalie
 * - Black arrows: skating routes; Orange arrows: passes; Red arrows: shots
 * - Purple lines: zone/coverage markings
 */

import type {
    DrawingElement,
    PlayData,
    PlayerIcon,
    Position,
    TextAnnotation,
} from "@/types/practice-planner";

export interface StarterPlay {
    /** Stable slug used for React keys and thumbnail caching */
    id: string;
    name: string;
    description: string;
    playData: PlayData;
}

const OUR_TEAM = "#0000FF";
const OPPONENT = "#FF0000";
const GOALIE = "#000000";
const SKATE_COLOR = "#000000";
const PASS_COLOR = "#FFA500";
const SHOT_COLOR = "#FF0000";
const ZONE_COLOR = "#800080";

type Point = [x: number, y: number];

const toPositions = (points: Point[]): Position[] =>
    points.map(([x, y]) => ({ x, y }));

function player(id: string, label: string, x: number, y: number, color: string = OUR_TEAM): PlayerIcon {
    return { id, label, position: { x, y }, color };
}

function skate(id: string, ...points: Point[]): DrawingElement {
    return { id, type: "arrow", points: toPositions(points), color: SKATE_COLOR, strokeWidth: 3 };
}

function pass(id: string, ...points: Point[]): DrawingElement {
    return { id, type: "arrow", points: toPositions(points), color: PASS_COLOR, strokeWidth: 2 };
}

function shot(id: string, ...points: Point[]): DrawingElement {
    return { id, type: "arrow", points: toPositions(points), color: SHOT_COLOR, strokeWidth: 4 };
}

function opponentRoute(id: string, ...points: Point[]): DrawingElement {
    return { id, type: "arrow", points: toPositions(points), color: OPPONENT, strokeWidth: 2 };
}

function zoneLine(id: string, ...points: Point[]): DrawingElement {
    return { id, type: "line", points: toPositions(points), color: ZONE_COLOR, strokeWidth: 2 };
}

function note(id: string, text: string, x: number, y: number, color: string = "#000000"): TextAnnotation {
    return { id, text, position: { x, y }, fontSize: 8, color };
}

export const STARTER_PLAYS: readonly StarterPlay[] = [
    {
        id: "starter-breakout-5man",
        name: "Breakout (5-Man)",
        description:
            "Standard controlled breakout out of the defensive zone. D1 retrieves behind the net and hits the strong-side winger on the wall; the winger chips to the center swinging through the middle with speed while the weak-side winger stretches the far wall.",
        playData: {
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
            annotations: [],
        },
    },
    {
        id: "starter-3man-weave",
        name: "3-Man Weave",
        description:
            "Full-ice passing and timing drill in three lanes. Pass and follow behind the next two skaters, filling the lane the puck came from. Emphasize crisp tape-to-tape passes, skating full speed through the crossovers, and finishing with a shot in stride.",
        playData: {
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
            annotations: [],
        },
    },
    {
        id: "starter-pp-umbrella",
        name: "Power-Play Umbrella",
        description:
            "1-3-1 umbrella setup on the power play. The point quarterback distributes to the flank shooters at the top of the circles for one-timers while the bumper occupies the middle of the box and the net-front player screens the goalie and hunts tips and rebounds.",
        playData: {
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
            annotations: [note("pp-note", "Screen", 168, 58)],
        },
    },
    {
        id: "starter-pk-box",
        name: "Penalty-Kill Box",
        description:
            "Basic box penalty kill in the defensive zone. All four killers keep sticks in passing lanes and shift as a unit toward the puck side, denying seam passes through the middle. Pressure only when the puck carrier bobbles or turns their back.",
        playData: {
            players: [
                player("pk-d1", "D1", 24, 29),
                player("pk-d2", "D2", 24, 56),
                player("pk-f1", "F1", 50, 29),
                player("pk-f2", "F2", 50, 56),
                player("pk-o1", "O1", 34, 8, OPPONENT),
                player("pk-o2", "O2", 70, 42.5, OPPONENT),
            ],
            drawings: [
                skate("pk-shift1", [24, 25], [28, 16]),
                skate("pk-shift2", [48, 25], [42, 17]),
                skate("pk-shift3", [24, 52], [26, 42]),
                skate("pk-shift4", [50, 52], [48, 42]),
            ],
            annotations: [note("pk-note", "Shift", 36, 70)],
        },
    },
    {
        id: "starter-122-forecheck",
        name: "1-2-2 Forecheck",
        description:
            "Conservative forecheck that traps the breakout. F1 angles the puck carrier to one wall and takes away the D-to-D pass; F2 and F3 seal the boards on each side while both defensemen hold the middle of the neutral zone to swallow chips and stretch passes.",
        playData: {
            players: [
                player("fc-f1", "F1", 152, 42.5),
                player("fc-f2", "F2", 128, 18),
                player("fc-f3", "F3", 128, 67),
                player("fc-d1", "D1", 92, 28),
                player("fc-d2", "D2", 92, 58),
                player("fc-o1", "O1", 180, 62, OPPONENT),
            ],
            drawings: [
                skate("fc-f1-route", [158, 46], [172, 58]),
                skate("fc-f2-route", [132, 15], [150, 10]),
                skate("fc-f3-route", [132, 70], [150, 75]),
                opponentRoute("fc-o1-route", [176, 68], [158, 76]),
            ],
            annotations: [note("fc-note", "Angle", 162, 52)],
        },
    },
    {
        id: "starter-low-cycle",
        name: "Low Cycle",
        description:
            "Offensive-zone puck protection below the goal line. The puck carrier drives up the half-wall and chips the puck back along the boards to the rotating teammate; the three forwards keep rotating corner, half-wall, and slot until a lane opens to attack the net.",
        playData: {
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
            annotations: [],
        },
    },
    {
        id: "starter-point-shot-screen",
        name: "Point Shot with Screen",
        description:
            "Simple offensive-zone set to generate traffic goals. The corner forward wins the puck and moves it to the point; the net-front forward establishes a screen at the top of the crease while the high slot forward crashes for tips and rebounds off the point shot.",
        playData: {
            players: [
                player("ps-d1", "D1", 130, 30),
                player("ps-d2", "D2", 130, 60),
                player("ps-nf", "NF", 184, 46),
                player("ps-f2", "F2", 170, 72),
                player("ps-f3", "F3", 155, 22),
            ],
            drawings: [
                pass("ps-pass1", [164, 66], [136, 36]),
                shot("ps-shot", [136, 31], [181, 41]),
                skate("ps-f3-route", [158, 27], [172, 38]),
            ],
            annotations: [note("ps-note", "Screen", 170, 57)],
        },
    },
    {
        id: "starter-dzone-coverage",
        name: "D-Zone Coverage",
        description:
            "Base defensive-zone structure. Defensemen own the net-front and battle in the corners, wingers cover the points, and the center supports low. Protect the house: keep opponents to the outside and box out on every shot.",
        playData: {
            players: [
                player("dz-g", "G", 13, 42.5, GOALIE),
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
            annotations: [note("dz-note", "House", 24, 49, ZONE_COLOR)],
        },
    },
    {
        id: "starter-nz-regroup",
        name: "Neutral-Zone Regroup",
        description:
            "Regroup to attack with speed instead of forcing a play at the offensive blue line. Forwards peel back, the defensemen move the puck D-to-D, and the center curls underneath to take the second pass in stride while both wingers stretch wide.",
        playData: {
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
            annotations: [],
        },
    },
];
