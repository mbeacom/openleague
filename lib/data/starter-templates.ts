/**
 * Starter practice templates (goaltender-aware drills, spec R10): station
 * practices built from starter drills, each station block with a goalie
 * station on its own piece of ice.
 *
 * Plain plan-document inputs. A template becomes a PlanDocument only when a
 * coach uses it (starterTemplatePlan), so the generator is the running app's
 * and exportedAt is "now". Both import flows then re-parse it like any file.
 */
import { serializePlan, type PlanDocument, type PlanGenerator, type PlanSessionInput } from "@/lib/plan-document";
import { STARTER_PLAYS, type StarterPlay } from "@/lib/data/starter-plays";

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
    minutes: number;
    instructions?: string;
}

function starter(id: string): StarterPlay {
    const found = STARTER_PLAYS.find((play) => play.id === id);
    if (!found) throw new Error(`Unknown starter drill "${id}" in a starter template`);
    return found;
}

/** Each inner array is one block: its first drill runs on its own, the rest run with it as stations. */
function practice(title: string, durationMinutes: number, blocks: Station[][]): PlanSessionInput {
    const drills = blocks
        .flatMap((block) => block.map((station, slot) => ({ station, runsWithPrevious: slot > 0 })))
        .map(({ station, runsWithPrevious }, sequence) => {
            const play = starter(station.drill);
            return {
                sequence,
                duration: station.minutes,
                runsWithPrevious,
                instructions: station.instructions ?? "",
                name: play.name,
                description: play.description,
                focus: play.focus,
                goalies: play.goalies,
                playData: play.playData,
            };
        });
    return { title, durationMinutes, date: null, startTime: null, goaliesAttending: null, drills };
}

const GOALIE_STAYS = (minutes: number) => `Goalies stay at this station; skater groups rotate every ${minutes} minutes.`;
const ROTATE = (minutes: number) => `Skater groups rotate every ${minutes} minutes.`;
const EMPTY_NET = "With one goalie, shoot at an empty net or targets.";

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
    {
        id: "template-skills-stations",
        name: "Skills Stations",
        description:
            "A 60-minute skills practice for one goalie and any number of skaters: a goalie warm-up alongside skater edge work, a three-station block (goalie angles, stickhandling, shooting), then passing, small-area battles and a conditioning finish.",
        session: practice("Skills Stations", 60, [
            [
                { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies while the skaters work edges." },
                { drill: "starter-skate-edges-crossovers", minutes: 10 },
            ],
            [
                { drill: "starter-goalie-angles-depth", minutes: 15, instructions: GOALIE_STAYS(5) },
                { drill: "starter-skate-stickhandling", minutes: 15, instructions: ROTATE(5) },
                { drill: "starter-skate-wrist-shots", minutes: 15, instructions: `${ROTATE(5)} ${EMPTY_NET}` },
            ],
            [{ drill: "starter-skate-passing-lanes", minutes: 10 }],
            [{ drill: "starter-skate-small-area-2v2", minutes: 15, instructions: "Goalie in net; 30–40 second shifts." }],
            [{ drill: "starter-skate-stops-starts", minutes: 5 }],
        ]),
    },
    {
        id: "template-goalie-skater-rotation",
        name: "Goalie & Skater Rotation",
        description:
            "A 45-minute practice that keeps the goalie working the whole time: three stations at once on separate ice (goalie work, skating, puck skills), then breakaways and a small-area game to finish.",
        session: practice("Goalie & Skater Rotation", 45, [
            [
                { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies." },
                { drill: "starter-skate-transitions", minutes: 8, instructions: "Half the skaters; switch with edges at 4 minutes." },
                { drill: "starter-skate-edges-crossovers", minutes: 8, instructions: "Half the skaters; switch with transitions at 4 minutes." },
            ],
            [
                { drill: "starter-goalie-butterfly-recovery", minutes: 12, instructions: "Goalies stay at this station with a coach." },
                { drill: "starter-skate-stickhandling", minutes: 12, instructions: "Switch with puck protection at 6 minutes." },
                { drill: "starter-skate-puck-protection", minutes: 12, instructions: "Switch with stickhandling at 6 minutes." },
            ],
            [{ drill: "starter-goalie-breakaways", minutes: 10 }],
            [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: "Goalie in net; 30–40 second shifts." }],
        ]),
    },
    {
        id: "template-team-stations",
        name: "Team Practice with Stations",
        description:
            "A 60-minute team practice: two three-station skill blocks, each with a goalie station, then the full team on point shots with a screen, breakouts and the 3-man weave.",
        session: practice("Team Practice with Stations", 60, [
            [
                { drill: "starter-goalie-angles-depth", minutes: 15, instructions: GOALIE_STAYS(5) },
                { drill: "starter-skate-transitions", minutes: 15, instructions: ROTATE(5) },
                { drill: "starter-skate-small-area-2v2", minutes: 15, instructions: `${ROTATE(5)} ${EMPTY_NET}` },
            ],
            [
                { drill: "starter-goalie-rebound-control", minutes: 15, instructions: GOALIE_STAYS(5) },
                { drill: "starter-skate-stickhandling", minutes: 15, instructions: ROTATE(5) },
                { drill: "starter-skate-wrist-shots", minutes: 15, instructions: `${ROTATE(5)} ${EMPTY_NET}` },
            ],
            [{ drill: "starter-point-shot-screen", minutes: 10 }],
            [{ drill: "starter-breakout-5man", minutes: 10 }],
            [{ drill: "starter-3man-weave", minutes: 8 }],
        ]),
    },
];

/** The template as a plan document from the running app, ready for the import flow. */
export function starterTemplatePlan(template: StarterTemplate, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    return serializePlan(template.session, generator, now);
}
