import { describe, expect, it, vi } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLibraryOps, dateFilterStart } from "@/apps/planner/src/store/library";
import { STORAGE_FULL_MESSAGE, createStoreContext } from "@/apps/planner/src/store/shared";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { LEGACY_SEEDED_STARTER_IDS, META_SEEDED_STARTER_IDS, META_STARTERS_SEEDED, META_THUMBNAIL_STYLE, type StoredPlay } from "@/apps/planner/src/store/records";
import { THUMBNAIL_STYLE_VERSION } from "@/lib/utils/thumbnail-rules";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { PLAY_DATA_UNREADABLE_CODE, PLAY_DATA_UNREADABLE_MESSAGE, createEmptyPlayData } from "@/lib/utils/play-data";

const QUERY = { teamId: LOCAL_TEAM_ID, isTemplate: true, page: 1, limit: 20, dateFilter: "all" as const };

describe.each(REPOS)("library (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, library: createLibraryOps(createStoreContext(h.repo, h.options)) };
    }

    /** A PNG data URL whose header says `width` px (the probe reads only the header). */
    function pngOfWidth(width: number): string {
        const bytes = new Uint8Array(24);
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
        new DataView(bytes.buffer).setUint32(16, width);
        return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
    }

    it("replaces thumbnails narrower than 600 px once, and leaves 2× ones, non-PNGs and unreadable plays alone", async () => {
        const h = await openHarness(open);
        const fresh = pngOfWidth(600);
        const makeThumbnail = vi.fn(() => fresh);
        const library = createLibraryOps(createStoreContext(h.repo, { ...h.options, makeThumbnail }));
        const base = { description: null, isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: h.clock.now, updatedAt: h.clock.now };
        await h.repo.write(async (tx) => {
            // Thumbnails already in the current style: only the width decides here.
            await tx.putMeta(META_THUMBNAIL_STYLE, THUMBNAIL_STYLE_VERSION);
            await tx.putPlay({ ...base, id: "old", name: "Old", thumbnail: pngOfWidth(300), playData: createEmptyPlayData() });
            await tx.putPlay({ ...base, id: "new", name: "New", thumbnail: pngOfWidth(600), playData: createEmptyPlayData() });
            await tx.putPlay({ ...base, id: "jpeg", name: "Jpeg", thumbnail: "data:image/jpeg;base64,/9j/4AAQ", playData: createEmptyPlayData() });
            await tx.putPlay({ ...base, id: "bad", name: "Bad", thumbnail: pngOfWidth(300), playData: { version: 99 } as never });
        });

        expect(await library.refreshStoredThumbnails()).toBe(1);
        const thumb = async (id: string) => (await h.repo.read((tx) => tx.getPlay(id)))?.thumbnail;
        expect(await thumb("old")).toBe(fresh);
        expect(await thumb("new")).toBe(pngOfWidth(600));
        expect(await thumb("jpeg")).toBe("data:image/jpeg;base64,/9j/4AAQ");
        expect(await thumb("bad")).toBe(pngOfWidth(300));

        expect(await library.refreshStoredThumbnails()).toBe(0);
        expect(makeThumbnail).toHaveBeenCalledTimes(1);
    });

    it("redraws every stored thumbnail once when the thumbnail style changes, even full-width ones", async () => {
        const h = await openHarness(open);
        const fresh = pngOfWidth(600) + "NEW";
        const library = createLibraryOps(createStoreContext(h.repo, { ...h.options, makeThumbnail: () => fresh }));
        await h.repo.write((tx) => tx.putPlay({ id: "styled", name: "Styled", description: null, thumbnail: pngOfWidth(600), playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: h.clock.now, updatedAt: h.clock.now }));
        expect(await library.refreshStoredThumbnails()).toBe(1);
        expect((await h.repo.read((tx) => tx.getPlay("styled")))?.thumbnail).toBe(fresh);
        expect(await h.repo.read((tx) => tx.getMeta(META_THUMBNAIL_STYLE))).toBe(THUMBNAIL_STYLE_VERSION);
        expect(await library.refreshStoredThumbnails()).toBe(0);
    });

    it("redraws every stored thumbnail on a style change, whatever its format", async () => {
        const h = await openHarness(open);
        const fresh = pngOfWidth(600);
        const library = createLibraryOps(createStoreContext(h.repo, { ...h.options, makeThumbnail: () => fresh }));
        await h.repo.write((tx) => tx.putPlay({ id: "jpeg", name: "Jpeg", description: null, thumbnail: "data:image/jpeg;base64,/9j/4AAQ", playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: h.clock.now, updatedAt: h.clock.now }));
        expect(await library.refreshStoredThumbnails()).toBe(1);
        expect((await h.repo.read((tx) => tx.getPlay("jpeg")))?.thumbnail).toBe(fresh);
    });

    it("waits for the diagram font only when there is something to draw", async () => {
        const h = await openHarness(open);
        const order: string[] = [];
        const beforeStoredDraw = vi.fn(async () => { order.push("font"); });
        const makeThumbnail = vi.fn(() => { order.push("draw"); return pngOfWidth(600); });
        const library = createLibraryOps(createStoreContext(h.repo, { ...h.options, makeThumbnail, beforeStoredDraw }));
        await h.repo.write((tx) => tx.putMeta(META_THUMBNAIL_STYLE, THUMBNAIL_STYLE_VERSION));
        await library.refreshStoredThumbnails(); // nothing stored: nothing to draw
        expect(beforeStoredDraw).not.toHaveBeenCalled();
        await library.seedStarterDrills(); // starters to draw
        expect(order[0]).toBe("font");
        expect(order.filter((o) => o === "font")).toHaveLength(1);
        order.length = 0;
        await library.seedStarterDrills(); // already seeded
        expect(order).toEqual([]);
    });

    it("keeps the old thumbnail when a new one can't be made", async () => {
        const h = await openHarness(open);
        const library = createLibraryOps(createStoreContext(h.repo, { ...h.options, makeThumbnail: () => { throw new Error("no canvas"); } }));
        await h.repo.write((tx) => tx.putPlay({ id: "old", name: "Old", description: null, thumbnail: pngOfWidth(300), playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: h.clock.now, updatedAt: h.clock.now }));
        expect(await library.refreshStoredThumbnails()).toBe(0);
        expect((await h.repo.read((tx) => tx.getPlay("old")))?.thumbnail).toBe(pngOfWidth(300));
    });

    it("seeds each starter with its age groups", async () => {
        const { library } = await setup();
        await library.seedStarterDrills();
        const page = await library.getPlaysByTeam({ ...QUERY, limit: 100, search: "Keep-Away in a Box" });
        const id = page.success ? page.data.plays[0]?.id : undefined;
        const read = id ? await library.getPlayById({ id, teamId: LOCAL_TEAM_ID }) : null;
        expect(read?.success && read.data.ageGroups).toEqual(["u6", "u8", "u10"]);
    });

    it("lists only unowned templates, newest first, with page totals", async () => {
        const { repo, clock, library } = await setup();
        clock.now = new Date("2026-10-05T09:00:00");
        await addLibraryPlay(library, "Older");
        clock.now = new Date("2026-10-06T09:00:00");
        await addLibraryPlay(library, "Newer");
        await repo.write((tx) =>
            tx.putPlay({ id: "owned", name: "Owned copy", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: false, sessionId: "s1", sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now }),
        );
        const result = await library.getPlaysByTeam(QUERY);
        expect(result.success && result.data.plays.map((p) => p.name)).toEqual(["Newer", "Older"]);
        expect(result.success && result.data).toMatchObject({ total: 2, page: 1, limit: 20 });

        const page2 = await library.getPlaysByTeam({ ...QUERY, limit: 1, page: 2 });
        expect(page2.success && page2.data.plays.map((p) => p.name)).toEqual(["Older"]);
        expect(page2.success && page2.data.total).toBe(2);
    });

    it("searches name and description, case-insensitively", async () => {
        const { library } = await setup();
        await addLibraryPlay(library, "Breakout");
        await addLibraryPlay(library, "Regroup", { description: "Neutral-zone BREAKOUT support" });
        await addLibraryPlay(library, "Shooting");
        const result = await library.getPlaysByTeam({ ...QUERY, search: "  breakout " });
        expect(result.success && result.data.plays.map((p) => p.name).sort()).toEqual(["Breakout", "Regroup"]);
    });

    it("filters by creation date: today, this week from Sunday, this month", async () => {
        const { clock, library } = await setup();
        for (const [when, name] of [
            ["2026-09-20T09:00:00", "September"],
            ["2026-10-02T09:00:00", "Last week"],
            ["2026-10-05T09:00:00", "Monday"],
            ["2026-10-07T09:00:00", "Today"],
        ] as const) {
            clock.now = new Date(when);
            await addLibraryPlay(library, name);
        }
        clock.now = new Date("2026-10-07T12:00:00"); // a Wednesday
        const names = async (dateFilter: "today" | "week" | "month" | "all") => {
            const result = await library.getPlaysByTeam({ ...QUERY, dateFilter });
            return result.success ? result.data.plays.map((p) => p.name) : [];
        };
        expect(await names("today")).toEqual(["Today"]);
        expect(await names("week")).toEqual(["Today", "Monday"]);
        expect(await names("month")).toEqual(["Today", "Monday", "Last week"]);
        expect(await names("all")).toHaveLength(4);
    });

    it("validates a new drill's name, description and diagram", async () => {
        const { library } = await setup();
        const base = { playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID };
        expect(await library.createPlay({ ...base, name: " \u0001 " })).toEqual({ success: false, error: "Name is required" });
        expect(await library.createPlay({ ...base, name: "x".repeat(101) })).toEqual({ success: false, error: "Name must be at most 100 characters" });
        expect(await library.createPlay({ ...base, name: "Ok", description: "d".repeat(1001) })).toEqual({ success: false, error: "Description must be at most 1000 characters" });
        const bad = await library.createPlay({ ...base, name: "Ok", playData: { version: 2 } as never });
        expect(bad).toMatchObject({ success: false, error: "Invalid play data" });
    });

    it("reads a library play, refusing owned copies and flagging unreadable diagrams", async () => {
        const { repo, clock, library } = await setup();
        const id = await addLibraryPlay(library, "Breakout");
        const found = await library.getPlayById({ id, teamId: LOCAL_TEAM_ID });
        expect(found.success && found.data).toMatchObject({ id, name: "Breakout", isTemplate: true });

        const raw = (overrides: Partial<StoredPlay>): StoredPlay => ({ id: "x", name: "x", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now, ...overrides });
        await repo.write(async (tx) => {
            await tx.putPlay(raw({ id: "owned", sessionId: "s1", isTemplate: false }));
            await tx.putPlay(raw({ id: "broken", playData: { version: 99 } }));
        });
        expect(await library.getPlayById({ id: "owned", teamId: LOCAL_TEAM_ID })).toEqual({ success: false, error: "Play not found" });
        expect(await library.getPlayById({ id: "broken", teamId: LOCAL_TEAM_ID })).toEqual({
            success: false,
            error: PLAY_DATA_UNREADABLE_MESSAGE,
            details: { code: PLAY_DATA_UNREADABLE_CODE },
        });
    });

    it("updates library plays only", async () => {
        const { repo, clock, library } = await setup();
        const id = await addLibraryPlay(library, "Breakout");
        expect(await library.updatePlay({ id, name: "Breakout 2", description: "new", playData: createEmptyPlayData() })).toEqual({ success: true, data: { id } });
        const read = await library.getPlayById({ id, teamId: LOCAL_TEAM_ID });
        expect(read.success && [read.data.name, read.data.description]).toEqual(["Breakout 2", "new"]);
        await repo.write((tx) =>
            tx.putPlay({ id: "owned", name: "Owned", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: false, sessionId: "s1", sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now }),
        );
        expect(await library.updatePlay({ id: "owned", name: "No", playData: createEmptyPlayData() })).toEqual({ success: false, error: "Play not found" });
    });

    it("deletes library plays and refuses owned copies with the hosted message", async () => {
        const { repo, clock, library } = await setup();
        const id = await addLibraryPlay(library, "Breakout");
        expect(await library.deletePlay({ id, teamId: LOCAL_TEAM_ID })).toEqual({ success: true, data: { id, detachedSessions: 0 } });
        await repo.write((tx) =>
            tx.putPlay({ id: "owned", name: "Owned", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: false, sessionId: "s1", sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now }),
        );
        expect(await library.deletePlay({ id: "owned", teamId: LOCAL_TEAM_ID })).toEqual({
            success: false,
            error: "This drill belongs to a practice session. Remove it from that session.",
        });
        expect(await library.deletePlay({ id: "nope", teamId: LOCAL_TEAM_ID })).toEqual({ success: false, error: "Play not found" });
    });

    it("seeds every starter once, skipping names already in the library, records every id, and never re-seeds", async () => {
        const { repo, library } = await setup();
        await addLibraryPlay(library, STARTER_PLAYS[0].name.toUpperCase());
        await library.seedStarterDrills();
        const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(all.success && all.data.total).toBe(STARTER_PLAYS.length);
        expect(await repo.read((tx) => tx.getMeta(META_SEEDED_STARTER_IDS))).toEqual(STARTER_PLAYS.map((s) => s.id));

        const starterId = all.success ? all.data.plays.find((p) => p.name === STARTER_PLAYS[1].name)!.id : "";
        await library.deletePlay({ id: starterId, teamId: LOCAL_TEAM_ID });
        await library.seedStarterDrills();
        const after = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(after.success && after.data.total).toBe(STARTER_PLAYS.length - 1);
    });

    it("sets the legacy seeded flag on a fresh device, so an older cached build never re-seeds deleted originals", async () => {
        const { repo, library } = await setup();
        expect(await repo.read((tx) => tx.getMeta(META_STARTERS_SEEDED))).toBeFalsy();
        await library.seedStarterDrills();
        expect(await repo.read((tx) => tx.getMeta(META_STARTERS_SEEDED))).toBe(true);
    });

    it("stores each starter's tags", async () => {
        const { library } = await setup();
        await library.seedStarterDrills();
        const goalieDrills = await library.getPlaysByTeam({ ...QUERY, limit: 100, focus: "goalies" });
        expect(goalieDrills.success && goalieDrills.data.total).toBe(STARTER_PLAYS.filter((s) => s.focus === "goalies").length);
    });

    it("upgrades a device seeded before ids were tracked: adds only the new starters, never a deleted original", async () => {
        const { repo, library } = await setup();
        // A device that seeded the original nine (legacy flag), then deleted the first one.
        await repo.write((tx) => tx.putMeta(META_STARTERS_SEEDED, true));
        for (const id of LEGACY_SEEDED_STARTER_IDS.slice(1)) {
            await addLibraryPlay(library, STARTER_PLAYS.find((s) => s.id === id)!.name);
        }
        await library.seedStarterDrills();

        const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        const names = all.success ? all.data.plays.map((p) => p.name) : [];
        expect(names).not.toContain(STARTER_PLAYS.find((s) => s.id === LEGACY_SEEDED_STARTER_IDS[0])!.name);
        expect(all.success && all.data.total).toBe(STARTER_PLAYS.length - 1);
        expect(new Set(await repo.read((tx) => tx.getMeta(META_SEEDED_STARTER_IDS)) as string[])).toEqual(new Set(STARTER_PLAYS.map((s) => s.id)));
    });

    it("marks a new starter seeded when a coach's drill already has its name, so deleting that drill never brings the starter back", async () => {
        const { repo, library } = await setup();
        await repo.write((tx) => tx.putMeta(META_STARTERS_SEEDED, true));
        const warmUp = STARTER_PLAYS.find((s) => s.id === "starter-goalie-warmup")!;
        const mine = await addLibraryPlay(library, warmUp.name);
        await library.seedStarterDrills();
        const named = async () => {
            const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
            return all.success ? all.data.plays.filter((p) => p.name === warmUp.name).map((p) => p.id) : [];
        };
        expect(await named()).toEqual([mine]);
        await library.deletePlay({ id: mine, teamId: LOCAL_TEAM_ID });
        await library.seedStarterDrills();
        expect(await named()).toEqual([]);
    });

    it("filters by focus and goalies before paging, reading untagged records as team / optional", async () => {
        const { repo, clock, library } = await setup();
        const empty = createEmptyPlayData();
        await library.createPlay({ name: "Warm-up", playData: empty, isTemplate: true, teamId: LOCAL_TEAM_ID, focus: "goalies", goalies: "required" });
        await library.createPlay({ name: "Edges", playData: empty, isTemplate: true, teamId: LOCAL_TEAM_ID, focus: "skaters", goalies: "none" });
        const legacy: StoredPlay = {
            id: "legacy", name: "Legacy", description: null, thumbnail: null, playData: empty, isTemplate: true,
            sessionId: null, sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now,
        };
        await repo.write((tx) => tx.putPlay(legacy));
        const names = async (filters: { focus?: "team" | "skaters" | "goalies"; goalies?: "none" | "optional" | "required" }) => {
            const result = await library.getPlaysByTeam({ ...QUERY, ...filters });
            return result.success ? result.data.plays.map((p) => p.name).sort() : [];
        };
        expect(await names({ focus: "goalies" })).toEqual(["Warm-up"]);
        expect(await names({ focus: "team" })).toEqual(["Legacy"]);
        expect(await names({ goalies: "optional" })).toEqual(["Legacy"]);
        expect(await names({ focus: "skaters", goalies: "none" })).toEqual(["Edges"]);
        const page = await library.getPlaysByTeam({ ...QUERY, focus: "goalies", limit: 1, page: 1 });
        expect(page.success && page.data.total).toBe(1);
        const read = await library.getPlayById({ id: "legacy", teamId: LOCAL_TEAM_ID });
        expect(read.success && read.data).toMatchObject({ focus: "team", goalies: "optional" });
    });

    it("updatePlay keeps the tags unless new ones are sent", async () => {
        const { library } = await setup();
        const created = await library.createPlay({ name: "Warm-up", playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID, focus: "goalies", goalies: "required" });
        if (!created.success) throw new Error(created.error);
        await library.updatePlay({ id: created.data.id, name: "Warm-up", playData: createEmptyPlayData() });
        let read = await library.getPlayById({ id: created.data.id, teamId: LOCAL_TEAM_ID });
        expect(read.success && read.data).toMatchObject({ focus: "goalies", goalies: "required" });
        await library.updatePlay({ id: created.data.id, name: "Warm-up", playData: createEmptyPlayData(), goalies: "optional" });
        read = await library.getPlayById({ id: created.data.id, teamId: LOCAL_TEAM_ID });
        expect(read.success && read.data).toMatchObject({ focus: "goalies", goalies: "optional" });
    });
});

