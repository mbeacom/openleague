/** Helpers every local-store operation shares (ADR-0020). */
import type { ActionResult, LibraryPlaySummary } from "@/lib/planner-store";
import { GOALIES_ATTENDING_MESSAGE, drillTags, toGoaliesAttending } from "@/lib/utils/drill-tags";
import { AGE_GROUP_UNKNOWN_MESSAGE, ageGroupsSchema, toAgeGroups, type AgeGroup } from "@/lib/utils/age-groups";
import { MAX_THUMBNAIL_SIZE, isAcceptableThumbnail } from "@/lib/utils/thumbnail-rules";
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";
import type { PlannerRepo, RepoTx, StoredPlay } from "./records";
import type { LocalStoreOptions } from "./types";

export const STORAGE_FULL_MESSAGE =
    "Your browser is out of storage space for this site. Download plan files to back up, then delete old practices or drills.";
/** Hosted's text (lib/actions/plays.ts deletePlay). */
export const OWNED_DRILL_DELETE_MESSAGE = "This drill belongs to a practice session. Remove it from that session.";
export const PLAY_NOT_FOUND_MESSAGE = "Play not found";

/** An expected refusal with a friendly message. Thrown inside repo.write, it also aborts the transaction. */
export class StoreRefusal extends Error {
    constructor(
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = "StoreRefusal";
    }
}

export interface StoreContext {
    repo: PlannerRepo;
    now: () => Date;
    newId: () => string;
    makeThumbnail: (playData: PlayData) => string | null;
    /** Awaited before drawing thumbnails to store; never rejects. */
    beforeStoredDraw: () => Promise<void>;
    /** Runs after every successful user write (the persistence request). */
    afterWrite: () => void;
}

export function createStoreContext(repo: PlannerRepo, options: LocalStoreOptions = {}, afterWrite: () => void = () => undefined): StoreContext {
    const makeThumbnail = options.makeThumbnail;
    return {
        repo,
        now: options.now ?? (() => new Date()),
        newId: options.newId ?? (() => crypto.randomUUID()),
        makeThumbnail: (playData) => {
            if (!makeThumbnail) return null;
            try {
                return makeThumbnail(playData);
            } catch {
                return null;
            }
        },
        beforeStoredDraw: async () => {
            try {
                await options.beforeStoredDraw?.();
            } catch {
                // A font that can't be waited for is drawn with the fallback.
            }
        },
        afterWrite,
    };
}

/** A user write: the repo write, then afterWrite. */
export async function write<T>(ctx: StoreContext, work: (tx: RepoTx) => Promise<T>): Promise<T> {
    const result = await ctx.repo.write(work);
    ctx.afterWrite();
    return result;
}

export const ok = <T,>(data: T): ActionResult<T> => ({ success: true, data });

function isQuotaError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "QuotaExceededError";
}

/** Runs an operation and turns every failure into an ActionResult, as the server actions do. */
export async function attempt<T>(fallback: string, work: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    try {
        return await work();
    } catch (error) {
        if (error instanceof StoreRefusal) {
            return error.details === undefined
                ? { success: false, error: error.message }
                : { success: false, error: error.message, details: error.details };
        }
        if (isQuotaError(error)) return { success: false, error: STORAGE_FULL_MESSAGE };
        console.error(fallback, error);
        return { success: false, error: fallback };
    }
}

export function summary(play: StoredPlay): LibraryPlaySummary {
    return {
        id: play.id,
        name: play.name,
        description: play.description,
        thumbnail: play.thumbnail,
        ...drillTags(play),
        ageGroups: toAgeGroups(play.ageGroups),
        isTemplate: play.isTemplate,
        createdAt: play.createdAt,
        updatedAt: play.updatedAt,
    };
}

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Hosted's limits (createPlaySchema): name 1–100, description ≤ 1000, both cleaned. */
export function drillText(name: string, description: string | null | undefined): { name: string; description: string | null } {
    const cleanName = name.replace(CONTROL_CHARS, "").trim();
    if (!cleanName) throw new StoreRefusal("Name is required");
    if (cleanName.length > 100) throw new StoreRefusal("Name must be at most 100 characters");
    const cleanDescription = (description ?? "").replace(CONTROL_CHARS, "").trim();
    if (cleanDescription.length > 1000) throw new StoreRefusal("Description must be at most 1000 characters");
    return { name: cleanName, description: cleanDescription || null };
}

export function writablePlayData(playData: PlayData): PlayData {
    let sanitized: ReturnType<typeof sanitizePlayDataForWrite>;
    try {
        sanitized = sanitizePlayDataForWrite(playData);
    } catch {
        throw new StoreRefusal("Invalid play data");
    }
    if (!sanitized.ok) throw new StoreRefusal("Invalid play data", sanitized.issues);
    return sanitized.data;
}

/** Hosted's thumbnail rule, shared through lib/utils/thumbnail-rules.ts (a pure module the static bundle can import). */
export { MAX_THUMBNAIL_SIZE };

/** Only thumbnails hosted would accept are kept; anything else is dropped rather than stored. */
export function thumbnailOrNull(value: string | null | undefined): string | null {
    return value && isAcceptableThumbnail(value) ? value : null;
}

/** Hosted's rule (updatePracticeSessionSchema): 0–10 or null; undefined passes through, meaning unchanged. */
export function checkedGoalieCount(value: number | null | undefined): number | null | undefined {
    if (value === undefined || value === null) return value;
    if (toGoaliesAttending(value) === null) throw new StoreRefusal(GOALIES_ATTENDING_MESSAGE);
    return value;
}

/** Hosted's rule (ageGroupsSchema): known values, no repeats; returned in the table's order. */
export function checkedAgeGroups(value: unknown): AgeGroup[] {
    const parsed = ageGroupsSchema.safeParse(value);
    if (!parsed.success) throw new StoreRefusal(parsed.error.issues[0]?.message ?? AGE_GROUP_UNKNOWN_MESSAGE);
    return parsed.data;
}
