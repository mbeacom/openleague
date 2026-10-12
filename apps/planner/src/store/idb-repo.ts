/**
 * IndexedDB PlannerRepo (ADR-0020). Database "openleague-planner":
 * - plays (keyPath id; index bySession on sessionId: null isn't a valid key,
 *   so library plays never enter it and it holds exactly the owned copies);
 * - sessions (keyPath id), with their rows embedded;
 * - meta (keyPath key);
 * - rankings (keyPath id): rankings documents, keyed by a local id;
 * - links (keyPath docKey): which remote file each local document is saved to.
 * Every operation is one transaction over every store. Schema changes
 * add a case to upgradeDatabase and never drop data.
 *
 * Versions: 1 = the first release; 2 = practice timing rows (a row's playId
 * may be null, block rows carry kind and label); 3 = practice staff (sessions
 * and rows gained optional staff fields); 4 = drill age groups and quarter-ice
 * areas (plays gained an optional ageGroups field and new area values); 5 =
 * practice equipment (sessions gained an optional equipment list, and stored
 * diagrams an optional equipmentNeeds); 6 = practice roster (sessions gained
 * an optional roster field); 7 = storage connectors (the links store, and the
 * rankings store, which takes over the single rankings record from meta).
 * Bumping the version is what makes a tab still running an older build close
 * its connection and reload (onversionchange below) before this build writes
 * rows it can't read.
 */
import { META_RANKINGS, type DocumentLink, type PlannerRepo, type RepoTx, type StoredPlay, type StoredRankings, type StoredSession } from "./records";

export const DB_NAME = "openleague-planner";
export const DB_VERSION = 7;
const STORES = ["plays", "sessions", "meta", "rankings", "links"];

export class StorageBlockedError extends Error {
    constructor() {
        super("The planner's storage is held open by an older tab.");
        this.name = "StorageBlockedError";
    }
}

function request<T>(req: IDBRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    });
}

export interface UpgradeOptions {
    now?: () => Date;
    newId?: () => string;
}

/**
 * Version 7: the device's one rankings document moves from meta into the
 * rankings store as its first record, as stored (a damaged one stays damaged,
 * so the screen still offers "Start over"), and the meta key is deleted. A
 * cleared record (null) moves as nothing.
 */
function moveRankingsOutOfMeta(tx: IDBTransaction, { now = () => new Date(), newId = () => crypto.randomUUID() }: UpgradeOptions): void {
    const meta = tx.objectStore("meta");
    const read = meta.get(META_RANKINGS);
    read.onsuccess = () => {
        const entry = read.result as { key: string; value: unknown } | undefined;
        if (entry === undefined) return;
        if (entry.value !== null && entry.value !== undefined) {
            const id = newId();
            const at = now();
            const record: StoredRankings = { id, documentId: id, document: entry.value, createdAt: at, updatedAt: at };
            tx.objectStore("rankings").put(record);
        }
        meta.delete(META_RANKINGS);
    };
}

/** `tx` is the upgrade transaction (open.transaction): needed only to move data, from version 7 on. */
export function upgradeDatabase(db: IDBDatabase, oldVersion: number, tx?: IDBTransaction | null, options: UpgradeOptions = {}): void {
    if (oldVersion < 1) {
        const plays = db.createObjectStore("plays", { keyPath: "id" });
        plays.createIndex("bySession", "sessionId", { unique: false });
        db.createObjectStore("sessions", { keyPath: "id" });
        db.createObjectStore("meta", { keyPath: "key" });
    }
    if (oldVersion < 2) {
        // Practice timing: same stores and index; rows only gained optional fields
        // (older rows read as drills), so there is nothing to migrate.
    }
    if (oldVersion < 3) {
        // Practice staff: sessions and rows only gained optional fields (older records read
        // with no staff), so there is nothing to migrate. The bump is what makes a tab still
        // running an older build reload (onversionchange) before it can rewrite a session
        // without its staff.
    }
    if (oldVersion < 4) {
        // Drill age groups and quarter-ice areas: plays only gained an optional field and new
        // area values (older records read as every age), so there is nothing to migrate. The
        // bump makes a tab still running an older build reload before it can save a drill
        // without its age groups or its quarter-ice area.
    }
    if (oldVersion < 5) {
        // Practice equipment: sessions gained an optional list and diagrams an optional key
        // (older records read with none), so there is nothing to migrate. The bump makes a tab
        // still running an older build reload before it can save a drill without its changes.
    }
    if (oldVersion < 6) {
        // Practice roster: sessions only gained an optional field (older records read with no
        // roster), so there is nothing to migrate. The bump makes a tab still running an older
        // build reload before it can rewrite a session without its roster.
    }
    // From here on a step changes the schema, so it runs only when upgrading to its version or
    // later (db.version is the version being opened); tests open older versions on purpose.
    if (oldVersion < 7 && db.version >= 7) {
        // Storage connectors: two new stores. A database that already had a meta store may
        // hold the single rankings record, which moves into the rankings store. The bump makes
        // a tab still running an older build reload before it can write rankings to meta.
        db.createObjectStore("rankings", { keyPath: "id" });
        db.createObjectStore("links", { keyPath: "docKey" });
        if (oldVersion >= 1 && tx) moveRankingsOutOfMeta(tx, options);
    }
}

