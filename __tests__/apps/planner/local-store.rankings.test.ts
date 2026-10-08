import { describe, expect, it } from "vitest";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { META_RANKINGS } from "@/apps/planner/src/store/records";
import { RANKINGS_DAMAGED } from "@/apps/planner/src/store/rankings";
import { createRankingsDocument } from "@/lib/rankings-document";
import { REPOS, openHarness } from "./store-harness";

describe.each(REPOS)("rankings on %s", (_name, open) => {
    it("starts empty, saves, reads back and clears", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        expect(await store.getRankings()).toEqual({ success: true, data: null });

        const doc = { ...createRankingsDocument({ title: "Fall" }), teams: [{ number: "901", name: "Riverside M1", startingBracket: null, excluded: false }] };
        const saved = await store.saveRankings(doc);
        expect(saved).toEqual({ success: true, data: doc });
        expect(await store.getRankings()).toEqual({ success: true, data: doc });

        expect(await store.clearRankings()).toEqual({ success: true, data: null });
        expect(await store.getRankings()).toEqual({ success: true, data: null });
    });

    it("refuses an invalid document with the first issue", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        const bad = { ...createRankingsDocument({ title: "Fall" }), myTeam: "999" };
        const result = await store.saveRankings(bad);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toContain("Your team isn't in the team list");
    });

    it("says where in the document the first issue is", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        const bad = { ...createRankingsDocument({ title: "Fall" }), teams: [{ number: "901", name: "", startingBracket: null, excluded: false }] };
        const result = await store.saveRankings(bad);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.details).toEqual({ path: ["teams", 0, "name"] });
    });

    it("reports a damaged saved record instead of crashing", async () => {
        const { repo, options } = await openHarness(open);
        await repo.write((tx) => tx.putMeta(META_RANKINGS, { format: "openleague.rankings", version: 1, junk: true }));
        const store = createLocalPlannerStore(repo, options);
        expect(await store.getRankings()).toEqual({ success: false, error: RANKINGS_DAMAGED });
    });
});
