/**
 * The portable practice-plan document (ADR-0020): one versioned JSON format
 * shared by the hosted app's export/import and the static planner.
 *
 * Pure: no server, Next or DOM imports. Self-contained by design: no database
 * ids, team, user, venue, segment, reservation or thumbnail. Parsing strips
 * unknown keys, and every diagram goes through upgradePlayData (v1 → v2).
 */

import { z } from "zod";
import { BLOCK_KINDS, MAX_ROW_STAFF, MAX_SESSION_STAFF, PLAY_FOCUS, PLAY_GOALIES, STAFF_NAME_MAX, type BlockKind, type PlayData, type PlayFocus, type PlayGoalies } from "@/types/practice-planner";
import {
    ROW_STAFF_LIMIT_MESSAGE,
    STAFF_LIMIT_MESSAGE,
    STAFF_NAME_LENGTH_MESSAGE,
    STAFF_NAME_REQUIRED_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
    cleanStaffName,
    rowStaffError,
    staffNameKey,
} from "@/lib/utils/session-staff";
import { drillTags, toGoaliesAttending, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";
import { ageGroupsSchema, toAgeGroups, type AgeGroup } from "@/lib/utils/age-groups";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { CONTROL_CHARS, isBlockRow, toBlockLabel, toRotateEveryMinutes, toTransitionMinutes } from "@/lib/utils/session-rows";
import { normalizeGroups, sessionRowsError, sessionWallMinutes, settleRotations, withRotationMinutes } from "@/lib/utils/session-timeline";

export const PLAN_FORMAT = "openleague.practice-plan" as const;
export const PLAN_VERSION = 1 as const;
export const MAX_PLAN_DRILLS = 50;
/**
 * Kept under Next's default 1 MB server-action body limit (next.config.ts sets
 * no serverActions.bodySizeLimit): an imported plan is sent to the import
 * action as JSON, so a larger file would preview and then fail on Import.
 */
export const MAX_PLAN_FILE_BYTES = 900_000;
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
export const FILE_TOO_LARGE_MESSAGE = `This file is too large to be a practice plan (the limit is ${MAX_PLAN_FILE_BYTES / 1000} KB).`;
/** A plan row's kind is unknown (session-rows has its own ROW_KIND_MESSAGE for the save schema). */
export const PLAN_ROW_KIND_MESSAGE = "Row kind must be drill, warmup, break, transition or cooldown";

export type PlanGenerator = "openleague-hosted" | "openleague-static";

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

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

/**
 * Advisory fields (spec R13): missing, null or unrecognized reads as the
 * default, so a tag or a count never blocks opening a plan.
 */
// z.preprocess, not z.unknown().transform: Zod v4 rejects a missing key for a
// transform, while a preprocess runs on it, so older files take the defaults.
const focusSchema = z.preprocess(toPlayFocus, z.enum(PLAY_FOCUS));
const goaliesSchema = z.preprocess(toPlayGoalies, z.enum(PLAY_GOALIES));
const goaliesAttendingSchema = z.preprocess(toGoaliesAttending, z.number().int().nullable());
/**
 * Drill age groups (age-group templates spec R2). Missing or null is every
 * age: every file written before them. Strict, unlike focus and goalies: an
 * unknown value or a repeat is a broken file, reported as a "Drill N" issue.
 */
const planAgeGroupsSchema = ageGroupsSchema.nullish().transform((groups): AgeGroup[] => groups ?? []);

// Practice timing (spec R6): read leniently like the goalie fields, so a stray
// value never makes a plan unreadable. A rotation on the wrong row is still a
// rule violation (superRefine below), not a value problem.
const staysSchema = z.preprocess((value) => value === true, z.boolean());
const rotateEveryMinutesSchema = z.preprocess(toRotateEveryMinutes, z.number().int().nullable());
const blockLabelSchema = z.preprocess(toBlockLabel, z.string().nullable());
const transitionMinutesSchema = z.preprocess(toTransitionMinutes, z.number().int());

// Practice staff (spec R6): names only, never ids or links. Strict, unlike the
// advisory fields: a row naming someone off the list is a broken file.
const planStaffNameSchema = z
    .string({ message: "A staff name must be text" })
    .transform(cleanStaffName)
    .pipe(z.string().min(1, STAFF_NAME_REQUIRED_MESSAGE).max(STAFF_NAME_MAX, STAFF_NAME_LENGTH_MESSAGE));

/** A list of staff names. Missing or null is none: every file written before practice staff. */
function planStaffSchema(max: number, message: string) {
    return z
        .array(planStaffNameSchema, { message: "Staff must be a list of names" })
        .max(max, message)
        .nullish()
        .transform((names) => names ?? []);
}

const sequenceSchema = z.number({ message: "Sequence must be a number" }).int("Sequence must be a whole number").min(0, "Sequence can't be negative");

const planDrillSchema = z.object({
    kind: z.literal("drill"),
    sequence: sequenceSchema,
    durationMinutes: minutes("Drill length"),
    runsWithPrevious: z.boolean({ message: "runsWithPrevious must be true or false" }).nullish().transform((value) => value ?? false),
    instructions: optionalText(MAX_INSTRUCTIONS_LENGTH, "Instructions"),
    stays: staysSchema,
    rotateEveryMinutes: rotateEveryMinutesSchema,
    staff: planStaffSchema(MAX_ROW_STAFF, ROW_STAFF_LIMIT_MESSAGE),
    drill: z.object({
        name: requiredText(MAX_DRILL_NAME_LENGTH, "Drill name"),
        description: optionalText(MAX_DRILL_DESCRIPTION_LENGTH, "Description"),
        focus: focusSchema,
        goalies: goaliesSchema,
        ageGroups: planAgeGroupsSchema,
        playData: diagramSchema,
    }),
});

/** A warm-up, break, transition or cool-down: no drill, no diagram, no tags (unknown keys are stripped). */
const planBlockSchema = z.object({
    kind: z.enum(BLOCK_KINDS),
    sequence: sequenceSchema,
    durationMinutes: minutes("Block length"),
    instructions: optionalText(MAX_INSTRUCTIONS_LENGTH, "Note"),
    label: blockLabelSchema,
    staff: planStaffSchema(MAX_ROW_STAFF, ROW_STAFF_LIMIT_MESSAGE),
});

/** A row without a kind is a drill: every file written before practice timing. */
function withDefaultKind(raw: unknown): unknown {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const kind = (raw as { kind?: unknown }).kind;
    return kind === undefined || kind === null ? { ...(raw as object), kind: "drill" } : raw;
}

const planEntrySchema = z.preprocess(
    withDefaultKind,
    z.discriminatedUnion("kind", [planDrillSchema, planBlockSchema], { message: PLAN_ROW_KIND_MESSAGE }),
);

/** A plan row as a timeline row: what the row rules and the rotation's minutes read. */
function timelineRow(entry: z.output<typeof planEntrySchema>) {
    return {
        sequence: entry.sequence,
        duration: entry.durationMinutes,
        kind: entry.kind,
        runsWithPrevious: entry.kind === "drill" ? entry.runsWithPrevious : false,
        stays: entry.kind === "drill" ? entry.stays : false,
        rotateEveryMinutes: entry.kind === "drill" ? entry.rotateEveryMinutes : null,
    };
}

const planSessionSchema = z
    .object({
        title: requiredText(MAX_TITLE_LENGTH, "Title"),
        durationMinutes: minutes("Session length"),
        date: localDateSchema,
        startTime: localTimeSchema,
        goaliesAttending: goaliesAttendingSchema,
        transitionMinutes: transitionMinutesSchema,
        staff: planStaffSchema(MAX_SESSION_STAFF, STAFF_LIMIT_MESSAGE),
        drills: z.array(planEntrySchema).max(MAX_PLAN_DRILLS, `A plan can hold at most ${MAX_PLAN_DRILLS} rows (drills and blocks)`),
    })
    .superRefine((session, ctx) => {
        // Practice staff (spec R6): names unique ignoring case; each row's names on the list.
        const listed = new Set<string>();
        for (const name of session.staff) {
            const key = staffNameKey(name);
            if (listed.has(key)) {
                ctx.addIssue({ code: "custom", path: ["staff"], message: STAFF_NAME_TAKEN_MESSAGE });
                break;
            }
            listed.add(key);
        }
        session.drills.forEach((entry, index) => {
            // A row over the limit already has its issue from the entry's .max(MAX_ROW_STAFF):
            // that issue is continuable, so this refine still runs, and checking it again
            // would report ROW_STAFF_LIMIT_MESSAGE twice on the same path.
            if (entry.staff.length > MAX_ROW_STAFF) return;
            const error = rowStaffError(entry.staff.map(staffNameKey), listed);
            if (error) ctx.addIssue({ code: "custom", path: ["drills", index, "staff"], message: error });
        });
        // The same rules the hosted save enforces (createPracticeSession).
        const timeline = session.drills.map(timelineRow);
        const sequences = timeline.map((t) => t.sequence).sort((a, b) => a - b);
        if (sequences.some((sequence, index) => sequence !== index)) {
            ctx.addIssue({ code: "custom", path: ["drills"], message: "Drill sequences must run 0, 1, 2… with no gaps or repeats" });
            return;
        }
        const ruleError = sessionRowsError(timeline);
        if (ruleError) ctx.addIssue({ code: "custom", path: ["drills"], message: ruleError });
        const wall = sessionWallMinutes(timeline, session.transitionMinutes);
        if (wall > session.durationMinutes) {
            ctx.addIssue({
                code: "custom",
                path: ["durationMinutes"],
                message: `Practice timeline (${wall} min) exceeds session duration (${session.durationMinutes} min)`,
            });
        }
    })
    .transform((session) => {
        // Sorted, and each rotating station at the minutes the editor shows (M, or the whole
        // block when it stays), so both importers store what every view shows (spec R3).
        const drills = [...session.drills].sort((a, b) => a.sequence - b.sequence);
        const timed = withRotationMinutes(drills.map(timelineRow));
        return {
            ...session,
            drills: drills.map((entry, index) =>
                timed[index].duration === entry.durationMinutes ? entry : { ...entry, durationMinutes: timed[index].duration },
            ),
        };
    });

export const planDocumentSchema = z.object({
    format: z.literal(PLAN_FORMAT),
    version: z.literal(PLAN_VERSION),
    exportedAt: z.iso.datetime({ offset: true, message: "exportedAt must be an ISO date-time" }),
    generator: z.string().trim().min(1).max(MAX_GENERATOR_LENGTH),
    session: planSessionSchema,
});

export type PlanDocument = z.output<typeof planDocumentSchema>;
/** One row of a plan: a drill or a block. */
export type PlanEntry = PlanDocument["session"]["drills"][number];
export type PlanDrill = Extract<PlanEntry, { kind: "drill" }>;
export type PlanBlock = Extract<PlanEntry, { kind: BlockKind }>;

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** A drill row an exporter supplies. */
export interface PlanDrillInput {
    kind?: "drill";
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    instructions: string | null;
    name: string;
    description: string | null;
    /** Absent = the default tag */
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    /** Absent = none (every age). Unknown values and repeats are dropped on export. */
    ageGroups?: readonly AgeGroup[];
    /** Absent = false / null */
    stays?: boolean;
    rotateEveryMinutes?: number | null;
    /** Staff names running this row; absent = none. Names not on the session's list are dropped. */
    staff?: string[];
    /** null = unreadable; exported as an empty board */
    playData: PlayData | null;
}

/** A block row an exporter supplies: no drill fields. */
export interface PlanBlockInput {
    kind: BlockKind;
    sequence: number;
    duration: number;
    /** Always false (spec R3); present so a plan's rows are timeline rows. Never written to the document. */
    runsWithPrevious: false;
    /** The block's note */
    instructions: string | null;
    label: string | null;
    /** Staff names running this row; absent = none. Names not on the session's list are dropped. */
    staff?: string[];
}

/** The minimal session view an exporter supplies (hosted detail page, static store). */
export interface PlanSessionInput {
    title: string;
    durationMinutes: number;
    /** YYYY-MM-DD, local calendar date */
    date: string | null;
    /** HH:mm, local wall clock */
    startTime: string | null;
    /** null or absent = not set */
    goaliesAttending?: number | null;
    /** Minutes between blocks; absent = 0 */
    transitionMinutes?: number;
    /** The practice's staff names; absent = none. */
    staff?: string[];
    drills: Array<PlanDrillInput | PlanBlockInput>;
}

/** The staff an export writes: cleaned names, the first spelling wins ignoring case, up to 12 names of 1–60 characters. */
function exportStaff(names: readonly string[] | undefined): string[] {
    const listed = new Set<string>();
    const staff: string[] = [];
    for (const raw of names ?? []) {
        const name = cleanStaffName(raw);
        const key = staffNameKey(name);
        if (!name || name.length > STAFF_NAME_MAX || listed.has(key) || staff.length >= MAX_SESSION_STAFF) continue;
        listed.add(key);
        staff.push(name);
    }
    return staff;
}

/** A row's staff on export: names on the list (in the list's spelling), each once, at most 4. */
function exportRowStaff(names: readonly string[] | undefined, listed: ReadonlyMap<string, string>): string[] {
    const row: string[] = [];
    for (const raw of names ?? []) {
        const name = listed.get(staffNameKey(raw));
        if (name && !row.includes(name) && row.length < MAX_ROW_STAFF) row.push(name);
    }
    return row;
}

/**
 * Builds a document from a session. Picks fields explicitly, so ids and
 * thumbnails on the input never leak. Sorts and renumbers, and applies the
 * editor's row rules (the first row and a row after a block never run with a
 * previous one; a rotation that can't run is dropped), and keeps only staff
 * names that fit the plan's rules, so every export imports.
 */
export function serializePlan(input: PlanSessionInput, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    const rows = settleRotations(normalizeGroups([...input.drills].sort((a, b) => a.sequence - b.sequence)));
    const staff = exportStaff(input.staff);
    const listed = new Map(staff.map((name) => [staffNameKey(name), name]));
    const drills = rows.map((row, index): PlanEntry => {
        if (isBlockRow(row)) {
            return { kind: row.kind, sequence: index, durationMinutes: row.duration, instructions: row.instructions ?? "", label: toBlockLabel(row.label), staff: exportRowStaff(row.staff, listed) };
        }
        return {
            kind: "drill",
            sequence: index,
            durationMinutes: row.duration,
            runsWithPrevious: row.runsWithPrevious,
            instructions: row.instructions ?? "",
            stays: row.stays ?? false,
            rotateEveryMinutes: row.rotateEveryMinutes ?? null,
            staff: exportRowStaff(row.staff, listed),
            drill: {
                name: row.name,
                description: row.description ?? "",
                ...drillTags(row),
                ageGroups: toAgeGroups(row.ageGroups),
                playData: row.playData ?? createEmptyPlayData(),
            },
        };
    });
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
            goaliesAttending: toGoaliesAttending(input.goaliesAttending),
            transitionMinutes: toTransitionMinutes(input.transitionMinutes),
            staff,
            drills,
        },
    };
}

