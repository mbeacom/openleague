/**
 * The portable drill file: one or more library drills as a versioned
 * document, so a coach can hand drills to another coach's library (static or
 * hosted). Pure. Each drill uses the practice plan's own drill schema, so a
 * drill reads the same in either file. Parsing keeps only known keys and
 * refuses a newer version with its own message. No ids, team, author or
 * thumbnail: the importer regenerates thumbnails.
 */
import { z } from "zod";
import { MAX_PLAN_DRILLS, MAX_PLAN_FILE_BYTES, planDrillContentSchema, type PlanDrillContent, type PlanGenerator } from "@/lib/plan-document/document";
import { drillTags } from "@/lib/utils/drill-tags";
import { toAgeGroups } from "@/lib/utils/age-groups";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { AgeGroup } from "@/lib/utils/age-groups";
import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";

export const DRILLS_FORMAT = "openleague.drills" as const;
export const DRILLS_VERSION = 1 as const;
/** As many drills as a practice plan holds. */
export const MAX_FILE_DRILLS = MAX_PLAN_DRILLS;
/** The same limit as a plan file, which can hold as many drills. */
export const MAX_DRILLS_FILE_BYTES = MAX_PLAN_FILE_BYTES;

export const NOT_A_DRILLS_FILE_MESSAGE = "This file isn't an OpenLeague drill file.";
export const NEWER_DRILLS_FILE_MESSAGE = "This drill file was made by a newer version of OpenLeague. Update to open it.";
export const INVALID_DRILLS_FILE_MESSAGE = "This drill file has problems and can't be opened.";
export const DRILLS_FILE_TOO_LARGE_MESSAGE = `This file is too large to be a drill file (the limit is ${MAX_DRILLS_FILE_BYTES / 1000} KB).`;
export const TOO_MANY_DRILLS_MESSAGE = `A drill file holds at most ${MAX_FILE_DRILLS} drills.`;

const drillsSchema = z.object({
    format: z.literal(DRILLS_FORMAT),
    version: z.literal(DRILLS_VERSION),
    exportedAt: z.iso.datetime({ offset: true, message: "exportedAt must be an ISO date-time" }),
    generator: z.string().trim().min(1).max(100),
    drills: z.array(planDrillContentSchema, { message: "Drills must be a list" }).min(1, "The file has no drills").max(MAX_FILE_DRILLS, TOO_MANY_DRILLS_MESSAGE),
});

export type DrillsDocument = z.output<typeof drillsSchema>;
export type FileDrill = PlanDrillContent;

export interface DrillsFileError {
    code: "not-a-drills-file" | "newer-version" | "invalid";
    message: string;
    issues?: string[];
}

export type ParseDrillsResult = { ok: true; doc: DrillsDocument } | { ok: false; error: DrillsFileError };

export function parseDrillsDocument(raw: unknown): ParseDrillsResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw) || (raw as { format?: unknown }).format !== DRILLS_FORMAT) {
        return { ok: false, error: { code: "not-a-drills-file", message: NOT_A_DRILLS_FILE_MESSAGE } };
    }
    const version = (raw as { version?: unknown }).version;
    if (typeof version === "number" && Number.isInteger(version) && version > DRILLS_VERSION) {
        return { ok: false, error: { code: "newer-version", message: NEWER_DRILLS_FILE_MESSAGE } };
    }
    const result = drillsSchema.safeParse(raw);
    if (!result.success) {
        return {
            ok: false,
            error: {
                code: "invalid",
                message: INVALID_DRILLS_FILE_MESSAGE,
                issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
            },
        };
    }
    return { ok: true, doc: result.data };
}

/** What a library drill contributes to a file: its content, never its id, team or thumbnail. */
export interface DrillSource {
    name: string;
    description: string | null;
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    ageGroups?: AgeGroup[];
    playData: PlayData | null;
}

/** A drill file from library drills, in the order given. Throws past MAX_FILE_DRILLS; callers cap their selection. */
export function createDrillsDocument(drills: readonly DrillSource[], generator: PlanGenerator, now: Date = new Date()): DrillsDocument {
    if (drills.length < 1 || drills.length > MAX_FILE_DRILLS) throw new RangeError(TOO_MANY_DRILLS_MESSAGE);
    const raw = {
        format: DRILLS_FORMAT,
        version: DRILLS_VERSION,
        exportedAt: now.toISOString(),
        generator,
        drills: drills.map((drill) => ({
            name: drill.name,
            description: drill.description ?? "",
            ...drillTags(drill),
            ageGroups: toAgeGroups(drill.ageGroups),
            playData: drill.playData ?? createEmptyPlayData(),
        })),
    };
    // Through the parser, so what is written is exactly what any reader gets back.
    const parsed = parseDrillsDocument(JSON.parse(JSON.stringify(raw)));
    if (!parsed.ok) throw new Error(`${parsed.error.message} ${(parsed.error.issues ?? []).join("; ")}`.trim());
    return parsed.doc;
}

export function serializeDrillsDocument(doc: DrillsDocument): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

const slug = (text: string) =>
    text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/, "");

/** One drill: "breakout-drill.drills.json". Several: "12-drills.drills.json". */
export function drillsFileName(doc: Pick<DrillsDocument, "drills">): string {
    if (doc.drills.length === 1) return `${slug(doc.drills[0].name) || "drill"}.drills.json`;
    return `${doc.drills.length}-drills.drills.json`;
}
