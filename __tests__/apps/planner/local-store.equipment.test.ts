/** Practice equipment in the static store (practice equipment spec R2, R3, R7), against both repos. */
import { describe, expect, it } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import type { StoredSession } from "@/apps/planner/src/store/records";
import type { LocalSessionDrill, LocalSessionSave } from "@/apps/planner/src/store/types";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import type { ActionResult } from "@/lib/planner-store";
import { EQUIPMENT_NAME_TAKEN_MESSAGE, PRACTICE_EQUIPMENT_LIMIT_MESSAGE } from "@/lib/utils/equipment-needs";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { drillRows, type DrillRowInput } from "@/lib/utils/session-rows";
import type { PlayData } from "@/types/practice-planner";

const T = LOCAL_TEAM_ID;
const BOTTLES = { name: "Water bottles", count: 20 };

function data<R>(result: ActionResult<R>): R {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

const drill = (playId: string, clientKey: string, sequence: number): DrillRowInput => ({ playId, clientKey, sequence, runsWithPrevious: false, duration: 10, instructions: "" });
const save = (plays: LocalSessionDrill[], overrides: Partial<LocalSessionSave> = {}): LocalSessionSave => ({
    title: "Riverside Tuesday",
    date: new Date("2026-10-06T19:00:00"),
    duration: 60,
    plays,
    ...overrides,
});

const CONED: PlayData = {
    ...createEmptyPlayData(),
    equipment: [{ id: "c1", kind: "cone", position: { x: 20, y: 20 }, rotation: 0 }],
    equipmentNeeds: { kinds: [{ kind: "cone", delta: 3, removed: false }], custom: [{ name: "Tennis balls", count: 6 }] },
};

describe.each(REPOS)("practice equipment in the static store (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    it("stores a create's list, cleaned, and reads it in the view and the editor; none by default", async () => {
        const { store } = await setup();
        const id = data(await store.createSession(save([], { equipment: [{ name: "  Water\tbottles ", count: 20 }] }))).id;
        expect(data(await store.getSessionView(id)).equipment).toEqual([BOTTLES]);
        expect(data(await store.getSessionForEdit(id)).initialData.equipment).toEqual([BOTTLES]);
        const plain = data(await store.createSession(save([]))).id;
        expect(data(await store.getSessionView(plain)).equipment).toEqual([]);
    });

    it("keeps the list when an update omits it, and clears it with []", async () => {
        const { store } = await setup();
        const id = data(await store.createSession(save([], { equipment: [BOTTLES] }))).id;
        data(await store.updateSession(id, save([], { title: "Renamed" })));
        expect(data(await store.getSessionView(id)).equipment).toEqual([BOTTLES]);
        data(await store.updateSession(id, save([], { equipment: [] })));
        expect(data(await store.getSessionView(id)).equipment).toEqual([]);
    });

    it("refuses what hosted refuses, in its words", async () => {
        const { store } = await setup();
        expect(await store.createSession(save([], { equipment: [{ name: "Marker", count: 1 }, { name: "marker", count: 2 }] }))).toMatchObject({ success: false, error: EQUIPMENT_NAME_TAKEN_MESSAGE });
        const many = Array.from({ length: 21 }, (_, i) => ({ name: `Item ${i}`, count: 1 }));
        expect(await store.createSession(save([], { equipment: many }))).toMatchObject({ success: false, error: PRACTICE_EQUIPMENT_LIMIT_MESSAGE });
    });

    it("reads a session stored before equipment as none", async () => {
        const { repo, clock, store } = await setup();
        const legacy: StoredSession = { id: "legacy", title: "Old", date: clock.now, duration: 60, rows: [], createdAt: clock.now, updatedAt: clock.now };
        await repo.write((tx) => tx.putSession(legacy));
        expect(data(await store.getSessionView("legacy")).equipment).toEqual([]);
    });

    it("keeps a drill's overrides in its diagram through a session save, a duplicate, an export and an import", async () => {
        const { store } = await setup();
        const lib = data(await store.createPlay({ name: "Cone Weave", playData: CONED, isTemplate: true, teamId: T })).id;
        const id = data(await store.createSession(save([drill(lib, "k1", 0)], { equipment: [BOTTLES] }))).id;
        const view = data(await store.getSessionView(id));
        expect(drillRows(view.plays)[0].play.playData?.equipmentNeeds).toEqual(CONED.equipmentNeeds);

        const copy = data(await store.duplicatePracticeSession({ id, teamId: T, date: new Date("2026-10-13T19:00:00") })).id;
        const copied = data(await store.getSessionView(copy));
        expect(copied.equipment).toEqual([BOTTLES]);
        expect(drillRows(copied.plays)[0].play.playData?.equipmentNeeds).toEqual(CONED.equipmentNeeds);

        const plan = buildPlanDocument(view, new Date("2026-10-07T12:00:00Z"), "openleague-static");
        expect(plan.session.equipment).toEqual([BOTTLES]);
        const imported = data(await store.importPlan(plan, { date: new Date("2026-10-20T19:00:00"), addToLibrary: false })).sessionId;
        const back = data(await store.getSessionView(imported));
        expect(back.equipment).toEqual([BOTTLES]);
        expect(drillRows(back.plays)[0].play.playData?.equipmentNeeds).toEqual(CONED.equipmentNeeds);
    });

    it("saves a session drill's overrides normalized", async () => {
        const { store } = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const created = data(await store.createSession(save([drill(lib, "k1", 0)])));
        const owned = created.plays[0].playId;
        data(await store.saveSessionDrill({
            sessionId: created.id,
            teamId: T,
            playId: owned,
            name: "Breakout",
            playData: { ...createEmptyPlayData(), equipmentNeeds: { kinds: [{ kind: "net", delta: 0, removed: false }], custom: [{ name: " Boards ", count: 2 }] } },
        }));
        const view = data(await store.getSessionView(created.id));
        expect(drillRows(view.plays)[0].play.playData?.equipmentNeeds).toEqual({ kinds: [], custom: [{ name: "Boards", count: 2 }] });
    });
});
