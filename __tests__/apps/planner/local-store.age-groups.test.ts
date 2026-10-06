/** Drill age groups in the static store (age-group templates spec R2, R3), against both repos. */
import { describe, expect, it } from "vitest";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import type { StoredPlay } from "@/apps/planner/src/store/records";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { serializePlan } from "@/lib/plan-document";
import type { ActionResult } from "@/lib/planner-store";
import { AGE_GROUP_REPEAT_MESSAGE, AGE_GROUP_UNKNOWN_MESSAGE, type AgeGroup } from "@/lib/utils/age-groups";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { drillRows } from "@/lib/utils/session-rows";

const T = LOCAL_TEAM_ID;
const QUERY = { teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" as const };

function data<R>(result: ActionResult<R>): R {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

const drill = (name: string, ageGroups?: AgeGroup[]) => ({
    name,
    playData: createEmptyPlayData(),
    isTemplate: true,
    teamId: T,
    ...(ageGroups && { ageGroups }),
});

describe.each(REPOS)("age groups in the static store (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    it("stores a new drill's groups in table order, none by default, and refuses bad ones as hosted does", async () => {
        const { store } = await setup();
        const aged = data(await store.createPlay(drill("Keep-Away", ["u8", "u6"])));
        const plain = data(await store.createPlay(drill("Weave")));
        expect(data(await store.getPlayById({ id: aged.id, teamId: T })).ageGroups).toEqual(["u6", "u8"]);
        expect(data(await store.getPlayById({ id: plain.id, teamId: T })).ageGroups).toEqual([]);
        expect(await store.createPlay(drill("Bad", ["u7" as AgeGroup]))).toEqual({ success: false, error: AGE_GROUP_UNKNOWN_MESSAGE });
        expect(await store.createPlay(drill("Twice", ["u8", "u8"]))).toEqual({ success: false, error: AGE_GROUP_REPEAT_MESSAGE });
    });

    it("reads a record saved before age groups as every age, and lists it under any age", async () => {
        const { repo, clock, store } = await setup();
        const legacy: StoredPlay = {
            id: "legacy", name: "Legacy", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            sessionId: null, sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now,
        };
        await repo.write((tx) => tx.putPlay(legacy));
        expect(data(await store.getPlayById({ id: "legacy", teamId: T })).ageGroups).toEqual([]);
        expect(data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u16plus" })).plays.map((p) => [p.name, p.ageGroups])).toEqual([["Legacy", []]]);
    });

    it("filters the library by age before paging, untagged drills included", async () => {
        const { store } = await setup();
        await store.createPlay(drill("Keep-Away", ["u6", "u8"]));
        await store.createPlay(drill("4-on-4", ["u12", "u14"]));
        await store.createPlay(drill("Edges"));
        const names = async (ageGroup?: AgeGroup) =>
            data(await store.getPlaysByTeam({ ...QUERY, ...(ageGroup && { ageGroup }) })).plays.map((p) => p.name).sort();
        expect(await names("u8")).toEqual(["Edges", "Keep-Away"]);
        expect(await names("u14")).toEqual(["4-on-4", "Edges"]);
        expect(await names()).toEqual(["4-on-4", "Edges", "Keep-Away"]);
        const page = data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u8", limit: 1 }));
        expect(page.total).toBe(2);
    });

    it("keeps the groups when an update leaves them out, and replaces them when sent", async () => {
        const { store } = await setup();
        const { id } = data(await store.createPlay(drill("Keep-Away", ["u8"])));
        data(await store.updatePlay({ id, name: "Keep-Away", playData: createEmptyPlayData() }));
        expect(data(await store.getPlayById({ id, teamId: T })).ageGroups).toEqual(["u8"]);
        data(await store.updatePlay({ id, name: "Keep-Away", playData: createEmptyPlayData(), ageGroups: [] }));
        expect(data(await store.getPlayById({ id, teamId: T })).ageGroups).toEqual([]);
        expect(await store.updatePlay({ id, name: "Keep-Away", playData: createEmptyPlayData(), ageGroups: ["u9" as AgeGroup] })).toEqual({
            success: false,
            error: AGE_GROUP_UNKNOWN_MESSAGE,
        });
    });

    it("carries the groups through a session, a fork, the dialog's save, copy to library and duplicate", async () => {
        const { repo, store } = await setup();
        const lib = data(await store.createPlay(drill("Keep-Away", ["u6", "u8"])));
        const session = data(await store.createSession({
            title: "Station night", date: new Date("2026-10-06T19:00:00"), duration: 60,
            plays: [{ playId: lib.id, clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
        }));
        const view = data(await store.getSessionView(session.id));
        expect(drillRows(view.plays)[0].play.ageGroups).toEqual(["u6", "u8"]);
        expect(data(await store.getSessionForEdit(session.id)).initialData.plays[0]).toMatchObject({ ageGroups: ["u6", "u8"] });

        // A fork with no groups sent inherits the library drill's.
        const fork = data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: lib.id, name: "Keep-Away", playData: createEmptyPlayData() }));
        const copied = data(await store.copySessionDrillToLibrary({ playId: fork.playId, teamId: T }));
        expect(data(await store.getPlayById({ id: copied.playId, teamId: T })).ageGroups).toEqual(["u6", "u8"]);

        // Saving the owned drill with new groups changes them; a new drill with none sent has none.
        const owned = drillRows(view.plays)[0].play.id;
        data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: owned, name: "Keep-Away", playData: createEmptyPlayData(), ageGroups: ["u10"] }));
        expect(drillRows(data(await store.getSessionView(session.id)).plays)[0].play.ageGroups).toEqual(["u10"]);
        const fresh = data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, name: "New", playData: createEmptyPlayData() }));
        expect((await repo.read((tx) => tx.getPlay(fresh.playId)))?.ageGroups).toEqual([]);
        expect(await store.saveSessionDrill({ sessionId: session.id, teamId: T, name: "Bad", playData: createEmptyPlayData(), ageGroups: ["u8", "u8"] })).toEqual({
            success: false,
            error: AGE_GROUP_REPEAT_MESSAGE,
        });

        const duplicate = data(await store.duplicatePracticeSession({ id: session.id, teamId: T, date: new Date("2026-10-13T19:00:00") }));
        expect(drillRows(data(await store.getSessionView(duplicate.id)).plays)[0].play.ageGroups).toEqual(["u10"]);
    });

    it("imports a plan's groups, onto the library copy too, and exports them back", async () => {
        const { store } = await setup();
        const document = serializePlan(
            {
                title: "Station night", durationMinutes: 30, date: null, startTime: null,
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Keep-Away", description: "", ageGroups: ["u6", "u8"], playData: createEmptyPlayData() }],
            },
            "openleague-static",
        );
        const { sessionId } = data(await store.importPlan(document, { date: new Date("2026-10-06T19:00:00"), addToLibrary: true }));
        const view = data(await store.getSessionView(sessionId));
        expect(drillRows(view.plays)[0].play.ageGroups).toEqual(["u6", "u8"]);
        expect(drillRows(buildPlanDocument(view, new Date(), "openleague-static").session.drills)[0].drill.ageGroups).toEqual(["u6", "u8"]);
        expect(data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u12" })).total).toBe(0);
        expect(data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u6" })).total).toBe(1);
    });
});
