/**
 * Starter practice templates (goaltender-aware drills, spec R10; practice
 * timing, spec R12): station practices built from starter drills. Each opens
 * with a warm-up drill block, closes with a cool-down, and rotates its skater
 * groups through station blocks while the goalie station stays put.
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

export interface StarterTemplate {
    /** Stable slug */
    id: string;
    name: string;
    description: string;
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

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
    {
        id: "template-skills-stations",
        name: "Skills Stations",
        description:
            "A 60-minute skills practice for one goalie and any number of skaters: a goalie warm-up alongside skater edge work, a station block where the goalie stays on angles while two skater groups rotate between stickhandling and shooting every 6 minutes, then passing, small-area battles, a conditioning finish and a cool-down, with 2 minutes between blocks.",
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
];

/** The template as a plan document from the running app, ready for the import flow. */
export function starterTemplatePlan(template: StarterTemplate, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    return serializePlan(template.session, generator, now);
}
