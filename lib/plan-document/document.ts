/**
 * The portable practice-plan document (ADR-0020): one versioned JSON format
 * shared by the hosted app's export/import and the static planner.
 *
 * Pure: no server, Next or DOM imports. Self-contained by design: no database
 * ids, team, user, venue, segment, reservation or thumbnail. Parsing strips
 * unknown keys, and every diagram goes through upgradePlayData (v1 → v2).
 */

import { z } from "zod";
import type { PlayData } from "@/types/practice-planner";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { sessionWallMinutes, stationGroupError } from "@/lib/utils/session-timeline";

export const PLAN_FORMAT = "openleague.practice-plan" as const;
export const PLAN_VERSION = 1 as const;
export const MAX_PLAN_DRILLS = 50;
export const MAX_PLAN_FILE_BYTES = 2_000_000;
export const MAX_PLAN_LINK_BYTES = 65_536;

const MAX_TITLE_LENGTH = 100;
const MAX_MINUTES = 300;
const MAX_DRILL_NAME_LENGTH = 100;
/** Matches hosted createPlaySchema, so every hosted drill round-trips. */
export const MAX_DRILL_DESCRIPTION_LENGTH = 1000;
const MAX_INSTRUCTIONS_LENGTH = 2000;
const MAX_GENERATOR_LENGTH = 100;

export const NOT_A_PLAN_MESSAGE = "This file isn't an OpenLeague practice plan.";
export const NEWER_VERSION_MESSAGE = "This plan was made by a newer version of OpenLeague. Update to open it.";
export const INVALID_PLAN_MESSAGE = "This practice plan has problems and can't be opened.";

export type PlanGenerator = "openleague-hosted" | "openleague-static";

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const clean = (text: string) => text.replace(CONTROL_CHARS, "").trim();

