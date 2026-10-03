import { describe, expect, it, vi } from "vitest";
import { createStaleSignal, openPlannerStore } from "@/apps/planner/src/store/open-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { StorageBlockedError } from "@/apps/planner/src/store/idb-repo";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";

const QUERY = { teamId: "local", isTemplate: true, page: 1, limit: 100, dateFilter: "all" as const };

describe("openPlannerStore", () => {
    it("uses the opened repo and seeds the starter drills", async () => {
        const { store, durable } = await openPlannerStore({ open: async () => ({ ...createMemoryRepo(), durable: true }) });
        expect(durable).toBe(true);
        const library = await store.getPlaysByTeam(QUERY);
        expect(library.success && library.data.total).toBe(STARTER_PLAYS.length);
    });

    it("falls back to memory when IndexedDB fails to open", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const { store, durable } = await openPlannerStore({ open: () => Promise.reject(new Error("SecurityError")) });
        expect(durable).toBe(false);
        expect((await store.listSessions()).success).toBe(true);
        error.mockRestore();
    });

    it("marks the tab stale when an older tab blocks the upgrade", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const stale = createStaleSignal();
        await openPlannerStore({ open: () => Promise.reject(new StorageBlockedError()), stale });
        expect(stale.isStale()).toBe(true);
        error.mockRestore();
    });
});

describe("createStaleSignal", () => {
    it("notifies subscribers once", () => {
        const stale = createStaleSignal();
        const listener = vi.fn();
        stale.subscribe(listener);
        stale.markStale();
        stale.markStale();
        expect(stale.isStale()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
