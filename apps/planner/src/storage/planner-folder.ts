/**
 * The planner folder on this computer (storage locations design, decision 2):
 * "Save everything to the folder", "Restore from the folder", and "Keep the
 * folder up to date". All three go through the sync engine, so the conflict
 * rules are the same as a coach's own Save; none of them resolves a conflict
 * or replaces a working copy with different content on its own.
 */
import { readAnyDocumentText } from "@/lib/document-formats";
import { PLAN_FORMAT, planFileName } from "@/lib/plan-document";
import { RANKINGS_FORMAT, rankingsFileName } from "@/lib/rankings-document";
import type { DocumentKind } from "@/lib/document-envelope";
import { docKeyOf } from "../store/links";
import { refOf, type RemoteFile } from "./connector";
import { isInFolderGeneration } from "./local-file";
import type { StorageService } from "./service";
import { hashPayload, linkFromRemote, type SyncError } from "./sync";

export interface SaveAllSummary {
    /** Newly linked into the folder. */
    added: number;
    /** Linked to a file in a planner folder chosen before: saved into this one and relinked; the old file is left as it is. */
    moved: number;
    /** Already in the folder, with edits now saved. */
    saved: number;
    /** Linked to a file somewhere else (Drive, OneDrive, a file outside the folder): left there. */
    elsewhere: number;
    /** Needs the coach: a conflict, or an error (the first one is kept). */
    failed: number;
    firstError?: SyncError;
}

/** A document this browser holds whose file in the planner folder has other content. */
export interface FolderDifference {
    docKey: string;
    kind: DocumentKind;
    /** This browser's title. */
    title: string;
    file: RemoteFile;
}

export interface RestoreSummary {
    /** New to this browser: added and linked. */
    added: number;
    /** Already here with the same content, and unlinked: now linked. */
    linked: number;
    /** Already here and linked: left alone. */
    unchanged: number;
    /** Already here with other content: left for the coach to choose (takeFolderCopy). */
    differing: number;
    /** The differing ones, for the coach's choice. */
    differences: FolderDifference[];
    /** Not a document the planner can read. */
    unreadable: number;
    firstError?: SyncError;
}

const LOCAL = "local-file" as const;

/** Saves every practice and the current rankings into the planner folder. Call from a tap: it may ask for the folder's permission. */
export async function saveAllToFolder(service: StorageService): Promise<SaveAllSummary> {
    const { store, engine } = service;
    const summary: SaveAllSummary = { added: 0, moved: 0, saved: 0, elsewhere: 0, failed: 0 };
    const location = await service.locations.get(LOCAL);
    if (!location) return { ...summary, failed: 1, firstError: { code: "location-missing" } };
    const fail = (error: SyncError) => {
        summary.failed += 1;
        summary.firstError ??= error;
    };

    const targets: Array<{ docKey: string; fileName: string }> = [];
    const sessions = await store.listSessions();
    if (sessions.success) for (const session of sessions.data) targets.push({ docKey: docKeyOf(PLAN_FORMAT, session.id), fileName: planFileName(session.title) });
    const rankings = await store.listRankingsDocuments();
    // The rankings screen shows the newest record only; older ones aren't the coach's rankings any more.
    const current = rankings.success ? rankings.data.find((record) => !record.damaged) : undefined;
    if (current) {
        const record = await store.getRankingsDocument(current.id);
        if (record.success) targets.push({ docKey: docKeyOf(RANKINGS_FORMAT, current.id), fileName: rankingsFileName(record.data.document) });
    }

    for (const { docKey, fileName } of targets) {
        const { link, dirty } = await engine.localState(docKey);
        const inEarlierFolder = link?.connector === LOCAL && link.remote.fileId.startsWith("folder:") && !isInFolderGeneration(link.remote.fileId, location.generation);
        if (link && !inEarlierFolder && !(link.connector === LOCAL && isInFolderGeneration(link.remote.fileId, location.generation))) {
            summary.elsewhere += 1;
            continue;
        }
        if (link && !inEarlierFolder) {
            if (!dirty) continue;
            const outcome = await engine.save(docKey);
            if (!outcome.ok) fail(outcome.error);
            // A conflict: the coach chooses on the document itself.
            else if (outcome.state !== "in-sync") summary.failed += 1;
            else summary.saved += 1;
            continue;
        }
        // New to the folder, or in a folder chosen before: this browser's copy is written here and the link moves to it.
        const outcome = await engine.saveNew(docKey, LOCAL, inEarlierFolder ? link!.remote.name : fileName);
        if (!outcome.ok) {
            fail(outcome.error);
            // Without the folder's permission nothing else will save either.
            if (outcome.error.code === "auth-required" || outcome.error.code === "unavailable") break;
            continue;
        }
        if (inEarlierFolder) summary.moved += 1;
        else summary.added += 1;
    }
    return summary;
}