/** UTF-8 byte length of the plan's JSON: roughly what the import action's request body carries. */
export function planByteLength(plan: PlanDocument): number {
    return new TextEncoder().encode(JSON.stringify(plan)).byteLength;
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

/** The title as a file-name slug: lowercase ASCII, hyphen-joined, ≤ 60 chars, else `practice-plan`. */
export function planSlug(title: string): string {
    const slug = title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/, "");
    return slug || "practice-plan";
}

/** `<slug>.olplan.json`. */
export function planFileName(title: string): string {
    return `${planSlug(title)}.olplan.json`;
}

export type PlanExportExtension = "html" | "docx";

/** `<slug>.html` / `<slug>.docx`: the bench sheet exports (sub-project 4). */
export function planExportFileName(title: string, extension: PlanExportExtension): string {
    return `${planSlug(title)}.${extension}`;
}

export interface PlanEditorDrill {
    /** Stable per-row key for React lists */
    key: string;
    kind: "drill";
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    instructions: string;
    name: string;
    description: string;
    focus: PlayFocus;
    goalies: PlayGoalies;
    ageGroups: AgeGroup[];
    stays: boolean;
    rotateEveryMinutes: number | null;
    playData: PlayData;
    staff: string[];
}

export interface PlanEditorBlock {
    key: string;
    kind: BlockKind;
    sequence: number;
    duration: number;
    runsWithPrevious: false;
    instructions: string;
    label: string | null;
    staff: string[];
}