function requiredText(max: number, label: string) {
    return z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`));
}

/** Missing or null reads as "". */
function optionalText(max: number, label: string) {
    return z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
        .nullish()
        .transform((value) => value ?? "");
}

function minutes(label: string) {
    return z
        .number({ message: `${label} must be a number of minutes` })
        .int(`${label} must be a whole number of minutes`)
        .min(1, `${label} must be at least 1 minute`)
        .max(MAX_MINUTES, `${label} must be at most ${MAX_MINUTES} minutes`);
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
    const match = LOCAL_DATE.exec(value);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const localDateSchema = z
    .string()
    .refine(isCalendarDate, "Date must be a real calendar date (YYYY-MM-DD)")
    .nullish()
    .transform((value) => value ?? null);

const localTimeSchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:mm (24-hour)")
    .nullish()
    .transform((value) => value ?? null);

/** Any stored diagram version; upgraded to v2. An unreadable one is an issue, not a blank board. */
const diagramSchema = z.unknown().transform((raw, ctx): PlayData => {
    const parsed = parseStoredPlayData(raw);
    if (parsed.ok) return parsed.data;
    ctx.addIssue({ code: "custom", message: "The diagram can't be read" });
    return z.NEVER;
});

const planDrillSchema = z.object({
    sequence: z.number({ message: "Sequence must be a number" }).int("Sequence must be a whole number").min(0, "Sequence can't be negative"),
    durationMinutes: minutes("Drill length"),
    runsWithPrevious: z.boolean({ message: "runsWithPrevious must be true or false" }).nullish().transform((value) => value ?? false),
    instructions: optionalText(MAX_INSTRUCTIONS_LENGTH, "Instructions"),
    drill: z.object({
        name: requiredText(MAX_DRILL_NAME_LENGTH, "Drill name"),
        description: optionalText(MAX_DRILL_DESCRIPTION_LENGTH, "Description"),
        playData: diagramSchema,
    }),
});

const planSessionSchema = z
    .object({
        title: requiredText(MAX_TITLE_LENGTH, "Title"),
        durationMinutes: minutes("Session length"),
        date: localDateSchema,
        startTime: localTimeSchema,
        drills: z.array(planDrillSchema).max(MAX_PLAN_DRILLS, `A plan can hold at most ${MAX_PLAN_DRILLS} drills`),
    })
    .superRefine((session, ctx) => {
        // The same rules the hosted save enforces (createPracticeSession).
        const timeline = session.drills.map((d) => ({
            sequence: d.sequence,
            duration: d.durationMinutes,
            runsWithPrevious: d.runsWithPrevious,
        }));
        const sequences = timeline.map((t) => t.sequence).sort((a, b) => a - b);
        if (sequences.some((sequence, index) => sequence !== index)) {
            ctx.addIssue({ code: "custom", path: ["drills"], message: "Drill sequences must run 0, 1, 2… with no gaps or repeats" });
            return;
        }
        const groupError = stationGroupError(timeline);
        if (groupError) ctx.addIssue({ code: "custom", path: ["drills"], message: groupError });
        const wall = sessionWallMinutes(timeline);
        if (wall > session.durationMinutes) {
            ctx.addIssue({
                code: "custom",
                path: ["durationMinutes"],
                message: `Practice timeline (${wall} min) exceeds session duration (${session.durationMinutes} min)`,
            });
        }
    })
    .transform((session) => ({ ...session, drills: [...session.drills].sort((a, b) => a.sequence - b.sequence) }));

export const planDocumentSchema = z.object({
    format: z.literal(PLAN_FORMAT),
    version: z.literal(PLAN_VERSION),
    exportedAt: z.iso.datetime({ offset: true, message: "exportedAt must be an ISO date-time" }),
    generator: z.string().trim().min(1).max(MAX_GENERATOR_LENGTH),
    session: planSessionSchema,
});

export type PlanDocument = z.output<typeof planDocumentSchema>;
export type PlanDrill = PlanDocument["session"]["drills"][number];

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** The minimal session view an exporter supplies (hosted detail page, static store). */
export interface PlanSessionInput {
    title: string;
    durationMinutes: number;
    /** YYYY-MM-DD, local calendar date */
    date: string | null;
    /** HH:mm, local wall clock */
    startTime: string | null;
    drills: Array<{
        sequence: number;
        duration: number;
        runsWithPrevious: boolean;
        instructions: string | null;
        name: string;
        description: string | null;
        /** null = unreadable; exported as an empty board */
        playData: PlayData | null;
    }>;
}

/**
 * Builds a document from a session. Picks fields explicitly, so ids and
 * thumbnails on the input never leak; sorts and renumbers sequences; the
 * first drill never runs with a previous one.
 */
export function serializePlan(input: PlanSessionInput, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    const drills = [...input.drills]
        .sort((a, b) => a.sequence - b.sequence)
        .map((d, index) => ({
            sequence: index,
            durationMinutes: d.duration,
            runsWithPrevious: index === 0 ? false : d.runsWithPrevious,
            instructions: d.instructions ?? "",
            drill: {
                name: d.name,
                description: d.description ?? "",
                playData: d.playData ?? createEmptyPlayData(),
            },
        }));
    return {
        format: PLAN_FORMAT,
        version: PLAN_VERSION,
        exportedAt: now.toISOString(),
        generator,
        session: {
            title: input.title,
            durationMinutes: input.durationMinutes,
            date: input.date,
            startTime: input.startTime,
            drills,
        },
    };
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export type PlanErrorCode = "not-a-plan" | "newer-version" | "invalid";

export interface PlanError {
    code: PlanErrorCode;
    message: string;
    /** For "invalid": one readable line per problem */
    issues?: string[];
}

export type ParsePlanResult = { ok: true; plan: PlanDocument } | { ok: false; error: PlanError };

function drillNameAt(raw: unknown, index: number): string | null {
    const drills = (raw as { session?: { drills?: unknown } }).session?.drills;
    if (!Array.isArray(drills)) return null;
    const name = (drills[index] as { drill?: { name?: unknown } } | undefined)?.drill?.name;
    return typeof name === "string" && name.trim() ? clean(name).slice(0, MAX_DRILL_NAME_LENGTH) : null;
}

function describeIssue(issue: z.ZodError["issues"][number], raw: unknown): string {
    const [scope, list, index] = issue.path;
    if (scope === "session" && list === "drills" && typeof index === "number") {
        const name = drillNameAt(raw, index);
        return `Drill ${index + 1}${name ? ` ("${name}")` : ""}: ${issue.message}`;
    }
    return issue.message;
}

/** format → version → schema, so a newer file never reports field noise. */
export function parsePlan(raw: unknown): ParsePlanResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw) || (raw as { format?: unknown }).format !== PLAN_FORMAT) {
        return { ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } };
    }
    const version = (raw as { version?: unknown }).version;
    if (typeof version === "number" && Number.isInteger(version) && version > PLAN_VERSION) {
        return { ok: false, error: { code: "newer-version", message: NEWER_VERSION_MESSAGE } };
    }
    const result = planDocumentSchema.safeParse(raw);
    if (!result.success) {
        return {
            ok: false,
            error: {
                code: "invalid",
                message: INVALID_PLAN_MESSAGE,
                issues: result.error.issues.map((issue) => describeIssue(issue, raw)),
            },
        };
    }
    return { ok: true, plan: result.data };
}

// ---------------------------------------------------------------------------
// File name and editor mapping
// ---------------------------------------------------------------------------

const MAX_SLUG_LENGTH = 60;

/** `<slug>.olplan.json`: lowercase ASCII, hyphen-joined, ≤ 60 chars, else `practice-plan`. */
export function planFileName(title: string): string {
    const slug = title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/, "");
    return `${slug || "practice-plan"}.olplan.json`;
}

export interface PlanEditorDrill {
    /** Stable per-drill key for React lists */
    key: string;
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    instructions: string;
    name: string;
    description: string;
    playData: PlayData;
}

export interface PlanEditorSession {
    title: string;
    duration: number;
    date: string | null;
    startTime: string | null;
    plays: PlanEditorDrill[];
}

/** The plan as timeline plays (TimelinePlay-compatible), for the import preview. */
export function planToEditorSession(plan: PlanDocument): PlanEditorSession {
    return {
        title: plan.session.title,
        duration: plan.session.durationMinutes,
        date: plan.session.date,
        startTime: plan.session.startTime,
        plays: plan.session.drills.map((d) => ({
            key: `plan-drill-${d.sequence}`,
            sequence: d.sequence,
            duration: d.durationMinutes,
            runsWithPrevious: d.runsWithPrevious,
            instructions: d.instructions,
            name: d.drill.name,
            description: d.drill.description,
            playData: d.drill.playData,
        })),
    };
}