/**
 * Reads every document in the planner folder into this browser. Call from a
 * tap: it may ask for the folder's permission. A document this browser holds
 * already is linked only when its content matches; otherwise it is counted
 * and left for "Open from…", where the coach chooses.
 */
export async function restoreFromFolder(service: StorageService): Promise<RestoreSummary> {
    const { store, engine, documents } = service;
    const summary: RestoreSummary = { added: 0, linked: 0, unchanged: 0, differing: 0, unreadable: 0, differences: [] };
    const connector = service.connector(LOCAL);
    if (!connector) return { ...summary, firstError: { code: "no-connector" } };
    const listed = await connector.list();
    if (!listed.ok) return { ...summary, firstError: listed.error };

    for (const file of listed.value) {
        const kind = file.kind as DocumentKind | undefined;
        if (kind !== PLAN_FORMAT && kind !== RANKINGS_FORMAT) continue;
        const opened = await connector.open(refOf(file));
        if (!opened.ok) {
            summary.unreadable += 1;
            summary.firstError ??= opened.error;
            continue;
        }
        const read = await readAnyDocumentText(opened.value.text, file.name, { modifiedAt: opened.value.file.modifiedAt }, { kind });
        if (!read.ok) {
            summary.unreadable += 1;
            continue;
        }
        const found = read.document.id ? (kind === PLAN_FORMAT ? await store.findSessionByDocumentId(read.document.id) : await store.findRankingsByDocumentId(read.document.id)) : null;
        const match = found?.success ? found.data : null;
        if (!match) {
            // New here: the same step as "Open from…" for a file this browser doesn't hold.
            const outcome = await engine.openLinked(docKeyOf(kind, crypto.randomUUID()), refOf(opened.value.file), { kind });
            if (outcome.ok) summary.added += 1;
            else {
                summary.unreadable += 1;
                summary.firstError ??= outcome.error;
            }
            continue;
        }
        const docKey = docKeyOf(kind, match.id);
        const { link } = await engine.localState(docKey);
        if (link) {
            summary.unchanged += 1;
            continue;
        }
        const local = await documents.read(docKey);
        if (local && (await hashPayload(local.payload)) === (await hashPayload(read.document.payload))) {
            // Same content: only the link is recorded, so nothing is replaced and no recovered copy is made.
            await store.links.put(linkFromRemote({ docKey, documentId: local.documentId, file: opened.value.file, hash: await hashPayload(local.payload), writtenHere: false, at: new Date().toISOString() }));
            summary.linked += 1;
            continue;
        }
        summary.differing += 1;
        summary.differences.push({ docKey, kind, title: match.title ?? file.name, file: opened.value.file });
    }
    return summary;
}

/**
 * "Use the folder's copy" for a difference a restore found: the file replaces
 * this browser's copy, which goes to Recovered copies, and the document is
 * linked to the file. Refused (unreadable) if the file changed kind.
 */
export function takeFolderCopy(service: StorageService, difference: FolderDifference) {
    return service.engine.openLinked(difference.docKey, refOf(difference.file), { kind: difference.kind });
}

export interface FolderAutosave {
    /** One pass now; resolves to how many documents it saved. */
    run: () => Promise<number>;
    stop: () => void;
}

export interface FolderAutosaveOptions {
    intervalMs?: number;
    debounceMs?: number;
    /** Where the timers and the page events come from (tests pass fakes). */
    scope?: Pick<typeof globalThis, "setInterval" | "clearInterval" | "setTimeout" | "clearTimeout"> & { document?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> };
    /** True when the browser already grants the folder: autosave never asks, it has no tap to ask from. */
    granted?: () => Promise<boolean>;
}

