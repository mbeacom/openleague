/**
 * The local-store contract runs against both repos (ADR-0020): the in-memory
 * fallback and IndexedDB (fake-indexeddb, a fresh factory per test). The clock
 * and ids are injected: never vi.useFakeTimers with fake-indexeddb.
 */
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { openIdbRepo } from "@/apps/planner/src/store/idb-repo";
import type { PlannerRepo } from "@/apps/planner/src/store/records";
import type { LocalStoreOptions } from "@/apps/planner/src/store/types";
import type { PlannerStore } from "@/lib/planner-store";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";

let dbSeq = 0;

export const REPOS: Array<[string, () => Promise<PlannerRepo>]> = [
    ["memory", async () => createMemoryRepo()],
    ["indexeddb", () => openIdbRepo({ factory: new IDBFactory(), name: `store-test-${++dbSeq}` })],
];

export interface Clock {
    now: Date;
}

export async function openHarness(open: () => Promise<PlannerRepo>) {
    const repo = await open();
    const clock: Clock = { now: new Date("2026-10-07T12:00:00") };
    let id = 0;
    const options: Required<Pick<LocalStoreOptions, "now" | "newId">> & LocalStoreOptions = {
        now: () => new Date(clock.now),
        newId: () => `id-${++id}`,
    };
    return { repo, clock, options };
}

export async function addLibraryPlay(
    store: Pick<PlannerStore, "createPlay">,
    name: string,
    extra: { description?: string } = {},
): Promise<string> {
    const result = await store.createPlay({ name, playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID, ...extra });
    if (!result.success) throw new Error(result.error);
    return result.data.id;
}
