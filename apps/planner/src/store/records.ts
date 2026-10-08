/**
 * What the static planner stores (ADR-0020), and the transactional repo the
 * store logic runs on. Two adapters implement PlannerRepo: IndexedDB (the
 * real one) and memory (the fallback when IndexedDB is unavailable).
 */
import type { EquipmentCountItem, PlayFocus, PlayGoalies, SessionRowKind } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";

export interface StoredPlay {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    /** Validated on read (parseStoredPlayData), as hosted. */
    playData: unknown;
    isTemplate: boolean;
    /** Drill tags. Absent on records written before tags existed: read through drillTags(). */
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    /** Age groups. Absent on records written before them: read through toAgeGroups() (every age). */
    ageGroups?: AgeGroup[];
    /** Set: a session-owned copy (practice planner 3a). Null: a library play. */
    sessionId: string | null;
    /** Provenance of a fork or clone. */
    sourcePlayId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** One person on a practice's staff. The static planner keeps typed names only; `id` is the editor's key. */
export interface StoredStaffMember {
    id: string;
    name: string;
}

/** A practice roster as stored (roster spec R12): typed players only, never a team link. Read through toPracticeRoster. */
export interface StoredRoster {
    ageGroup: AgeGroup | null;
    roles: string[];
    /** `id` is the editor's key, so it survives every save. */
    players: Array<{ id: string; name: string; number: string; role: string }>;
}

/** One row in a session. `id` is the editor's clientKey, so card keys survive reloads. */
export interface StoredSessionRow {
    id: string;
    /** The session's own drill copy; null for a block row (warm-up, break, transition, cool-down). */
    playId: string | null;
    sequence: number;
    duration: number;
    instructions: string;
    runsWithPrevious: boolean;
    /** Practice timing. Absent on rows stored before it: read through toRowKind (a drill that doesn't rotate). */
    kind?: SessionRowKind;
    /** A block row's label; null or absent = the kind's default. */
    label?: string | null;
    stays?: boolean;
    rotateEveryMinutes?: number | null;
    /** Staff ids running this row, in order. Absent on rows stored before practice staff: nobody. */
    staff?: string[];
}

export interface StoredSession {
    id: string;
    title: string;
    date: Date;
    duration: number;
    /** Goalies expected (0–10). null = not set; absent on sessions stored before the field existed. */
    goaliesAttending?: number | null;
    /** Minutes between blocks (0–5). Absent on sessions stored before practice timing: 0. */
    transitionMinutes?: number;
    /** The practice's staff, in order. Absent on sessions stored before practice staff: none. */
    staff?: StoredStaffMember[];
    /** The practice's own equipment (practice equipment spec R7). Absent on sessions stored before it: none. */
    equipment?: EquipmentCountItem[];
    /** The practice's tentative roster (roster spec R12). Absent on sessions stored before it, or null: none. */
    roster?: StoredRoster | null;
    rows: StoredSessionRow[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * One transaction. Work given to read/write must await only these calls:
 * awaiting anything else lets IndexedDB commit the transaction early.
 */
export interface RepoTx {
    getPlay: (id: string) => Promise<StoredPlay | undefined>;
    putPlay: (play: StoredPlay) => Promise<void>;
    deletePlay: (id: string) => Promise<void>;
    allPlays: () => Promise<StoredPlay[]>;
    sessionPlays: (sessionId: string) => Promise<StoredPlay[]>;
    getSession: (id: string) => Promise<StoredSession | undefined>;
    putSession: (session: StoredSession) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
    allSessions: () => Promise<StoredSession[]>;
    getMeta: (key: string) => Promise<unknown>;
    putMeta: (key: string, value: unknown) => Promise<void>;
}

export interface PlannerRepo {
    /** False for the in-memory fallback: nothing survives the tab. */
    readonly durable: boolean;
    read: <T>(work: (tx: RepoTx) => Promise<T>) => Promise<T>;
    /** All or nothing: resolves once committed; a throwing work rolls everything back. */
    write: <T>(work: (tx: RepoTx) => Promise<T>) => Promise<T>;
    close: () => void;
}

/** Legacy (boolean): set by builds that seeded the starter pack once, before seeded ids were tracked. Read only. */
export const META_STARTERS_SEEDED = "startersSeeded";
/** The starter ids this device has received (string[]), so upgrades add only new starters. */
export const META_SEEDED_STARTER_IDS = "seededStarterIds";
export const META_PERSIST_REQUESTED = "persistRequested";
/** The THUMBNAIL_STYLE_VERSION this device's stored thumbnails were drawn in. */
export const META_THUMBNAIL_STYLE = "thumbnailStyle";
/** The device's "Your team" profile (practice logo spec R4): a TeamProfile, or null once cleared. Never in plan files. */
export const META_TEAM_PROFILE = "teamProfile";
/** The rankings document (static rankings spec): one per device, in the meta store, so no schema bump. */
export const META_RANKINGS = "rankings";
/** AI settings (ADR-0023): provider, model, base URL and acknowledgement. Never a key. */
export const META_AI_SETTINGS = "aiSettings";

/**
 * The starters every device seeded under META_STARTERS_SEEDED. Hard-coded on
 * purpose: STARTER_PLAYS keeps growing, and only these nine were delivered then.
 */
export const LEGACY_SEEDED_STARTER_IDS: readonly string[] = [
    "starter-breakout-5man",
    "starter-3man-weave",
    "starter-pp-umbrella",
    "starter-pk-box",
    "starter-122-forecheck",
    "starter-low-cycle",
    "starter-point-shot-screen",
    "starter-dzone-coverage",
    "starter-nz-regroup",
];
