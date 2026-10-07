/**
 * Starter practice templates (goaltender-aware drills, spec R10; practice
 * timing, spec R12; age-group templates, spec R5): station practices built
 * from starter drills. Each opens with a warm-up drill or block, closes with a
 * cool-down, and rotates its skater groups through station blocks while the
 * goalie station stays put. Each carries its own age groups.
 *
 * Plain plan-document inputs. A template becomes a PlanDocument only when a
 * coach uses it (starterTemplatePlan), so the generator is the running app's
 * and exportedAt is "now". Both import flows then re-parse it like any file.
 */
import {
    serializePlan,
    type PlanBlockInput,
    type PlanDocument,
    type PlanDrillInput,
    type PlanGenerator,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { STARTER_PLAYS, type StarterPlay } from "@/lib/data/starter-plays";
import type { BlockKind } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";

export interface StarterTemplate {
    /** Stable slug */
    id: string;
    name: string;
    description: string;
    /** The template's own ages ([] = every age); never derived from its drills (R2). */
    ageGroups: readonly AgeGroup[];
    session: PlanSessionInput;
}

interface Station {
    /** A starter drill id */
    drill: string;
    /** In a rotating block: the rotation's minutes, or the whole block for a stays station */
    minutes: number;
    instructions?: string;
    /** Doesn't rotate: the goalie station */
    stays?: boolean;
}

/** One block: its first drill runs on its own, the rest run with it as stations, rotating every N minutes when set. */
interface DrillBlock {
    stations: Station[];
    rotateEveryMinutes?: number;
}

/** A warm-up, water break, transition or cool-down row. */
interface TimeBlock {
    block: BlockKind;
    minutes: number;
    note?: string;
}

function starter(id: string): StarterPlay {
    const found = STARTER_PLAYS.find((play) => play.id === id);
    if (!found) throw new Error(`Unknown starter drill "${id}" in a starter template`);
    return found;
}

/**
 * Every template is built for one goalie, so goalies attending starts at 1 and
 * the goalie warnings work as soon as it is imported; the coach can change it in Edit.
 */
function practice(title: string, durationMinutes: number, transitionMinutes: number, rows: Array<DrillBlock | TimeBlock>): PlanSessionInput {
    let sequence = 0;
    const drills = rows.flatMap((row): Array<PlanDrillInput | PlanBlockInput> => {
        if ("block" in row) {
            return [{ kind: row.block, sequence: sequence++, duration: row.minutes, runsWithPrevious: false, instructions: row.note ?? null, label: null }];
        }
        return row.stations.map((station, slot): PlanDrillInput => {
            const play = starter(station.drill);
            return {
                sequence: sequence++,
                duration: station.minutes,
                runsWithPrevious: slot > 0,
                instructions: station.instructions ?? "",
                name: play.name,
                description: play.description,
                focus: play.focus,
                goalies: play.goalies,
                ageGroups: play.ageGroups,
                stays: station.stays ?? false,
                rotateEveryMinutes: slot === 0 ? (row.rotateEveryMinutes ?? null) : null,
                playData: play.playData,
            };
        });
    });
    return { title, durationMinutes, date: null, startTime: null, goaliesAttending: 1, transitionMinutes, drills };
}

const EMPTY_NET = "If a second goalie is free, put them in net; otherwise shoot at the empty net or targets.";
const SMALL_AREA = "Goalie in net; 30–40 second shifts.";
/** Who shoots at a goalie station that stays: no skater group visits it. */
const COACH_FIVE_SPOTS = "A coach shoots from the five spots.";
/** Who shoots at the quarter-ice goalie station that stays. */
const COACH_SHOOTS_QUARTER = "A coach shoots; a helper feeds the passes.";

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
    {
        id: "template-skills-stations",
        name: "Skills Stations",
        description:
            "A 60-minute skills practice for one goalie and any number of skaters: a goalie warm-up alongside skater edge work, a station block where the goalie stays on angles while two skater groups rotate between stickhandling and shooting every 6 minutes, then passing, small-area battles, a conditioning finish and a cool-down, with 2 minutes between blocks.",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        session: practice("Skills Stations", 60, 2, [
            {
                stations: [
                    { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies while the skaters work edges." },
                    { drill: "starter-skate-edges-crossovers", minutes: 8 },
                ],
            },
            {
                rotateEveryMinutes: 6,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 12, stays: true, instructions: COACH_FIVE_SPOTS },
                    { drill: "starter-skate-stickhandling", minutes: 6 },
                    { drill: "starter-skate-wrist-shots", minutes: 6, instructions: EMPTY_NET },
                ],
            },
            { stations: [{ drill: "starter-skate-passing-lanes", minutes: 8 }] },
            { stations: [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: SMALL_AREA }] },
            { stations: [{ drill: "starter-skate-stops-starts", minutes: 5 }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then stretch." },
        ]),
    },
    {
        id: "template-goalie-skater-rotation",
        name: "Goalie & Skater Rotation",
        description:
            "A 45-minute practice that keeps the goalie working the whole time: a goalie warm-up beside two skating stations, then goalie angles while two skater groups rotate between stickhandling and puck protection every 6 minutes, then breakaways, a small-area game and a short cool-down.",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        session: practice("Goalie & Skater Rotation", 45, 0, [
            {
                stations: [
                    { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies." },
                    { drill: "starter-skate-transitions", minutes: 8, instructions: "Half the skaters; the other half work edges." },
                    { drill: "starter-skate-edges-crossovers", minutes: 8, instructions: "Half the skaters; the other half work pivots." },
                ],
            },
            {
                rotateEveryMinutes: 6,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 12, stays: true, instructions: COACH_FIVE_SPOTS },
                    { drill: "starter-skate-stickhandling", minutes: 6 },
                    { drill: "starter-skate-puck-protection", minutes: 6 },
                ],
            },
            { stations: [{ drill: "starter-goalie-breakaways", minutes: 10 }] },
            { stations: [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: SMALL_AREA }] },
            { block: "cooldown", minutes: 3, note: "Easy laps." },
        ]),
    },
    {
        id: "template-team-stations",
        name: "Team Practice with Stations",
        description:
            "A 60-minute team practice: the 3-man weave to warm up skaters and goalie, two station blocks with the goalie staying on angles and then on rebounds while two skater groups rotate every 5 minutes and then every 6 minutes, the full team on point shots with a screen and breakouts, and a cool-down, with a minute between blocks.",
        ageGroups: ["u12", "u14", "u16plus"],
        session: practice("Team Practice with Stations", 60, 1, [
            { stations: [{ drill: "starter-3man-weave", minutes: 8, instructions: "Finish on the goalie. The first reps are easy shots to the body to warm the goalie up." }] },
            {
                rotateEveryMinutes: 5,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 10, stays: true, instructions: COACH_FIVE_SPOTS },
                    { drill: "starter-skate-transitions", minutes: 5 },
                    { drill: "starter-skate-puck-protection", minutes: 5 },
                ],
            },
            {
                rotateEveryMinutes: 6,
                stations: [
                    {
                        drill: "starter-goalie-rebound-control",
                        minutes: 12,
                        stays: true,
                        instructions: "A coach shoots from the high slot; two extra skaters or coaches crash the posts.",
                    },
                    { drill: "starter-skate-stickhandling", minutes: 6 },
                    { drill: "starter-skate-wrist-shots", minutes: 6, instructions: EMPTY_NET },
                ],
            },
            { stations: [{ drill: "starter-point-shot-screen", minutes: 10 }] },
            { stations: [{ drill: "starter-breakout-5man", minutes: 10 }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then stretch." },
        ]),
    },
    {
        id: "template-8u-stations",
        name: "8U Station Practice",
        description:
            "A 60-minute, station-based, ADM-style practice for 6U and 8U: a warm-up, then four stations in the quarters of the ice where the goalie stays in net while three skater groups rotate between edges, puck control and 2-on-2 battles every 10 minutes, a water break, keep-away games in every quarter, and a cool-down.",
        ageGroups: ["u6", "u8"],
        session: practice("8U Station Practice", 60, 0, [
            { block: "warmup", minutes: 8, note: "Easy laps with a puck, then a few starts and stops." },
            {
                rotateEveryMinutes: 10,
                stations: [
                    { drill: "starter-goalie-quarter-station", minutes: 30, stays: true, instructions: COACH_SHOOTS_QUARTER },
                    { drill: "starter-skate-edge-circuit", minutes: 10 },
                    { drill: "starter-skate-obstacle-lane", minutes: 10 },
                    { drill: "starter-skate-quarter-2v2", minutes: 10 },
                ],
            },
            { block: "break", minutes: 2 },
            { stations: [{ drill: "starter-skate-keep-away", minutes: 15, instructions: "One game in each quarter of the ice." }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then a stretch." },
        ]),
    },
    {
        id: "template-10u-stations",
        name: "10U Station Practice",
        description:
            "A 60-minute, station-based, ADM-style practice for 10U: a warm-up, then four stations where the goalie stays in net in one quarter while three skater groups rotate between a give-and-go passing triangle, quick-release shooting and a 3-on-3 cross-ice game every 10 minutes, a water break, small-area 2-on-2 battles and a cool-down.",
        ageGroups: ["u10"],
        session: practice("10U Station Practice", 60, 0, [
            { block: "warmup", minutes: 10, note: "Laps with a puck, edges on the circles, then a few hard starts." },
            {
                rotateEveryMinutes: 10,
                stations: [
                    { drill: "starter-goalie-quarter-station", minutes: 30, stays: true, instructions: COACH_SHOOTS_QUARTER },
                    { drill: "starter-skate-give-and-go", minutes: 10 },
                    { drill: "starter-skate-quick-release", minutes: 10 },
                    { drill: "starter-game-3v3-cross-ice", minutes: 10 },
                ],
            },
            { block: "break", minutes: 3 },
            { stations: [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: SMALL_AREA }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then a stretch." },
        ]),
    },
    {
        id: "template-12u-skills-games",
        name: "12U Skills and Small Games",
        description:
            "A 60-minute, station-based, ADM-style practice for 12U and 14U: a warm-up, then three zone stations where the goalie stays on angles while two skater groups rotate between a 3-on-3 cross-ice game and wrist shots every 7 minutes, partner passing the length of the ice, a 4-on-4 cross-ice game and a cool-down, with a minute between blocks.",
        ageGroups: ["u12", "u14"],
        session: practice("12U Skills and Small Games", 60, 1, [
            { block: "warmup", minutes: 8, note: "Laps with a puck, then crossovers around every circle." },
            {
                rotateEveryMinutes: 7,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 14, stays: true, instructions: COACH_FIVE_SPOTS },
                    { drill: "starter-game-3v3-cross-ice", minutes: 7 },
                    { drill: "starter-skate-wrist-shots", minutes: 7, instructions: EMPTY_NET },
                ],
            },
            { stations: [{ drill: "starter-skate-passing-lanes", minutes: 8 }] },
            { stations: [{ drill: "starter-game-4v4-cross-ice", minutes: 20, instructions: "Two games, one in each end zone; the goalie plays in one of them." }] },
            { block: "cooldown", minutes: 6, note: "Easy laps, then a stretch." },
        ]),
    },
    {
        id: "template-8u-tag-stops-battles",
        name: "8U Tag, Stops and Battles",
        description:
            "A 50-minute practice for 8U that needs one net, one cone and a goalie: backward tag while a coach warms up the goalie, then two skater groups rotate every 8 minutes between 1-on-1 to 2-on-1 low play on the goalie and painting the cones, a water break, a 3-on-3 designated-shooter game on the same net, and a cool-down.",
        ageGroups: ["u8"],
        session: practice("8U Tag, Stops and Battles", 50, 0, [
            {
                stations: [
                    { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalie while the skaters play backward tag." },
                    { drill: "starter-skate-backward-tag", minutes: 8 },
                ],
            },
            {
                rotateEveryMinutes: 8,
                stations: [
                    {
                        drill: "starter-skate-low-1v1-2v1",
                        minutes: 8,
                        instructions: "At least four skaters here. The first skater to the puck is on offense; the coach adds a second attacker when it helps. The defender's pass back must be deliberate.",
                    },
                    { drill: "starter-skate-paint-the-cones", minutes: 8, instructions: "Right foot, then left foot: alternate the lead foot every stop." },
                ],
            },
            { block: "break", minutes: 2 },
            { stations: [{ drill: "starter-game-3v3-designated-shooter", minutes: 18, instructions: "One designated shooter per team each shift; change shooters every shift." }] },
            { block: "cooldown", minutes: 6, note: "Easy laps, then a stretch." },
        ]),
    },
    {
        id: "template-8u-partner-puck-forecheck",
        name: "8U Partner Puck Control and Forecheck",
        description:
            "A 50-minute practice for 8U that needs one net, two cones and a goalie: trucks and trailers while a coach warms up the goalie, then two skater groups rotate every 9 minutes between mirror puck control across the red line and forecheck vs. breakout on the goalie, a water break, a chariot race relay with the two cones moved to the lanes, and a cool-down.",
        ageGroups: ["u8"],
        session: practice("8U Partner Puck Control and Forecheck", 50, 0, [
            {
                stations: [
                    { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalie while the skaters play trucks and trailers." },
                    { drill: "starter-skate-trucks-trailers", minutes: 8 },
                ],
            },
            {
                rotateEveryMinutes: 9,
                stations: [
                    { drill: "starter-skate-mirror-puck-control", minutes: 9, instructions: "Pairs straddle the center red line, one puck each." },
                    {
                        drill: "starter-skate-forecheck-breakout",
                        minutes: 9,
                        instructions: "The goalie plays in net. Set the two cones as the exit gate; three skaters go at a time and the rest wait by the boards.",
                    },
                ],
            },
            { block: "break", minutes: 3 },
            { stations: [{ drill: "starter-skate-chariot-relay", minutes: 15, instructions: "Move the two cones to the far end of the lanes. Two even teams; the goalie can join one." }] },
            { block: "cooldown", minutes: 6, note: "Easy laps, then a stretch." },
        ]),
    },
];

/** The template as a plan document from the running app, ready for the import flow. */
export function starterTemplatePlan(template: StarterTemplate, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    return serializePlan(template.session, generator, now);
}
