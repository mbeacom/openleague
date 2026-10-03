/**
 * In-memory PlannerRepo: the fallback when IndexedDB is unavailable (private
 * modes, blocked site data), and the contract suite's second target. Mirrors
 * IndexedDB's semantics: values are structured clones, writes are serialized
 * and all-or-nothing, reads can't write.
 */
import type { PlannerRepo, RepoTx, StoredPlay, StoredSession } from "./records";

interface Tables {
    plays: Map<string, StoredPlay>;
    sessions: Map<string, StoredSession>;
    meta: Map<string, unknown>;
}

const copy = <T,>(value: T): T => structuredClone(value);

function readOnly(): never {
    throw new Error("ReadOnlyError: a read transaction can't write");
}

function txOver(tables: Tables, writable: boolean): RepoTx {
    return {
        getPlay: async (id) => copy(tables.plays.get(id)),
        putPlay: async (play) => {
            if (!writable) readOnly();
            tables.plays.set(play.id, copy(play));
        },
        deletePlay: async (id) => {
            if (!writable) readOnly();
            tables.plays.delete(id);
        },
        allPlays: async () => [...tables.plays.values()].map(copy),
        sessionPlays: async (sessionId) => [...tables.plays.values()].filter((p) => p.sessionId === sessionId).map(copy),
        getSession: async (id) => copy(tables.sessions.get(id)),
        putSession: async (session) => {
            if (!writable) readOnly();
            tables.sessions.set(session.id, copy(session));
        },
        deleteSession: async (id) => {
            if (!writable) readOnly();
            tables.sessions.delete(id);
        },
        allSessions: async () => [...tables.sessions.values()].map(copy),
        getMeta: async (key) => copy(tables.meta.get(key)),
        putMeta: async (key, value) => {
            if (!writable) readOnly();
            tables.meta.set(key, copy(value));
        },
    };
}

export function createMemoryRepo(): PlannerRepo {
    let tables: Tables = { plays: new Map(), sessions: new Map(), meta: new Map() };
    let queue: Promise<unknown> = Promise.resolve();

    function enqueue<T>(job: () => Promise<T>): Promise<T> {
        const run = queue.then(job, job);
        queue = run.catch(() => undefined);
        return run;
    }

    return {
        durable: false,
        read: (work) => enqueue(() => work(txOver(tables, false))),
        write: (work) =>
            enqueue(async () => {
                const draft = structuredClone(tables);
                const result = await work(txOver(draft, true));
                tables = draft;
                return result;
            }),
        close: () => undefined,
    };
}