/** How often autosave looks for edits, besides after an edit and when the tab is hidden: a safety net. */
export const AUTOSAVE_INTERVAL_MS = 60_000;
/** How long after the last edit autosave waits, so typing doesn't write the file on every keystroke. */
export const AUTOSAVE_DEBOUNCE_MS = 3_000;

/**
 * "Keep the folder up to date": saves linked files in the planner folder that
 * have edits, a few seconds after the last edit, when the tab is hidden, and
 * on a slow interval as a safety net. Off unless the coach
 * chose a folder with autosave on, and silent unless the browser already
 * grants the folder. A conflict or a failure is left as the link's state; the
 * storage bar shows it on the document.
 */
export function startFolderAutosave(service: StorageService, { intervalMs = AUTOSAVE_INTERVAL_MS, debounceMs = AUTOSAVE_DEBOUNCE_MS, scope = globalThis, granted }: FolderAutosaveOptions = {}): FolderAutosave {
    const { store, engine, locations } = service;
    let running: Promise<number> | null = null;

    const folderGranted =
        granted ??
        (async () => {
            const location = await locations.get(LOCAL);
            const handle = location?.handle as { queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState> } | undefined;
            if (!handle?.queryPermission) return false;
            try {
                return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
            } catch {
                return false;
            }
        });

    async function pass(): Promise<number> {
        const location = await locations.get(LOCAL);
        if (!location?.autosave || !service.connector(LOCAL)) return 0;
        if (!(await folderGranted())) return 0;
        let saved = 0;
        for (const link of await store.links.list()) {
            // Only files in the folder chosen now; one in an earlier choice waits for the coach's Save, or "Save everything".
            if (link.connector !== LOCAL || !isInFolderGeneration(link.remote.fileId, location.generation)) continue;
            const { dirty } = await engine.localState(link.docKey);
            if (!dirty) continue;
            const outcome = await engine.save(link.docKey);
            if (outcome.ok && outcome.state === "in-sync") saved += 1;
        }
        return saved;
    }

    // One pass at a time: a slow folder never stacks saves of the same file.
    const run = () => (running ??= pass().catch((error: unknown) => {
        console.error("Autosave to the planner folder failed:", error instanceof Error ? error.name : "unknown");
        return 0;
    }).finally(() => {
        running = null;
    }));

    const timer = scope.setInterval(() => void run(), intervalMs);
    let pending: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
        if (pending !== null) scope.clearTimeout(pending);
        pending = null;
        void run();
    };
    // After an edit: once the coach pauses. Autosave's own writes touch only links and files, not documents, so this doesn't loop.
    const unsubscribe = store.subscribeWrites(() => {
        if (pending !== null) scope.clearTimeout(pending);
        pending = scope.setTimeout(flush, debounceMs);
    });
    const onVisibility = () => {
        if (scope.document?.visibilityState === "hidden") flush();
    };
    scope.document?.addEventListener("visibilitychange", onVisibility);

    return {
        run,
        stop: () => {
            scope.clearInterval(timer);
            if (pending !== null) scope.clearTimeout(pending);
            unsubscribe();
            scope.document?.removeEventListener("visibilitychange", onVisibility);
        },
    };
}

/** Says a save-all in words. */
export function saveAllText(summary: SaveAllSummary): string {
    const parts: string[] = [];
    if (summary.added) parts.push(`${summary.added} added to the folder`);
    if (summary.moved) parts.push(`${summary.moved} saved here from the folder you used before (those files are left as they were)`);
    if (summary.saved) parts.push(`${summary.saved} updated`);
    if (summary.elsewhere) parts.push(`${summary.elsewhere} left where they're saved now`);
    if (summary.failed) parts.push(`${summary.failed} need you: open them to see why`);
    return parts.length ? `${parts.join("; ")}.` : "Everything is already in the folder.";
}

/** Says a restore in words. */
export function restoreText(summary: RestoreSummary): string {
    const parts: string[] = [];
    if (summary.added) parts.push(`${summary.added} added`);
    if (summary.linked) parts.push(`${summary.linked} linked to their files`);
    if (summary.unchanged) parts.push(`${summary.unchanged} already linked`);
    if (summary.differing) parts.push(`${summary.differing} differ from what's here: choose below`);
    if (summary.unreadable) parts.push(`${summary.unreadable} couldn't be read`);
    return parts.length ? `${parts.join("; ")}.` : "The folder has no practices or rankings yet.";
}
