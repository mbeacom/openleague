import { describe, expect, it, vi } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLibraryOps, dateFilterStart } from "@/apps/planner/src/store/library";
import { STORAGE_FULL_MESSAGE, createStoreContext } from "@/apps/planner/src/store/shared";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import type { StoredPlay } from "@/apps/planner/src/store/records";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { PLAY_DATA_UNREADABLE_CODE, PLAY_DATA_UNREADABLE_MESSAGE, createEmptyPlayData } from "@/lib/utils/play-data";

const QUERY = { teamId: LOCAL_TEAM_ID, isTemplate: true, page: 1, limit: 20, dateFilter: "all" as const };

describe.each(REPOS)("library (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, library: createLibraryOps(createStoreContext(h.repo, h.options)) };
    }

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

    it("seeds the starter drills once, skipping names already in the library, and never re-seeds", async () => {
        const { library } = await setup();
        await addLibraryPlay(library, STARTER_PLAYS[0].name.toUpperCase());
        await library.seedStarterDrills();
        const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(all.success && all.data.total).toBe(STARTER_PLAYS.length);

        const starterId = all.success ? all.data.plays.find((p) => p.name === STARTER_PLAYS[1].name)!.id : "";
        await library.deletePlay({ id: starterId, teamId: LOCAL_TEAM_ID });
        await library.seedStarterDrills();
        const after = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(after.success && after.data.total).toBe(STARTER_PLAYS.length - 1);
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
