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
import type { ActionResult } from "@/lib/planner-store";
import { GOALIES_ATTENDING_MESSAGE } from "@/lib/utils/drill-tags";
import {
    BLOCK_HAS_NO_DRILL_MESSAGE,
    BLOCK_LABEL_MESSAGE,
    DRILL_NEEDS_PLAY_MESSAGE,
    PLAY_DURATION_INT_MESSAGE,
    PLAY_DURATION_MAX_MESSAGE,
    PLAY_DURATION_MIN_MESSAGE,
    ROW_INSTRUCTIONS_MESSAGE,
    ROW_KIND_MESSAGE,
    TRANSITION_MINUTES_MESSAGE,
    drillRows,
    isDrillRow,
    type DrillRowInput,
} from "@/lib/utils/session-rows";
import { BLOCK_ROW_FIELDS_ERROR, BLOCK_STATION_ERROR, ROTATION_PLACEMENT_ERROR, ROTATION_TOO_FEW_ERROR } from "@/lib/utils/session-timeline";

const T = LOCAL_TEAM_ID;

function drill(playId: string, clientKey: string, sequence: number, overrides: Partial<DrillRowInput> = {}): DrillRowInput {
    return { playId, clientKey, sequence, runsWithPrevious: false, duration: 10, instructions: "", ...overrides };
}

function save(plays: LocalSessionDrill[], overrides: Partial<LocalSessionSave> = {}): LocalSessionSave {
    return { title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays, ...overrides };
}

