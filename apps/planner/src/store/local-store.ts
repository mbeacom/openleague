/**
 * The static planner's store (ADR-0020): the hosted semantics over a
 * PlannerRepo. main.tsx creates it once; components get it through
 * PlannerProvider, so its identity never changes between renders.
 */
import { createAiSettingsOps } from "./ai-settings";
import { createFavoriteOps } from "./favorites";
import { createLocationStore } from "./locations";
import { createFileHandleStore } from "./file-handles";
import { createLinkStore } from "./links";
import { createLibraryOps } from "./library";
import { META_PERSIST_REQUESTED, type PlannerRepo } from "./records";
import { createRankingsOps } from "./rankings";
import { createRecoveredOps } from "./recovered";
import { createSessionOps } from "./sessions";
import { createStoreContext } from "./shared";
import { createTeamProfileOps } from "./team-profile";
import type { LocalPlannerStore, LocalStoreOptions } from "./types";

/**
 * Asks the browser, once per database, to keep the planner's data. The answer
 * is ignored: browsers may still evict, and the privacy note says so.
 */
export async function requestPersistence(
    repo: PlannerRepo,
    storage: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<void> {
    try {
        if (!storage?.persist) return;
        const first = await repo.write(async (tx) => {
            if (await tx.getMeta(META_PERSIST_REQUESTED)) return false;
            await tx.putMeta(META_PERSIST_REQUESTED, true);
            return true;
        });
        if (first) await storage.persist();
    } catch {
        // Best effort.
    }
}

export function createLocalPlannerStore(repo: PlannerRepo, options: LocalStoreOptions = {}): LocalPlannerStore {
    let asked = false;
    const writeListeners = new Set<() => void>();
    const ctx = createStoreContext(repo, options, () => {
        for (const listener of writeListeners) listener();
        if (asked || !repo.durable) return;
        asked = true;
        void requestPersistence(repo);
    });
    const sessions = createSessionOps(ctx);
    return {
        ...createLibraryOps(ctx),
        ...sessions,
        // What "Download plan file" wraps (PlannerStore.getPlanDocumentId).
        getPlanDocumentId: sessions.ensureSessionDocumentId,
        ...createTeamProfileOps(ctx),
        ...createRankingsOps(ctx),
        ...createAiSettingsOps(ctx),
        ...createFavoriteOps(ctx),
        ...createRecoveredOps(ctx),
        links: createLinkStore(repo),
        fileHandles: createFileHandleStore(repo, ctx.now),
        locations: createLocationStore(repo),
        subscribeWrites: (listener) => {
            writeListeners.add(listener);
            return () => writeListeners.delete(listener);
        },
    };
}
