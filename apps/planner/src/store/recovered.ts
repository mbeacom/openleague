/**
 * Recovered copies (storage connectors spec, "Sync and conflicts"): a working
 * copy that "Use theirs", opening a file over it, or "Replace my copy" was
 * about to replace, kept for 30 days so nothing a coach made is lost without a
 * choice. They live in one meta value (no IndexedDB version bump: the list is
 * small, rarely written, and older builds never read it). Swept on boot.
 */
import type { ActionResult } from "@/lib/planner-store";
import { META_RECOVERED_COPIES, type RecoveredCopy, type RepoTx } from "./records";
import { StoreRefusal, attempt, ok, write, type StoreContext } from "./shared";

export const RECOVERED_RETENTION_DAYS = 30;
const RETENTION_MS = RECOVERED_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const RECOVERED_LOAD_FAILED = "Couldn't load your recovered copies. Please try again.";
export const RECOVERED_SAVE_FAILED = "Couldn't keep a recovered copy. Please try again.";
export const RECOVERED_NOT_FOUND = "That recovered copy is no longer here.";

export type { RecoveredCopy } from "./records";

export type RecoveredCopySummary = Omit<RecoveredCopy, "payload">;

export interface RecoveredCopyInput {
    docKey: string;
    kind: string;
    documentId: string;
    title: string;
    payload: unknown;
}

export interface RecoveredOps {
    /** Newest first, without the documents. */
    listRecoveredCopies: () => Promise<ActionResult<RecoveredCopySummary[]>>;
    getRecoveredCopy: (id: string) => Promise<ActionResult<RecoveredCopy>>;
    /** `at` is when it was replaced (ISO); now when omitted. */
    addRecoveredCopy: (input: RecoveredCopyInput, at?: string) => Promise<ActionResult<RecoveredCopy>>;
    deleteRecoveredCopy: (id: string) => Promise<ActionResult<null>>;
    /** Drops copies older than RECOVERED_RETENTION_DAYS; resolves to how many it dropped. */
    sweepRecoveredCopies: () => Promise<number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isRecoveredCopy(value: unknown): value is RecoveredCopy {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.docKey === "string" &&
        typeof value.kind === "string" &&
        typeof value.documentId === "string" &&
        typeof value.title === "string" &&
        typeof value.recoveredAt === "string" &&
        !Number.isNaN(Date.parse(value.recoveredAt)) &&
        "payload" in value
    );
}

/** A damaged entry is dropped, never thrown: the rest of the list still reads. */
async function readCopies(tx: RepoTx): Promise<RecoveredCopy[]> {
    const stored = await tx.getMeta(META_RECOVERED_COPIES);
    return Array.isArray(stored) ? stored.filter(isRecoveredCopy) : [];
}

const newestFirst = (a: RecoveredCopy, b: RecoveredCopy) => Date.parse(b.recoveredAt) - Date.parse(a.recoveredAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const summaryOf = ({ payload: _payload, ...rest }: RecoveredCopy): RecoveredCopySummary => rest;

export function createRecoveredOps(ctx: StoreContext): RecoveredOps {
    return {
        listRecoveredCopies: () =>
            attempt(RECOVERED_LOAD_FAILED, async () => ok((await ctx.repo.read(readCopies)).sort(newestFirst).map(summaryOf))),

        getRecoveredCopy: (id) =>
            attempt(RECOVERED_LOAD_FAILED, async () => {
                const copy = (await ctx.repo.read(readCopies)).find((entry) => entry.id === id);
                return copy ? ok(copy) : { success: false, error: RECOVERED_NOT_FOUND };
            }),

        addRecoveredCopy: (input, at) =>
            attempt(RECOVERED_SAVE_FAILED, async () => {
                const copy: RecoveredCopy = { id: ctx.newId(), ...input, recoveredAt: at ?? ctx.now().toISOString() };
                await write(ctx, async (tx) => {
                    await tx.putMeta(META_RECOVERED_COPIES, [...(await readCopies(tx)), copy]);
                });
                return ok(copy);
            }),

        deleteRecoveredCopy: (id) =>
            attempt(RECOVERED_SAVE_FAILED, async () => {
                await write(ctx, async (tx) => {
                    const copies = await readCopies(tx);
                    if (!copies.some((entry) => entry.id === id)) throw new StoreRefusal(RECOVERED_NOT_FOUND);
                    await tx.putMeta(META_RECOVERED_COPIES, copies.filter((entry) => entry.id !== id));
                });
                return ok(null);
            }),

        sweepRecoveredCopies: async () => {
            const cutoff = ctx.now().getTime() - RETENTION_MS;
            return ctx.repo.write(async (tx) => {
                const stored = await tx.getMeta(META_RECOVERED_COPIES);
                if (stored === undefined) return 0;
                const copies = await readCopies(tx);
                const kept = copies.filter((entry) => Date.parse(entry.recoveredAt) >= cutoff);
                const dropped = (Array.isArray(stored) ? stored.length : 0) - kept.length;
                if (dropped > 0 || !Array.isArray(stored)) await tx.putMeta(META_RECOVERED_COPIES, kept);
                return Math.max(0, dropped);
            });
        },
    };
}