function data<T>(result: ActionResult<T>): T {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

describe.each(REPOS)("sessions (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    async function ownedIds(store: Awaited<ReturnType<typeof setup>>["store"], id: string): Promise<string[]> {
        const view = await store.getSessionView(id);
        return view.success ? drillRows(view.data.plays).map((p) => p.play.id) : [];
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
        expect(view.success && drillRows(view.data.plays)[0].play.id).not.toBe(original);
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
        expect(view.success && drillRows(view.data.plays)[0].play.playData).toBeNull();
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
        expect(view.success && drillRows(view.data.plays).map((p) => [p.play.name, p.runsWithPrevious, p.instructions])).toEqual([
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

    it("carries drill tags and the goalie count through saves, forks, add-to-library and duplicate", async () => {
        const { store } = await setup();
        const lib = data(await store.createPlay({ name: "Warm-up", playData: createEmptyPlayData(), isTemplate: true, teamId: T, focus: "goalies", goalies: "required" }));
        const session = data(await store.createSession(save([drill(lib.id, "k1", 0)], { goaliesAttending: 1 })));

        const view = data(await store.getSessionView(session.id));
        expect(view.goaliesAttending).toBe(1);
        expect(drillRows(view.plays)[0].play).toMatchObject({ focus: "goalies", goalies: "required" });
        const edit = data(await store.getSessionForEdit(session.id));
        expect(edit.initialData.goaliesAttending).toBe(1);
        expect(edit.initialData.plays[0]).toMatchObject({ focus: "goalies", goalies: "required" });

        // A fork with no tags sent inherits the library drill's.
        const fork = data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: lib.id, name: "Warm-up", playData: createEmptyPlayData() }));
        const copied = data(await store.copySessionDrillToLibrary({ playId: fork.playId, teamId: T }));
        expect(data(await store.getPlayById({ id: copied.playId, teamId: T }))).toMatchObject({ focus: "goalies", goalies: "required" });

        // Saving an owned drill in place with new tags changes them.
        const owned = drillRows(view.plays)[0].play.id;
        data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: owned, name: "Warm-up", playData: createEmptyPlayData(), goalies: "optional" }));
        expect(drillRows(data(await store.getSessionView(session.id)).plays)[0].play).toMatchObject({ focus: "goalies", goalies: "optional" });

        const duplicate = data(await store.duplicatePracticeSession({ id: session.id, teamId: T, date: new Date("2026-10-13T19:00:00") }));
        const copy = data(await store.getSessionView(duplicate.id));
        expect(copy.goaliesAttending).toBe(1);
        expect(drillRows(copy.plays)[0].play).toMatchObject({ focus: "goalies", goalies: "optional" });
    });

    it("keeps the goalie count when an update omits it, clears it on null, and refuses an out-of-range count", async () => {
        const { store } = await setup();
        const { id } = data(await store.createSession(save([], { goaliesAttending: 2 })));
        data(await store.updateSession(id, save([])));
        expect(data(await store.getSessionView(id)).goaliesAttending).toBe(2);
        data(await store.updateSession(id, save([], { goaliesAttending: null })));
        expect(data(await store.getSessionView(id)).goaliesAttending).toBeNull();
        expect(await store.updateSession(id, save([], { goaliesAttending: 11 }))).toEqual({ success: false, error: GOALIES_ATTENDING_MESSAGE });
        expect(await store.createSession(save([], { goaliesAttending: -1 }))).toEqual({ success: false, error: GOALIES_ATTENDING_MESSAGE });
    });

    it("imports a plan's tags and goalie count, and exports them back", async () => {
        const { store } = await setup();
        const document = serializePlan(
            {
                title: "Goalie night", durationMinutes: 30, date: null, startTime: null, goaliesAttending: 0,
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Warm-up", description: "", focus: "goalies", goalies: "required", playData: createEmptyPlayData() }],
            },
            "openleague-static",
        );
        const { sessionId } = data(await store.importPlan(document, { date: new Date("2026-10-06T19:00:00"), addToLibrary: true }));
        const view = data(await store.getSessionView(sessionId));
        expect(view.goaliesAttending).toBe(0);
        const exported = buildPlanDocument(view, new Date(), "openleague-static");
        expect(exported.session.goaliesAttending).toBe(0);
        expect(drillRows(exported.session.drills)[0].drill).toMatchObject({ focus: "goalies", goalies: "required" });
        const library = data(await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all", focus: "goalies" }));
        expect(library.total).toBe(1);
    });

    it("reads a session stored before goalie counts as not set", async () => {
        const { repo, store, clock } = await setup();
        await repo.write((tx) => tx.putSession({ id: "old", title: "Old", date: clock.now, duration: 60, rows: [], createdAt: clock.now, updatedAt: clock.now }));
        expect(data(await store.getSessionView("old")).goaliesAttending).toBeNull();
        expect(data(await store.getSessionForEdit("old")).initialData.goaliesAttending).toBeNull();
    });

    it("saves block rows, rotation, stays and the gap, and reads them back in the view, the editor and the list", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const { id } = data(await store.createSession(save([
            { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "Laps", label: null },
            drill(a, "ka", 1, { stays: false, rotateEveryMinutes: 5, duration: 5 }),
            drill(b, "kb", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
            { kind: "cooldown", clientKey: "kc", sequence: 3, duration: 5, instructions: "", label: "Stretch" },
        ], { transitionMinutes: 2 })));

        const view = data(await store.getSessionView(id));
        expect(view.transitionMinutes).toBe(2);
        expect(view.plays.map((row) => (isDrillRow(row) ? row.play.name : row.kind))).toEqual(["warmup", "A", "B", "cooldown"]);
        expect(view.plays[3]).toEqual({ id: "kc", kind: "cooldown", label: "Stretch", sequence: 3, duration: 5, instructions: null, runsWithPrevious: false });
        expect(view.plays.slice(1, 3).map((row) => isDrillRow(row) && [row.rotateEveryMinutes, row.stays])).toEqual([[5, false], [null, false]]);

        const edit = data(await store.getSessionForEdit(id));
        expect(edit.initialData.transitionMinutes).toBe(2);
        expect(edit.initialData.plays[0]).toEqual({ id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "Laps", runsWithPrevious: false });
        expect(edit.initialData.plays[1]).toMatchObject({ stays: false, rotateEveryMinutes: 5 });

        expect(data(await store.listSessions())[0].drillCount).toBe(2);
    });

    it("stores each rotating station's minutes as the editor shows them: M, or the whole block for a stays station", async () => {
        const { store } = await setup();
        const [a, b, g] = [await addLibraryPlay(store, "A"), await addLibraryPlay(store, "B"), await addLibraryPlay(store, "G")];
        const minutes = async (id: string) => data(await store.getSessionView(id)).plays.map((row) => row.duration);
        const created = data(await store.createSession(save([
            drill(a, "ka", 0, { stays: false, rotateEveryMinutes: 5, duration: 12 }),
            drill(b, "kb", 1, { runsWithPrevious: true, stays: false, duration: 7 }),
            drill(g, "kg", 2, { runsWithPrevious: true, stays: true, duration: 3 }),
        ])));
        expect(await minutes(created.id)).toEqual([5, 5, 10]);
        const [ownedA, ownedB, ownedG] = created.plays.map((p) => p.playId);
        data(await store.updateSession(created.id, save([
            drill(ownedA, "ka", 0, { rotateEveryMinutes: 6, duration: 9 }),
            drill(ownedB, "kb", 1, { runsWithPrevious: true, duration: 9 }),
            drill(ownedG, "kg", 2, { runsWithPrevious: true, duration: 9 }),
        ])));
        expect(await minutes(created.id)).toEqual([6, 6, 12]);
    });

    it("keeps the gap and each drill's rotation and stays when an update leaves them out, and clears them when told", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const created = data(await store.createSession(save([
            drill(a, "ka", 0, { stays: false, rotateEveryMinutes: 5 }),
            drill(b, "kb", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null }),
        ], { transitionMinutes: 3 })));
        const [ownedA, ownedB] = created.plays.map((p) => p.playId);

        data(await store.updateSession(created.id, save([drill(ownedA, "ka", 0), drill(ownedB, "kb", 1, { runsWithPrevious: true })])));
        const kept = data(await store.getSessionView(created.id));
        expect(kept.transitionMinutes).toBe(3);
        expect(kept.plays.map((row) => isDrillRow(row) && row.rotateEveryMinutes)).toEqual([5, null]);

        data(await store.updateSession(created.id, save([drill(ownedA, "ka", 0, { rotateEveryMinutes: null })], { transitionMinutes: 0 })));
        const cleared = data(await store.getSessionView(created.id));
        expect(cleared.transitionMinutes).toBe(0);
        expect(cleared.plays.map((row) => isDrillRow(row) && row.rotateEveryMinutes)).toEqual([null]);
    });

    it("lets inherited timing that no longer fits give way, as hosted, and still refuses timing that was sent", async () => {
        const { store } = await setup();
        const [a, b, c] = [await addLibraryPlay(store, "A"), await addLibraryPlay(store, "B"), await addLibraryPlay(store, "C")];
        const created = data(await store.createSession(save([
            drill(a, "ka", 0, { stays: false, rotateEveryMinutes: 5 }),
            drill(b, "kb", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null }),
            drill(c, "kc", 2, { runsWithPrevious: true, stays: true, rotateEveryMinutes: null }),
        ])));
        const [ownedA, , ownedC] = created.plays.map((p) => p.playId);
        const timing = async () => data(await store.getSessionView(created.id)).plays.map((row) => isDrillRow(row) && [row.rotateEveryMinutes, row.stays]);

        // A sent rotation that can't run is refused, whether the rule it breaks is the count or the placement.
        expect(await store.updateSession(created.id, save([drill(ownedA, "ka", 0, { rotateEveryMinutes: 5 }), drill(ownedC, "kc", 1, { runsWithPrevious: true, stays: true })])))
            .toEqual({ success: false, error: ROTATION_TOO_FEW_ERROR });
        expect(await store.updateSession(created.id, save([drill(ownedA, "ka", 0, { rotateEveryMinutes: 5 })])))
            .toEqual({ success: false, error: ROTATION_PLACEMENT_ERROR });

        // B removed, the rotation sent: C's inherited "stays" gives way so the rotation can run.
        data(await store.updateSession(created.id, save([drill(ownedA, "ka", 0, { rotateEveryMinutes: 5 }), drill(ownedC, "kc", 1, { runsWithPrevious: true })])));
        expect(await timing()).toEqual([[5, false], [null, false]]);

        // C removed and nothing sent: A's inherited rotation gives way instead of failing the save.
        data(await store.updateSession(created.id, save([drill(ownedA, "ka", 0)])));
        expect(await timing()).toEqual([[null, false]]);
    });

    it("refuses what hosted refuses, writing nothing", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        expect(await store.createSession(save([
            drill(a, "k1", 0, { stays: false, rotateEveryMinutes: 5 }),
            drill(a, "k2", 1, { runsWithPrevious: true, stays: true }),
        ]))).toEqual({ success: false, error: ROTATION_TOO_FEW_ERROR });
        expect(await store.createSession(save([
            { kind: "break", clientKey: "kb", sequence: 0, duration: 2, instructions: "", label: null },
            drill(a, "k1", 1, { runsWithPrevious: true }),
        ]))).toEqual({ success: false, error: BLOCK_STATION_ERROR });
        // 30 + 1 + 30 = 61
        expect(await store.createSession(save([drill(a, "k1", 0, { duration: 30 }), drill(a, "k2", 1, { duration: 30 })], { transitionMinutes: 1 })))
            .toEqual({ success: false, error: "Practice timeline (61 min) exceeds session duration (60 min)" });
        expect(await store.createSession(save([], { transitionMinutes: 6 }))).toEqual({ success: false, error: TRANSITION_MINUTES_MESSAGE });
        expect(await store.createSession(save([{ kind: "break", clientKey: "kb", sequence: 0, duration: 2, instructions: "", label: "x".repeat(61) }])))
            .toEqual({ success: false, error: BLOCK_LABEL_MESSAGE });
        // The row shapes hosted's schema rejects (ruling R7), with the same words: a drill with no
        // play, and a block that names one (built outside a literal, as an older or hand-made payload).
        expect(await store.createSession(save([drill("", "k1", 0)]))).toEqual({ success: false, error: DRILL_NEEDS_PLAY_MESSAGE });
        const blockWithDrill = { kind: "break" as const, clientKey: "kb", sequence: 0, duration: 2, instructions: "", label: null, playId: a };
        expect(await store.createSession(save([blockWithDrill]))).toEqual({ success: false, error: BLOCK_HAS_NO_DRILL_MESSAGE });
        expect(data(await store.listSessions())).toEqual([]);
    });

    describe("refuses the rows hosted's row schema refuses, in its words, writing nothing", () => {
        // Hand-made payloads (an older or foreign client): the fields a block row never carries.
        const breakRow = { kind: "break" as const, clientKey: "kb", sequence: 1, duration: 2, instructions: "", label: null };
        const cases: Array<[string, (play: string) => LocalSessionDrill[], string]> = [
            ["a fractional duration", (p) => [drill(p, "k1", 0, { duration: 1.5 })], PLAY_DURATION_INT_MESSAGE],
            ["a 0-minute row", (p) => [drill(p, "k1", 0), { ...breakRow, duration: 0 }], PLAY_DURATION_MIN_MESSAGE],
            ["a row over 300 minutes", (p) => [drill(p, "k1", 0, { duration: 301 })], PLAY_DURATION_MAX_MESSAGE],
            ["instructions over 2000 characters", (p) => [drill(p, "k1", 0), { ...breakRow, instructions: "x".repeat(2001) }], ROW_INSTRUCTIONS_MESSAGE],
            ["a block row run as a station", (p) => [drill(p, "k1", 0), { ...breakRow, runsWithPrevious: true }], BLOCK_STATION_ERROR],
            ["a block row that stays", (p) => [drill(p, "k1", 0), { ...breakRow, stays: true }], BLOCK_ROW_FIELDS_ERROR],
            ["a block row that rotates", (p) => [drill(p, "k1", 0), { ...breakRow, rotateEveryMinutes: 5 }], BLOCK_ROW_FIELDS_ERROR],
            ["an unknown row kind", (p) => [drill(p, "k1", 0), { ...breakRow, kind: "scrimmage" } as unknown as LocalSessionDrill], ROW_KIND_MESSAGE],
            ["a block row with an empty play id", (p) => [drill(p, "k1", 0), { ...breakRow, playId: "" } as unknown as LocalSessionDrill], BLOCK_HAS_NO_DRILL_MESSAGE],
        ];
        it.each(cases)("%s", async (_rule, rows, error) => {
            const { store } = await setup();
            const a = await addLibraryPlay(store, "A");
            expect(await store.createSession(save(rows(a)))).toEqual({ success: false, error });
            const kept = data(await store.createSession(save([drill(a, "k1", 0)])));
            const [owned] = kept.plays.map((p) => p.playId);
            expect(await store.updateSession(kept.id, save(rows(owned)))).toEqual({ success: false, error });
            expect(data(await store.listSessions())).toHaveLength(1);
        });
    });

    it("imports a plan with warm-up, drill, break, drill: each drill on its own copy, the break as it was", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const source = data(await store.createSession(save([
            { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "Laps", label: null },
            drill(a, "k1", 1, { duration: 12, instructions: "First" }),
            { kind: "break", clientKey: "kb", sequence: 2, duration: 3, instructions: "", label: "Water + tape" },
            drill(b, "k2", 3, { duration: 15, instructions: "Second" }),
        ], { transitionMinutes: 1 })));
        const doc = buildPlanDocument(data(await store.getSessionView(source.id)), new Date(), "openleague-static");
        const { sessionId } = data(await store.importPlan(JSON.parse(JSON.stringify(doc)), { date: new Date("2026-10-13T19:00:00"), addToLibrary: false }));
        const view = data(await store.getSessionView(sessionId));
        expect(view.transitionMinutes).toBe(1);
        expect(view.plays.map((row) => (isDrillRow(row) ? [row.play.name, row.duration, row.instructions] : [row.kind, row.duration, row.label]))).toEqual([
            ["warmup", 8, null],
            ["A", 12, "First"],
            ["break", 3, "Water + tape"],
            ["B", 15, "Second"],
        ]);
        const ids = view.plays.flatMap((row) => (isDrillRow(row) ? [row.play.id] : []));
        expect(new Set(ids).size).toBe(2);
        for (const id of ids) expect(source.plays.map((p) => p.playId)).not.toContain(id);
    });

    it("duplicates block rows as they are, each drill to its own clone, and the gap", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const source = data(await store.createSession(save([
            { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "", label: "Laps" },
            drill(a, "k1", 1),
            { kind: "break", clientKey: "kb", sequence: 2, duration: 2, instructions: "", label: null },
            drill(b, "k2", 3),
        ], { transitionMinutes: 1 })));
        const copy = data(await store.duplicatePracticeSession({ id: source.id, teamId: T, date: new Date("2026-10-13T19:00:00") }));
        const view = data(await store.getSessionView(copy.id));
        expect(view.transitionMinutes).toBe(1);
        expect(view.plays.map((row) => (isDrillRow(row) ? row.play.name : row.kind))).toEqual(["warmup", "A", "break", "B"]);
        expect(view.plays[0]).toMatchObject({ kind: "warmup", label: "Laps" });
        const copiedIds = view.plays.flatMap((row) => (isDrillRow(row) ? [row.play.id] : []));
        expect(copiedIds).toHaveLength(2);
        for (const id of copiedIds) expect(source.plays.map((p) => p.playId)).not.toContain(id);
    });

    it("reads a session stored before practice timing as drills with no gap", async () => {
        const { repo, store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const { id, plays } = data(await store.createSession(save([drill(a, "k1", 0)])));
        await repo.write(async (tx) => {
            const stored = await tx.getSession(id);
            if (!stored) throw new Error("session missing");
            await tx.putSession({
                id: stored.id, title: stored.title, date: stored.date, duration: stored.duration, createdAt: stored.createdAt, updatedAt: stored.updatedAt,
                rows: stored.rows.map((row) => ({ id: row.id, playId: row.playId, sequence: row.sequence, duration: row.duration, instructions: row.instructions, runsWithPrevious: row.runsWithPrevious })),
            });
        });
        const view = data(await store.getSessionView(id));
        expect(view.transitionMinutes).toBe(0);
        expect(view.plays[0]).toMatchObject({ stays: false, rotateEveryMinutes: null, play: { id: plays[0].playId } });
        expect(data(await store.getSessionForEdit(id)).initialData.plays[0]).toMatchObject({ stays: false, rotateEveryMinutes: null });
    });

    it("imports a plan's block rows, rotation and gap, and exports them back", async () => {
        const { store } = await setup();
        const document = serializePlan(
            {
                title: "Timed", durationMinutes: 60, date: null, startTime: null, transitionMinutes: 1,
                drills: [
                    { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", label: null, runsWithPrevious: false },
                    { sequence: 1, duration: 5, runsWithPrevious: false, instructions: "", name: "A", description: "", playData: createEmptyPlayData(), rotateEveryMinutes: 5 },
                    { sequence: 2, duration: 5, runsWithPrevious: true, instructions: "", name: "B", description: "", playData: createEmptyPlayData() },
                ],
            },
            "openleague-static",
        );
        const { sessionId } = data(await store.importPlan(document, { date: new Date("2026-10-06T19:00:00"), addToLibrary: false }));
        const view = data(await store.getSessionView(sessionId));
        expect(view.transitionMinutes).toBe(1);
        expect(view.plays.map((row) => row.kind ?? "drill")).toEqual(["warmup", "drill", "drill"]);
        const exported = buildPlanDocument(view, new Date(), "openleague-static");
        expect(exported.session.transitionMinutes).toBe(1);
        expect(exported.session.drills.map((entry) => entry.kind)).toEqual(["warmup", "drill", "drill"]);
        expect(exported.session.drills[1]).toMatchObject({ rotateEveryMinutes: 5 });
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
