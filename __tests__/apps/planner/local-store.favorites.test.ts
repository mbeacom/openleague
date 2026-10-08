/** The static planner's favorites (practice favorites spec), against both repos. */
import { describe, expect, it } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { META_FAVORITES, readFavorites } from "@/apps/planner/src/store/favorites";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { FAVORITE_DRILL_NOT_FOUND, FAVORITE_PRACTICE_NOT_FOUND } from "@/lib/utils/planner-favorites";
import type { ActionResult } from "@/lib/planner-store";

function data<T>(result: ActionResult<T>): T {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

describe("readFavorites", () => {
    it("reads a damaged record as no favorites, and drops anything that isn't an id", () => {
        expect(readFavorites(undefined)).toEqual({ DRILL: [], PRACTICE: [] });
        expect(readFavorites("junk")).toEqual({ DRILL: [], PRACTICE: [] });
        expect(readFavorites({ DRILL: ["a", 4, "", null, "a"], PRACTICE: "b" })).toEqual({ DRILL: ["a"], PRACTICE: [] });
    });
});

describe.each(REPOS)("favorites (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        const store = createLocalPlannerStore(h.repo, h.options);
        const drillId = await addLibraryPlay(store, "Tight Turns");
        const session = data(await store.createSession({ title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] }));
        return { ...h, store, drillId, sessionId: session.id };
    }

    it("starts empty, then lists what was starred, newest first", async () => {
        const { store, drillId, sessionId } = await setup();
        expect(data(await store.listPlannerFavorites({ kind: "DRILL" }))).toEqual([]);
        const starter = STARTER_PLAYS[0].id;
        expect(data(await store.setPlannerFavorite({ kind: "DRILL", targetId: drillId, favorite: true }))).toEqual({
            kind: "DRILL",
            targetId: drillId,
            favorite: true,
        });
        data(await store.setPlannerFavorite({ kind: "DRILL", targetId: starter, favorite: true }));
        data(await store.setPlannerFavorite({ kind: "PRACTICE", targetId: sessionId, favorite: true }));
        expect(data(await store.listPlannerFavorites({ kind: "DRILL" }))).toEqual([starter, drillId]);
        expect(data(await store.listPlannerFavorites({ kind: "PRACTICE" }))).toEqual([sessionId]);
    });

    it("is idempotent, and unstars", async () => {
        const { store, drillId } = await setup();
        data(await store.setPlannerFavorite({ kind: "DRILL", targetId: drillId, favorite: true }));
        data(await store.setPlannerFavorite({ kind: "DRILL", targetId: drillId, favorite: true }));
        expect(data(await store.listPlannerFavorites({ kind: "DRILL" }))).toEqual([drillId]);
        data(await store.setPlannerFavorite({ kind: "DRILL", targetId: drillId, favorite: false }));
        data(await store.setPlannerFavorite({ kind: "DRILL", targetId: drillId, favorite: false }));
        expect(data(await store.listPlannerFavorites({ kind: "DRILL" }))).toEqual([]);
    });

    it("refuses targets that don't exist, session-owned copies, and bad input", async () => {
        const { store, sessionId } = await setup();
        expect(await store.setPlannerFavorite({ kind: "DRILL", targetId: "missing", favorite: true })).toEqual({ success: false, error: FAVORITE_DRILL_NOT_FOUND });
        expect(await store.setPlannerFavorite({ kind: "PRACTICE", targetId: "missing", favorite: true })).toEqual({
            success: false,
            error: FAVORITE_PRACTICE_NOT_FOUND,
        });
        // A practice id is not a drill.
        expect((await store.setPlannerFavorite({ kind: "DRILL", targetId: sessionId, favorite: true })).success).toBe(false);
        expect((await store.setPlannerFavorite({ kind: "TEAM" as never, targetId: sessionId, favorite: true })).success).toBe(false);
        expect((await store.setPlannerFavorite({ kind: "DRILL", targetId: "", favorite: true })).success).toBe(false);
        expect((await store.listPlannerFavorites({ kind: "TEAM" as never })).success).toBe(false);
        expect(data(await store.listPlannerFavorites({ kind: "DRILL" }))).toEqual([]);
    });

    it("keeps stars on deleted targets inert, and they can still be removed (spec R4)", async () => {
        const { store, drillId } = await setup();
        data(await store.setPlannerFavorite({ kind: "DRILL", targetId: drillId, favorite: true }));
        data(await store.deletePlay({ id: drillId, teamId: LOCAL_TEAM_ID }));
        expect(data(await store.listPlannerFavorites({ kind: "DRILL" }))).toEqual([drillId]);
        data(await store.setPlannerFavorite({ kind: "DRILL", targetId: drillId, favorite: false }));
        expect(data(await store.listPlannerFavorites({ kind: "DRILL" }))).toEqual([]);
    });

    it("survives reopening the store on the same repo", async () => {
        const { store, repo, options, sessionId } = await setup();
        data(await store.setPlannerFavorite({ kind: "PRACTICE", targetId: sessionId, favorite: true }));
        const again = createLocalPlannerStore(repo, options);
        expect(data(await again.listPlannerFavorites({ kind: "PRACTICE" }))).toEqual([sessionId]);
        expect(readFavorites(await repo.read((tx) => tx.getMeta(META_FAVORITES)))).toEqual({ DRILL: [], PRACTICE: [sessionId] });
    });

    it("never puts favorites in an exported plan (spec R2)", async () => {
        const { store, sessionId } = await setup();
        data(await store.setPlannerFavorite({ kind: "PRACTICE", targetId: sessionId, favorite: true }));
        const view = data(await store.getSessionView(sessionId));
        const text = JSON.stringify(buildPlanDocument(view, new Date(), "openleague-static"));
        expect(text).not.toMatch(/favorite/i);
        expect(text).not.toContain(sessionId);
    });
});
