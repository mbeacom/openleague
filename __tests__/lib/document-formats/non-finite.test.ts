/**
 * YAML (.nan, .inf) and TOML (nan, inf) can spell numbers JSON can't hold;
 * JSON.stringify would quietly turn them into null. Any non-finite number
 * anywhere in a decoded file refuses it, in every format.
 */
import { describe, expect, it } from "vitest";
import { NON_FINITE_NUMBER_MESSAGE, encodeDocument, readAnyDocumentText } from "@/lib/document-formats";
import { RANKINGS_FORMAT } from "@/lib/rankings-document";
import { sampleRankingsDoc } from "../../apps/planner/rankings-fixtures";

const RANKINGS = { kind: RANKINGS_FORMAT } as const;
const refused = { ok: false, error: { code: "not-a-document", message: NON_FINITE_NUMBER_MESSAGE } };

describe("non-finite numbers are refused", () => {
    it.each([".nan", ".inf", "-.inf", ".NaN", "+.Inf"])("YAML %s inside kept-as-is data", async (spelling) => {
        const yaml = await encodeDocument(sampleRankingsDoc(), "yaml");
        const text = yaml.replace(/^snapshots: \[\]$/m, `snapshots:\n  - rating: ${spelling}`);
        expect(text).toContain(spelling);
        expect(await readAnyDocumentText(text, "x.rankings.yaml", undefined, RANKINGS)).toEqual(refused);
    });

    it.each(["nan", "inf", "-inf", "+inf"])("TOML %s", async (spelling) => {
        const toml = await encodeDocument(sampleRankingsDoc(), "toml");
        expect(toml).toMatch(/^snapshots = \[\]$/m);
        const text = `${toml.replace(/^snapshots = \[\]$/m, "")}\n[[snapshots]]\nrating = ${spelling}\n`;
        expect(await readAnyDocumentText(text, "x.rankings.toml", undefined, RANKINGS)).toEqual(refused);
    });

    it.each([
        ["JSON", "x.rankings.json"],
        ["JSONC", "x.rankings.jsonc"],
    ])("%s numbers too large to hold", async (_label, name) => {
        const json = JSON.stringify({ ...sampleRankingsDoc(), snapshots: [{ rating: 1 }] }).replace('"rating":1', '"rating":1e999');
        expect(await readAnyDocumentText(json, name, undefined, RANKINGS)).toEqual(refused);
    });

    it("finite numbers still read", async () => {
        const result = await readAnyDocumentText(await encodeDocument(sampleRankingsDoc({ snapshots: [{ rating: 1.5 }] }), "yaml"), "x.rankings.yaml", undefined, RANKINGS);
        expect(result.ok && result.document.payload.snapshots).toEqual([{ rating: 1.5 }]);
    });
});
