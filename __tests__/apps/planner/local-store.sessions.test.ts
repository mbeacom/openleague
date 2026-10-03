import { describe, expect, it, vi } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLocalPlannerStore, requestPersistence } from "@/apps/planner/src/store/local-store";
import { SESSION_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/store/sessions";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import type { LocalSessionDrill, LocalSessionSave } from "@/apps/planner/src/store/types";
import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID, LOCAL_TEAM_NAME } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { parsePlan, serializePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { SESSION_DRILL_REJECTED_MESSAGE } from "@/lib/utils/session-drill-ids";

const T = LOCAL_TEAM_ID;

function drill(playId: string, clientKey: string, sequence: number, overrides: Partial<LocalSessionDrill> = {}): LocalSessionDrill {
    return { playId, clientKey, sequence, runsWithPrevious: false, duration: 10, instructions: "", ...overrides };
}

function save(plays: LocalSessionDrill[], overrides: Partial<LocalSessionSave> = {}): LocalSessionSave {
    return { title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays, ...overrides };
}

describe.each(REPOS)("sessions (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    async function ownedIds(store: Awaited<ReturnType<typeof setup>>["store"], id: string): Promise<string[]> {
        const view = await store.getSessionView(id);
        return view.success ? view.data.plays.map((p) => p.play.id) : [];
    }

    it("creates a session whose library picks become owned clones, mapped per client key", async () => {
        const { store } = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const created = await store.createSession(save([drill(lib, "k1", 0)]));
        expect(created.success).toBe(true);
        if (!created.success) return;
        const [mapped] = created.data.plays;
        expect(mapped.clientKey).toBe("k1");
        expect(mapped.playId).not.toBe(lib);

        // The library play is unchanged and the clone never lists.
        const listing = await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(listing.success && listing.data.plays.map((p) => p.id)).toEqual([lib]);
        const edit = await store.getSessionForEdit(created.data.id);
        expect(edit.success && edit.data.initialData.plays[0]).toMatchObject({ id: "k1", playId: mapped.playId, name: "Breakout" });
    });

    it("keeps owned copies on update, clones a second card on the same copy, and drops removed copies", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const created = await store.createSession(save([drill(a, "ka", 0), drill(b, "kb", 1)]));
        if (!created.success) throw new Error(created.error);
        const [ownedA, ownedB] = created.data.plays.map((p) => p.playId);

        const updated = await store.updateSession(created.data.id, save([drill(ownedA, "ka", 0), drill(ownedA, "ka2", 1)]));
        if (!updated.success) throw new Error(updated.error);
        expect(updated.data.plays[0].playId).toBe(ownedA);
        expect(updated.data.plays[1].playId).not.toBe(ownedA);
        const ids = await ownedIds(store, created.data.id);
        expect(ids).toEqual([ownedA, updated.data.plays[1].playId]);
        expect(ids).not.toContain(ownedB);
    });

    it("keeps a dialog-created copy the editor hasn't sent yet, and deletes it with the session", async () => {
        const { repo, store } = await setup();
        const created = await store.createSession(save([]));
        if (!created.success) throw new Error(created.error);
        const fresh = await store.saveSessionDrill({ sessionId: created.data.id, teamId: T, name: "Fresh", playData: createEmptyPlayData() });
        if (!fresh.success) throw new Error(fresh.error);

        await store.updateSession(created.data.id, save([], { title: "Renamed" }));
        expect((await repo.read((tx) => tx.getPlay(fresh.data.playId)))?.sessionId).toBe(created.data.id);

        await store.deletePracticeSession({ id: created.data.id, teamId: T });
        expect(await repo.read((tx) => tx.getPlay(fresh.data.playId))).toBeUndefined();
        expect(await store.listSessions()).toEqual({ success: true, data: [] });
    });

    it("rejects an unknown or foreign drill atomically", async () => {
        const { repo, store } = await setup();
        const other = await store.createSession(save([]));
        if (!other.success) throw new Error(other.error);
        const foreign = await store.saveSessionDrill({ sessionId: other.data.id, teamId: T, name: "Theirs", playData: createEmptyPlayData() });
        if (!foreign.success) throw new Error(foreign.error);
        const lib = await addLibraryPlay(store, "Mine");
        const before = (await repo.read((tx) => tx.allPlays())).length;

        expect(await store.createSession(save([drill(lib, "k1", 0), drill(foreign.data.playId, "k2", 1)]))).toEqual({
            success: false,
            error: SESSION_DRILL_REJECTED_MESSAGE,
        });
        expect(await store.createSession(save([drill("missing", "k1", 0)]))).toMatchObject({ success: false, error: SESSION_DRILL_REJECTED_MESSAGE });
        // The clone of `lib` made before the rejection was rolled back.
        expect((await repo.read((tx) => tx.allPlays())).length).toBe(before);
        expect((await repo.read((tx) => tx.allSessions())).length).toBe(1);
    });

    it("enforces the hosted save rules through the plan document, writing nothing", async () => {
        const { repo, store } = await setup();
        const lib = await addLibraryPlay(store, "Long");
        const tooLong = await store.createSession(save([drill(lib, "k1", 0, { duration: 90 })], { duration: 60 }));
        expect(tooLong).toMatchObject({ success: false, error: "Practice timeline (90 min) exceeds session duration (60 min)" });
        expect(await store.createSession(save([], { title: "  " }))).toMatchObject({ success: false, error: "Title is required" });
        expect(await store.createSession(save([drill(lib, "k1", 0), drill(lib, "k1", 1)]))).toEqual({ success: false, error: "Each drill needs a unique key" });
        expect(await store.createSession(save([drill(lib, "k1", 0), drill(lib, "k2", 2)]))).toEqual({
            success: false,
            error: "Drill sequences must run 0, 1, 2… with no gaps or repeats",
        });
        expect(await store.createSession(save([], { date: new Date("nope") }))).toEqual({ success: false, error: "Valid date is required" });
        expect((await repo.read((tx) => tx.allSessions())).length).toBe(0);
    });

    it("saves session drills like hosted: create, update in place, fork a library play, refuse others", async () => {
        const { repo, store } = await setup();
        const s1 = await store.createSession(save([]));
        const s2 = await store.createSession(save([]));
        if (!s1.success || !s2.success) throw new Error("setup");
        const base = { sessionId: s1.data.id, teamId: T, name: "Drill", playData: createEmptyPlayData() };

        const created = await store.saveSessionDrill(base);
        if (!created.success) throw new Error(created.error);
        const updated = await store.saveSessionDrill({ ...base, playId: created.data.playId, name: "Renamed" });
        expect(updated).toEqual({ success: true, data: { playId: created.data.playId } });
        expect((await repo.read((tx) => tx.getPlay(created.data.playId)))?.name).toBe("Renamed");

        const lib = await addLibraryPlay(store, "Library");
        const forked = await store.saveSessionDrill({ ...base, playId: lib });
        if (!forked.success) throw new Error(forked.error);
        expect(forked.data.playId).not.toBe(lib);
        expect(await repo.read((tx) => tx.getPlay(forked.data.playId))).toMatchObject({ sessionId: s1.data.id, sourcePlayId: lib, isTemplate: false });

        expect(await store.saveSessionDrill({ ...base, sessionId: s2.data.id, playId: created.data.playId })).toEqual({
            success: false,
            error: SESSION_DRILL_REJECTED_MESSAGE,
        });
        expect(await store.saveSessionDrill({ ...base, sessionId: "missing" })).toEqual({ success: false, error: "Practice session not found" });
    });

    it("copies an owned drill into the library, and nothing else", async () => {
        const { store } = await setup();
        const s = await store.createSession(save([]));
        if (!s.success) throw new Error(s.error);
        const owned = await store.saveSessionDrill({ sessionId: s.data.id, teamId: T, name: "Keeper", playData: createEmptyPlayData() });
        if (!owned.success) throw new Error(owned.error);
        const copy = await store.copySessionDrillToLibrary({ playId: owned.data.playId, teamId: T });
        if (!copy.success) throw new Error(copy.error);
        const read = await store.getPlayById({ id: copy.data.playId, teamId: T });
        expect(read.success && read.data).toMatchObject({ name: "Keeper", isTemplate: true });
        expect(await store.copySessionDrillToLibrary({ playId: copy.data.playId, teamId: T })).toEqual({
            success: false,
            error: "Drill not found in this session",
        });
    });

    it("duplicates a session onto a new date with its own clones and the same row settings", async () => {
        const { store } = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const s = await store.createSession(save([drill(lib, "k1", 0, { instructions: "Hard", duration: 15 })]));
        if (!s.success) throw new Error(s.error);
        const date = new Date("2026-10-13T19:00:00");
        const copy = await store.duplicatePracticeSession({ id: s.data.id, teamId: T, date });
        if (!copy.success) throw new Error(copy.error);
        const view = await store.getSessionView(copy.data.id);
        expect(view.success && view.data).toMatchObject({ title: "Copy of Tuesday Skills", date: date.toISOString() });
        expect(view.success && view.data.plays[0]).toMatchObject({ instructions: "Hard", duration: 15 });
        const [original] = await ownedIds(store, s.data.id);
        expect(view.success && view.data.plays[0].play.id).not.toBe(original);
    });

    it("lists sessions newest date first", async () => {
        const { store } = await setup();
        await store.createSession(save([], { title: "Early", date: new Date("2026-10-01T19:00:00") }));
        await store.createSession(save([], { title: "Late", date: new Date("2026-10-08T19:00:00") }));
        const result = await store.listSessions();
        expect(result.success && result.data.map((s) => [s.title, s.drillCount])).toEqual([["Late", 0], ["Early", 0]]);
    });

    it("reads views with local constants, null for unreadable diagrams, and normalized editor groups", async () => {
        const { repo, store } = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const s = await store.createSession(save([drill(lib, "k1", 0)]));
        if (!s.success) throw new Error(s.error);
        const ownedId = s.data.plays[0].playId;
        await repo.write(async (tx) => {
            const play = await tx.getPlay(ownedId);
            await tx.putPlay({ ...play!, playData: { version: 99 } });
        });
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const view = await store.getSessionView(s.data.id);
        expect(view.success && view.data).toMatchObject({ teamId: T, teamName: LOCAL_TEAM_NAME, createdByName: LOCAL_AUTHOR_NAME, isShared: false, venueId: null });
        expect(view.success && view.data.plays[0].play.playData).toBeNull();
        const edit = await store.getSessionForEdit(s.data.id);
        expect(edit.success && edit.data.initialData.plays[0]).toMatchObject({ playDataUnreadable: true, sequence: 0, runsWithPrevious: false });
        error.mockRestore();
        expect(await store.getSessionView("missing")).toEqual({ success: false, error: SESSION_NOT_ON_DEVICE_MESSAGE });
    });

    it("exports every saved session as a plan the hosted platform accepts", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const s = await store.createSession(save([drill(a, "k1", 0), drill(b, "k2", 1, { runsWithPrevious: true })]));
        if (!s.success) throw new Error(s.error);
        const view = await store.getSessionView(s.data.id);
        if (!view.success) throw new Error(view.error);
        const doc = buildPlanDocument(view.data, new Date(), "openleague-static");
        expect(parsePlan(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    });

    it("imports a plan as a session with owned drills, plus library copies on request", async () => {
        const { store } = await setup();
        const plan = serializePlan(
            {
                title: "Imported",
                durationMinutes: 45,
                date: "2026-10-06",
                startTime: "19:00",
                drills: [
                    { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Go", name: "One", description: null, playData: createEmptyPlayData() },
                    { sequence: 1, duration: 10, runsWithPrevious: true, instructions: null, name: "Two", description: "d", playData: createEmptyPlayData() },
                ],
            },
            "openleague-hosted",
        );
        const date = new Date("2026-10-06T19:00:00");
        const plain = await store.importPlan(plan, { date, addToLibrary: false });
        if (!plain.success) throw new Error(plain.error);
        const view = await store.getSessionView(plain.data.sessionId);
        expect(view.success && view.data).toMatchObject({ title: "Imported", duration: 45, date: date.toISOString() });
        expect(view.success && view.data.plays.map((p) => [p.play.name, p.runsWithPrevious, p.instructions])).toEqual([
            ["One", false, "Go"],
            ["Two", true, null],
        ]);
        const libraryBefore = await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(libraryBefore.success && libraryBefore.data.total).toBe(0);

        await store.importPlan(plan, { date, addToLibrary: true });
        const libraryAfter = await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(libraryAfter.success && libraryAfter.data.plays.map((p) => p.name).sort()).toEqual(["One", "Two"]);
    });

    it("refuses an import that isn't a valid plan", async () => {
        const { store } = await setup();
        const result = await store.importPlan({ format: "nope" } as never, { date: new Date(), addToLibrary: false });
        expect(result).toMatchObject({ success: false, error: "This file isn't an OpenLeague practice plan." });
    });
});

describe("requestPersistence", () => {
    it("asks the browser once per database, after the first user write", async () => {
        const persist = vi.fn().mockResolvedValue(true);
        const repo = { ...createMemoryRepo(), durable: true };
        await requestPersistence(repo, { persist } as unknown as StorageManager);
        await requestPersistence(repo, { persist } as unknown as StorageManager);
        expect(persist).toHaveBeenCalledTimes(1);
    });

    it("never throws when the API is missing or refuses", async () => {
        const repo = { ...createMemoryRepo(), durable: true };
        await expect(requestPersistence(repo, undefined)).resolves.toBeUndefined();
        await expect(requestPersistence(repo, { persist: vi.fn().mockRejectedValue(new Error("no")) } as unknown as StorageManager)).resolves.toBeUndefined();
    });
});
