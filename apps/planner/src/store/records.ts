/**
 * What the static planner stores (ADR-0020), and the transactional repo the
 * store logic runs on. Two adapters implement PlannerRepo: IndexedDB (the
 * real one) and memory (the fallback when IndexedDB is unavailable).
 */

export interface StoredPlay {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    /** Validated on read (parseStoredPlayData), as hosted. */
    playData: unknown;
    isTemplate: boolean;
    /** Set: a session-owned copy (practice planner 3a). Null: a library play. */
    sessionId: string | null;
    /** Provenance of a fork or clone. */
    sourcePlayId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** One drill in a session. `id` is the editor's clientKey, so card keys survive reloads. */
export interface StoredSessionRow {
    id: string;
    playId: string;
    sequence: number;
    duration: number;
    instructions: string;
    runsWithPrevious: boolean;
}

export interface StoredSession {
    id: string;
    title: string;
    date: Date;
    duration: number;
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

export const META_STARTERS_SEEDED = "startersSeeded";
export const META_PERSIST_REQUESTED = "persistRequested";
