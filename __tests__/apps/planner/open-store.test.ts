import { describe, expect, it, vi } from "vitest";
import { createStaleSignal, openPlannerStore } from "@/apps/planner/src/store/open-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { StorageBlockedError } from "@/apps/planner/src/store/idb-repo";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";

/** A PNG data URL whose header says `width` px (the probe reads only the header). */
function pngOfWidth(width: number): string {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, width);
    return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

const QUERY = { teamId: "local", isTemplate: true, page: 1, limit: 100, dateFilter: "all" as const };

describe("openPlannerStore", () => {
    it("uses the opened repo and seeds the starter drills", async () => {
        const { store, durable } = await openPlannerStore({ open: async () => ({ ...createMemoryRepo(), durable: true }) });
        expect(durable).toBe(true);
        const library = await store.getPlaysByTeam(QUERY);
        expect(library.success && library.data.total).toBe(STARTER_PLAYS.length);
    });

    it("upgrades old 1× thumbnails after seeding", async () => {
        const repo = createMemoryRepo();
        const at = new Date("2026-10-06T12:00:00");
        await repo.write((tx) => tx.putPlay({ id: "old", name: "Old", description: null, thumbnail: pngOfWidth(300), playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at }));
        await openPlannerStore({ open: async () => repo, storeOptions: { makeThumbnail: () => pngOfWidth(600) } });
        expect((await repo.read((tx) => tx.getPlay("old")))?.thumbnail).toBe(pngOfWidth(600));
    });

    it("draws each starter once on a fresh device: the style refresh runs before seeding", async () => {
        const makeThumbnail = vi.fn(() => pngOfWidth(600));
        await openPlannerStore({ open: async () => createMemoryRepo(), storeOptions: { makeThumbnail } });
        expect(makeThumbnail).toHaveBeenCalledTimes(STARTER_PLAYS.length);
    });

    it("logs, and still opens, when the thumbnail upgrade fails", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const repo = createMemoryRepo();
        const at = new Date("2026-10-06T12:00:00");
        await repo.write((tx) => tx.putPlay({ id: "old", name: "Old", description: null, thumbnail: pngOfWidth(300), playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at }));
        const failingWrites = { ...repo, write: () => Promise.reject(new Error("QuotaExceededError")) };
        const { store } = await openPlannerStore({ open: async () => failingWrites, storeOptions: { makeThumbnail: () => pngOfWidth(600) } });
        expect(store).toBeDefined();
        expect(error).toHaveBeenCalledWith("Couldn't refresh drill thumbnails:", expect.any(Error));
        error.mockRestore();
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

    it("marks the tab stale when a newer planner already upgraded the database, and still renders from memory", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const stale = createStaleSignal();
        const { store, durable } = await openPlannerStore({
            open: () => Promise.reject(new DOMException("The requested version is less than the existing version.", "VersionError")),
            stale,
        });
        expect(stale.isStale()).toBe(true);
        expect(durable).toBe(false);
        expect((await store.listSessions()).success).toBe(true);
        error.mockRestore();
    });

    it("does not mark the tab stale for other open failures", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const stale = createStaleSignal();
        await openPlannerStore({ open: () => Promise.reject(new DOMException("denied", "SecurityError")), stale });
        expect(stale.isStale()).toBe(false);
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
