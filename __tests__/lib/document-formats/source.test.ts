import { describe, expect, it } from "vitest";
import { encodeDocument, fileSource, readAnyDocumentText } from "@/lib/document-formats";
import { wrapDocument } from "@/lib/document-envelope";
import { RANKINGS_FORMAT, createRankingsDocument } from "@/lib/rankings-document";

const RANKINGS = createRankingsDocument({ title: "Fall Pre-season" });
const META = { id: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11", updatedAt: "2026-10-07T18:04:00.000Z", generator: "openleague-static" } as const;
const SOURCE = { modifiedAt: "2026-10-09T08:30:00.000Z" };

describe("readAnyDocumentText: id and source time through every format", () => {
    it.each(["json", "yaml", "toml", "jsonc"] as const)("a wrapped %s file keeps its envelope id and updatedAt over the source time", async (format) => {
        const text = await encodeDocument(wrapDocument(RANKINGS_FORMAT, RANKINGS, META), format);
        const read = await readAnyDocumentText(text, `fall.rankings.${format}`, SOURCE, { kind: RANKINGS_FORMAT });
        expect(read.ok && { id: read.document.id, updatedAt: read.document.updatedAt }).toEqual({ id: META.id, updatedAt: META.updatedAt });
    });

    it.each(["json", "yaml", "toml", "jsonc"] as const)("a bare %s file has no id and takes the source time", async (format) => {
        const text = await encodeDocument(RANKINGS, format);
        const read = await readAnyDocumentText(text, `fall.rankings.${format}`, SOURCE, { kind: RANKINGS_FORMAT });
        expect(read.ok && { id: read.document.id, updatedAt: read.document.updatedAt }).toEqual({ id: null, updatedAt: SOURCE.modifiedAt });
    });
});

describe("fileSource", () => {
    it("turns a file's lastModified into an ISO source time", () => {
        expect(fileSource({ lastModified: Date.parse(SOURCE.modifiedAt) })).toEqual(SOURCE);
    });

    it("gives no time for a missing or unusable lastModified", () => {
        expect(fileSource({ lastModified: 0 })).toEqual({});
        expect(fileSource({ lastModified: Number.NaN })).toEqual({});
        expect(fileSource({} as { lastModified: number })).toEqual({});
    });
});
