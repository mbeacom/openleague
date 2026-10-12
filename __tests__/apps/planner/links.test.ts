import { describe, expect, it } from "vitest";
import { createLinkStore, docKeyOf, isDocumentLink } from "@/apps/planner/src/store/links";
import type { DocumentLink } from "@/apps/planner/src/store/records";
import { REPOS } from "./store-harness";

const KEY = docKeyOf("openleague.rankings", "local-1");

const LINK: DocumentLink = {
    docKey: KEY,
    documentId: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11",
    connector: "onedrive",
    remote: { fileId: "item-1", name: "fall.rankings.json", driveId: "drive-1" },
    baseRevision: "ctag-1",
    baseHash: "abc",
    baseWrittenHere: false,
    dirty: false,
    lastSyncedAt: "2026-10-11T12:00:00.000Z",
};

describe("docKeyOf", () => {
    it("keys a local document by kind and local id", () => {
        expect(KEY).toBe("openleague.rankings:local-1");
        expect(docKeyOf("openleague.practice-plan", "s1")).toBe("openleague.practice-plan:s1");
    });
});

describe("isDocumentLink", () => {
    it("accepts a whole link, with or without a drive id", () => {
        expect(isDocumentLink(LINK)).toBe(true);
        expect(isDocumentLink({ ...LINK, remote: { fileId: "f", name: "n" }, baseRevision: null })).toBe(true);
    });

    it("refuses anything missing a field, or naming an unknown connector", () => {
        expect(isDocumentLink(null)).toBe(false);
        expect(isDocumentLink({ ...LINK, connector: "dropbox" })).toBe(false);
        expect(isDocumentLink({ ...LINK, remote: undefined })).toBe(false);
        expect(isDocumentLink({ ...LINK, dirty: "no" })).toBe(false);
        const { baseHash: _dropped, ...partial } = LINK;
        expect(isDocumentLink(partial)).toBe(false);
    });
});

describe.each(REPOS)("link table on %s", (_name, open) => {
    it("stores one link per document, replaces it, lists and unlinks", async () => {
        const repo = await open();
        const links = createLinkStore(repo);
        expect(await links.get(KEY)).toBeNull();
        await links.put(LINK);
        expect(await links.get(KEY)).toEqual(LINK);
        await links.put({ ...LINK, baseRevision: "ctag-2", dirty: true });
        expect(await links.list()).toEqual([{ ...LINK, baseRevision: "ctag-2", dirty: true }]);
        await links.delete(KEY);
        expect(await links.get(KEY)).toBeNull();
    });

    it("reads a damaged record as no link", async () => {
        const repo = await open();
        await repo.write((tx) => tx.putLink({ docKey: KEY } as DocumentLink));
        const links = createLinkStore(repo);
        expect(await links.get(KEY)).toBeNull();
        expect(await links.list()).toEqual([]);
    });
});