export interface PlanEditorSession {
    title: string;
    duration: number;
    date: string | null;
    startTime: string | null;
    goaliesAttending: number | null;
    transitionMinutes: number;
    staff: string[];
    plays: Array<PlanEditorDrill | PlanEditorBlock>;
}

/** The plan as timeline rows (TimelinePlay-compatible), for the import preview. */
export function planToEditorSession(plan: PlanDocument): PlanEditorSession {
    return {
        title: plan.session.title,
        duration: plan.session.durationMinutes,
        date: plan.session.date,
        startTime: plan.session.startTime,
        goaliesAttending: plan.session.goaliesAttending,
        transitionMinutes: plan.session.transitionMinutes,
        staff: plan.session.staff,
        plays: plan.session.drills.map((entry): PlanEditorDrill | PlanEditorBlock =>
            entry.kind === "drill"
                ? {
                      key: `plan-row-${entry.sequence}`,
                      kind: "drill",
                      sequence: entry.sequence,
                      duration: entry.durationMinutes,
                      runsWithPrevious: entry.runsWithPrevious,
                      instructions: entry.instructions,
                      name: entry.drill.name,
                      description: entry.drill.description,
                      focus: entry.drill.focus,
                      goalies: entry.drill.goalies,
                      ageGroups: entry.drill.ageGroups,
                      stays: entry.stays,
                      rotateEveryMinutes: entry.rotateEveryMinutes,
                      playData: entry.drill.playData,
                      staff: entry.staff,
                  }
                : {
                      key: `plan-row-${entry.sequence}`,
                      kind: entry.kind,
                      sequence: entry.sequence,
                      duration: entry.durationMinutes,
                      runsWithPrevious: false,
                      instructions: entry.instructions,
                      label: entry.label,
                      staff: entry.staff,
                  },
        ),
    };
}