describe("LEGACY_SEEDED_STARTER_IDS", () => {
    it("pins the nine starters every device seeded before ids were tracked", () => {
        expect(LEGACY_SEEDED_STARTER_IDS).toEqual([
            "starter-breakout-5man", "starter-3man-weave", "starter-pp-umbrella", "starter-pk-box", "starter-122-forecheck",
            "starter-low-cycle", "starter-point-shot-screen", "starter-dzone-coverage", "starter-nz-regroup",
        ]);
        for (const id of LEGACY_SEEDED_STARTER_IDS) expect(STARTER_PLAYS.some((s) => s.id === id), id).toBe(true);
    });
});

describe("dateFilterStart", () => {
    it("starts the week on Sunday at midnight", () => {
        expect(dateFilterStart("week", new Date("2026-10-07T12:00:00"))).toEqual(new Date("2026-10-04T00:00:00"));
        expect(dateFilterStart("all", new Date())).toBeNull();
    });
});

describe("store failures", () => {
    it("maps a quota error to the storage-full message", async () => {
        const repo = createMemoryRepo();
        const full = { ...repo, write: () => Promise.reject(Object.assign(new Error("full"), { name: "QuotaExceededError" })) };
        const library = createLibraryOps(createStoreContext(full));
        expect(await library.createPlay({ name: "Breakout", playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID })).toEqual({
            success: false,
            error: STORAGE_FULL_MESSAGE,
        });
    });

    it("logs an unexpected error and returns the hosted fallback message", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const repo = createMemoryRepo();
        const broken = { ...repo, read: () => Promise.reject(new Error("boom")) };
        const library = createLibraryOps(createStoreContext(broken));
        expect(await library.getPlaysByTeam(QUERY)).toEqual({ success: false, error: "Failed to fetch plays. Please try again." });
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