function txApi(tx: IDBTransaction): RepoTx {
    const plays = tx.objectStore("plays");
    const sessions = tx.objectStore("sessions");
    const meta = tx.objectStore("meta");
    const rankings = tx.objectStore("rankings");
    const links = tx.objectStore("links");
    return {
        getPlay: (id) => request<StoredPlay | undefined>(plays.get(id)),
        putPlay: async (play) => {
            await request(plays.put(play));
        },
        deletePlay: async (id) => {
            await request(plays.delete(id));
        },
        allPlays: () => request<StoredPlay[]>(plays.getAll()),
        sessionPlays: (sessionId) => request<StoredPlay[]>(plays.index("bySession").getAll(sessionId)),
        getSession: (id) => request<StoredSession | undefined>(sessions.get(id)),
        putSession: async (session) => {
            await request(sessions.put(session));
        },
        deleteSession: async (id) => {
            await request(sessions.delete(id));
        },
        allSessions: () => request<StoredSession[]>(sessions.getAll()),
        getMeta: async (key) => (await request<{ key: string; value: unknown } | undefined>(meta.get(key)))?.value,
        putMeta: async (key, value) => {
            await request(meta.put({ key, value }));
        },
        getRankingsRecord: (id) => request<StoredRankings | undefined>(rankings.get(id)),
        putRankingsRecord: async (record) => {
            await request(rankings.put(record));
        },
        deleteRankingsRecord: async (id) => {
            await request(rankings.delete(id));
        },
        allRankingsRecords: () => request<StoredRankings[]>(rankings.getAll()),
        getLink: (docKey) => request<DocumentLink | undefined>(links.get(docKey)),
        putLink: async (link) => {
            await request(links.put(link));
        },
        deleteLink: async (docKey) => {
            await request(links.delete(docKey));
        },
        allLinks: () => request<DocumentLink[]>(links.getAll()),
    };
}

/** Resolves only on `complete`, so callers see committed data; aborts when the work throws. */
function run<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (tx: RepoTx) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
            tx = db.transaction(STORES, mode);
        } catch (error) {
            reject(error);
            return;
        }
        let outcome: { value: T } | null = null;
        let settled = false;
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        tx.oncomplete = () => {
            if (settled) return;
            settled = true;
            if (outcome) resolve(outcome.value);
            // The work awaited something other than the repo, and IndexedDB committed without it.
            else reject(new Error("The transaction finished before its work did"));
        };
        // Quota and request errors abort the transaction (onerror always precedes it); surface the abort rather than hang.
        tx.onabort = () => fail(tx.error ?? new Error("The transaction was aborted"));
        work(txApi(tx)).then(
            (value) => {
                outcome = { value };
            },
            (error: unknown) => {
                fail(error);
                try {
                    tx.abort();
                } catch {
                    // Already finished.
                }
            },
        );
    });
}

/**
 * Some WebKit builds never fire success, error or blocked on indexedDB.open.
 * Past this, the open is treated as failed so boot falls back to memory.
 */
export const OPEN_TIMEOUT_MS = 4000;

export interface IdbRepoOptions {
    factory?: IDBFactory;
    name?: string;
    /** The clock and ids the version 7 upgrade gives a moved rankings record (tests inject them). */
    upgrade?: UpgradeOptions;
    /**
     * The connection is gone and the app must reload: a newer tab upgraded the
     * schema, or the browser closed it (for example, site data was cleared).
     */
    onVersionChange?: () => void;
}

export function openIdbRepo({ factory = globalThis.indexedDB, name = DB_NAME, upgrade, onVersionChange }: IdbRepoOptions = {}): Promise<PlannerRepo> {
    return new Promise<PlannerRepo>((resolve, reject) => {
        if (!factory) {
            reject(new Error("IndexedDB is not available"));
            return;
        }
        let open: IDBOpenDBRequest;
        try {
            open = factory.open(name, DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }
        let settled = false;
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        };
        const timer = setTimeout(() => fail(new Error("IndexedDB didn't open in time")), OPEN_TIMEOUT_MS);
        open.onupgradeneeded = (event) => upgradeDatabase(open.result, event.oldVersion, open.transaction, upgrade);
        open.onblocked = () => fail(new StorageBlockedError());
        open.onerror = () => fail(open.error ?? new Error("IndexedDB failed to open"));
        open.onsuccess = () => {
            const db = open.result;
            if (settled) {
                // Opened after the timeout or a block: the app already moved on without it.
                db.close();
                return;
            }
            settled = true;
            clearTimeout(timer);
            db.onversionchange = () => {
                db.close();
                onVersionChange?.();
            };
            db.onclose = () => onVersionChange?.();
            resolve({
                durable: true,
                read: (work) => run(db, "readonly", work),
                write: (work) => run(db, "readwrite", work),
                close: () => db.close(),
            });
        };
    });
}
