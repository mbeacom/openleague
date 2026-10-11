import { describe, expect, it } from "vitest";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { RANKINGS_DAMAGED, RANKINGS_NOT_FOUND } from "@/apps/planner/src/store/rankings";
import { createLinkStore, docKeyOf } from "@/apps/planner/src/store/links";
import type { DocumentLink } from "@/apps/planner/src/store/records";
import { MAX_RANKINGS_FILE_BYTES, RANKINGS_FORMAT, RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE, createRankingsDocument } from "@/lib/rankings-document";
import { DAMAGED_RANKINGS_RECORD } from "./rankings-fixtures";
import { REPOS, openHarness } from "./store-harness";

const teams = [{ number: "901", name: "Riverside M1", startingBracket: null, excluded: false }];
const docTitled = (title: string) => ({ ...createRankingsDocument({ title }), teams });

function linkFor(docKey: string): DocumentLink {
    return {
        docKey,
        documentId: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11",
        connector: "local-file",
        remote: { fileId: "file-1", name: "fall.rankings.json" },
        baseRevision: "rev-1",
        baseHash: "abc",
        baseWrittenHere: true,
        dirty: false,
        lastSyncedAt: "2026-10-07T12:00:00.000Z",
    };
}

describe.each(REPOS)("rankings on %s", (_name, open) => {
    it("starts empty, saves, reads back and clears", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        expect(await store.getRankings()).toEqual({ success: true, data: null });

        const doc = docTitled("Fall");
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

    it("refuses a document past the file cap, so a saved document always exports and reopens", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        // Valid to the schema, but its file is larger than the cap (UTF-8 bytes, not characters).
        const big = { ...createRankingsDocument({ title: "Fall" }), snapshots: ["é".repeat(MAX_RANKINGS_FILE_BYTES / 2)] };
        expect(await store.saveRankings(big)).toEqual({ success: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE });
        expect(await store.getRankings()).toEqual({ success: true, data: null });
        expect(await store.createRankingsDocument(big)).toEqual({ success: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE });
    });

    it("reports a damaged saved record instead of crashing", async () => {
        const { repo, options } = await openHarness(open);
        await repo.write((tx) => tx.putRankingsRecord(DAMAGED_RANKINGS_RECORD));
        const store = createLocalPlannerStore(repo, options);
        expect(await store.getRankings()).toEqual({ success: false, error: RANKINGS_DAMAGED });
        expect(await store.getRankingsDocument("damaged")).toEqual({ success: false, error: RANKINGS_DAMAGED });
        const list = await store.listRankingsDocuments();
        expect(list.success && list.data).toEqual([{ id: "damaged", documentId: "damaged", title: null, damaged: true, updatedAt: DAMAGED_RANKINGS_RECORD.updatedAt }]);
        // "Start over" clears it.
        expect(await store.clearRankings()).toEqual({ success: true, data: null });
        expect(await store.getRankings()).toEqual({ success: true, data: null });
    });

    it("keeps one record for the screens: saving again updates it, under the same id", async () => {
        const { repo, clock, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        await store.saveRankings(docTitled("Fall"));
        clock.now = new Date("2026-10-08T12:00:00");
        await store.saveRankings(docTitled("Fall, revised"));
        const list = await store.listRankingsDocuments();
        expect(list.success && list.data).toEqual([
            { id: "id-1", documentId: "id-1", title: "Fall, revised", damaged: false, updatedAt: new Date("2026-10-08T12:00:00") },
        ]);
    });

    it("holds several documents by id; the screens show the most recently updated one", async () => {
        const { repo, clock, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        const first = await store.createRankingsDocument(docTitled("Fall"));
        clock.now = new Date("2026-10-08T12:00:00");
        const second = await store.createRankingsDocument(docTitled("Winter"), { documentId: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11" });
        if (!first.success || !second.success) throw new Error("create failed");
        expect(second.data.documentId).toBe("0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11");
        expect(first.data.documentId).toBe(first.data.id);

        let current = await store.getRankings();
        expect(current.success && current.data?.meta.title).toBe("Winter");

        // Editing the older one by id makes it the current one.
        clock.now = new Date("2026-10-09T12:00:00");
        expect((await store.saveRankingsDocument(first.data.id, docTitled("Fall, revised"))).success).toBe(true);
        current = await store.getRankings();
        expect(current.success && current.data?.meta.title).toBe("Fall, revised");

        const list = await store.listRankingsDocuments();
        expect(list.success && list.data.map((s) => s.title)).toEqual(["Fall, revised", "Winter"]);
        const read = await store.getRankingsDocument(second.data.id);
        expect(read.success && read.data.document.meta.title).toBe("Winter");
    });

    it("refuses to save or read a record that isn't there", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        expect(await store.saveRankingsDocument("missing", docTitled("Fall"))).toEqual({ success: false, error: RANKINGS_NOT_FOUND });
        expect(await store.getRankingsDocument("missing")).toEqual({ success: false, error: RANKINGS_NOT_FOUND });
        expect(await store.listRankingsDocuments()).toEqual({ success: true, data: [] });
    });

    it("drops a document's link when the document is deleted or cleared", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        const links = createLinkStore(repo);
        const a = await store.createRankingsDocument(docTitled("Fall"));
        const b = await store.createRankingsDocument(docTitled("Winter"));
        if (!a.success || !b.success) throw new Error("create failed");
        await links.put(linkFor(docKeyOf(RANKINGS_FORMAT, a.data.id)));
        await links.put(linkFor(docKeyOf(RANKINGS_FORMAT, b.data.id)));

        expect(await store.deleteRankingsDocument(a.data.id)).toEqual({ success: true, data: null });
        expect(await links.get(docKeyOf(RANKINGS_FORMAT, a.data.id))).toBeNull();
        expect(await links.get(docKeyOf(RANKINGS_FORMAT, b.data.id))).not.toBeNull();

        await store.clearRankings();
        expect(await links.list()).toEqual([]);
        expect(await store.listRankingsDocuments()).toEqual({ success: true, data: [] });
    });
});
