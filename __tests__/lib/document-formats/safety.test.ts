/** Config-format exports: safe parsing, size limits, friendly errors and format detection. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import {
    DocumentEncodeError,
    TOML_CANNOT_HOLD_MESSAGE,
    YAML_TOO_MANY_ALIASES_MESSAGE,
    YAML_UNSUPPORTED_MESSAGE,
    detectFormat,
    encodeDocument,
    fileNameForFormat,
    formatFromFileName,
    formatLoaders,
    jsoncMalformedMessage,
    readAnyDocumentText,
    sniffFormat,
    stripNullsForToml,
    tomlMalformedMessage,
    yamlMalformedMessage,
} from "@/lib/document-formats";
import { FILE_TOO_LARGE_MESSAGE, MAX_PLAN_FILE_BYTES, NOT_A_PLAN_MESSAGE, PLAN_FORMAT, readPlanFile, serializePlan } from "@/lib/plan-document";
import { RANKINGS_FORMAT, readRankingsFile } from "@/lib/rankings-document";
import { sampleRankingsDoc } from "../../apps/planner/rankings-fixtures";

const PLAN = { kind: PLAN_FORMAT } as const;

const plan = () =>
    serializePlan(
        {
            title: "Lakeview practice",
            durationMinutes: 30,
            date: null,
            startTime: null,
            drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Laps", description: null, playData: null }],
        },
        "openleague-static",
        new Date("2026-10-07T18:00:00.000Z"),
    );

afterEach(() => vi.restoreAllMocks());

describe("YAML safety", () => {
    it("refuses an alias bomb (billion laughs) instead of expanding it", async () => {
        const bomb = [
            'format: openleague.practice-plan',
            'a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]',
            "b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]",
            "c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]",
            "d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]",
            "e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]",
            "f: [*e,*e,*e,*e,*e,*e,*e,*e,*e]",
        ].join("\n");
        const result = await readAnyDocumentText(bomb, "bomb.olplan.yaml", undefined, PLAN);
        expect(result).toEqual({ ok: false, error: { code: "not-a-document", message: YAML_TOO_MANY_ALIASES_MESSAGE } });
    });

    it("refuses custom and language tags", async () => {
        for (const text of ["format: !!js/function 'x'", "format: !custom openleague.practice-plan", "format: !!binary aGk="]) {
            const result = await readAnyDocumentText(text, "x.yaml", undefined, PLAN);
            expect(result.ok).toBe(false);
            expect(!result.ok && result.error.message).toMatch(/YAML file/);
        }
        const tagged = await readAnyDocumentText("format: !custom x", "x.yaml", undefined, PLAN);
        expect(!tagged.ok && tagged.error.message).toBe(YAML_UNSUPPORTED_MESSAGE);
    });

    it("does not merge `<<` keys: a merge is a plain key the schema drops, never a source of fields", async () => {
        const yaml = (await encodeDocument(plan(), "yaml")).replace(/^session:$/m, "base: &base\n  title: Merged\nsession:\n  <<: *base");
        const result = await readAnyDocumentText(yaml, "x.yaml", undefined, PLAN);
        expect(result.ok && result.document.payload.session.title).toBe("Lakeview practice");
    });

    it("refuses an anchor that contains its own alias (a cycle), without throwing", async () => {
        const text = "format: openleague.practice-plan\na: &a\n  b: *a\n";
        const result = await readAnyDocumentText(text, "x.yaml", undefined, PLAN);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error.code).toBe("not-a-document");
        await expect(readPlanFile(new File([text], "x.olplan.yaml"))).resolves.toMatchObject({ ok: false });
    });

    it("refuses duplicate keys", async () => {
        const result = await readAnyDocumentText("format: a\nformat: b\n", "x.yaml", undefined, PLAN);
        expect(!result.ok && result.error.message).toBe(yamlMalformedMessage(2));
    });

    it("keeps dates and times as text (core schema: no timestamps)", async () => {
        const yaml = (await encodeDocument(plan(), "yaml")).replace(/exportedAt: .*/, "exportedAt: 2026-10-07T18:00:00.000Z");
        const result = await readAnyDocumentText(yaml, "x.yaml", undefined, PLAN);
        expect(result.ok && result.document.payload.exportedAt).toBe("2026-10-07T18:00:00.000Z");
    });
});

describe("size limits apply before parsing", () => {
    it("refuses oversized text in every format without loading a library", async () => {
        const spies = [vi.spyOn(formatLoaders, "yaml"), vi.spyOn(formatLoaders, "toml"), vi.spyOn(formatLoaders, "jsonc")];
        const huge = `# ${"x".repeat(MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES)}\n`;
        for (const name of ["a.olplan.yaml", "a.olplan.toml", "a.olplan.jsonc", "a.olplan.json", "no-extension"]) {
            const result = await readAnyDocumentText(huge, name, undefined, PLAN);
            expect(result).toEqual({ ok: false, error: { code: "too-large", message: FILE_TOO_LARGE_MESSAGE } });
        }
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    });

    it("measures the decoded document as JSON against the kind's limit", async () => {
        // Under the raw ceiling, but a YAML alias repeats a long text past the plan limit once expanded.
        const long = "y".repeat(200_000);
        const text = `format: openleague.practice-plan\nversion: 1\nlong: &l "${long}"\nr1: *l\nr2: *l\nr3: *l\nr4: *l\nr5: *l\n`;
        const result = await readAnyDocumentText(text, "x.yaml", undefined, PLAN);
        expect(!result.ok && result.error.code).toBe("too-large");
    });

    it("readPlanFile refuses an oversized file of any format unread", async () => {
        const file = new File(["x".repeat(MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES + 1)], "big.olplan.toml");
        const text = vi.spyOn(file, "text");
        expect(await readPlanFile(file)).toEqual({ ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } });
        expect(text).not.toHaveBeenCalled();
    });
});

describe("malformed input gives a friendly error", () => {
    it.each([
        // An unclosed list is reported where the file ends.
        ["x.olplan.yaml", "format: openleague.practice-plan\nsession: [unclosed\n", yamlMalformedMessage(3)],
        ["x.olplan.toml", 'format = "openleague.practice-plan"\nversion = \n', tomlMalformedMessage(2)],
        ["x.olplan.jsonc", '// header\n{\n  "format": "openleague.practice-plan",\n  "version": 1 2\n}', jsoncMalformedMessage(4)],
    ])("%s", async (name, text, message) => {
        expect(await readAnyDocumentText(text, name, undefined, PLAN)).toEqual({ ok: false, error: { code: "not-a-document", message } });
    });

    it("a file that parses but isn't a plan gets the plan's own message", async () => {
        for (const [name, text] of [["x.yaml", "just some text"], ["x.toml", 'title = "notes"'], ["x.jsonc", "[1, 2]"]]) {
            expect(await readAnyDocumentText(text, name, undefined, PLAN)).toEqual({ ok: false, error: { code: "not-a-document", message: NOT_A_PLAN_MESSAGE } });
        }
    });

    it("a rankings file opened as a plan is refused as not a plan", async () => {
        const text = await encodeDocument(sampleRankingsDoc(), "yaml");
        const result = await readAnyDocumentText(text, "x.rankings.yaml", undefined, PLAN);
        expect(!result.ok && result.error).toEqual({ code: "wrong-kind", message: NOT_A_PLAN_MESSAGE });
    });

    it("JSONC accepts comments and trailing commas", async () => {
        const json = JSON.stringify(plan(), null, 2).replace(/\n}$/, ",\n}");
        const result = await readAnyDocumentText(`/* block */\n// line\n${json}`, "x.jsonc", undefined, PLAN);
        expect(result.ok).toBe(true);
    });
});

describe("TOML mapping", () => {
    it("leaves out nulls only at the paths it is given, and refuses null inside a list", () => {
        const omittable = new Set(["a", "b.c", "e.*.f"]);
        expect(stripNullsForToml({ a: null, b: { c: null, d: 1 }, e: [{ f: null }] }, omittable)).toEqual({ b: { d: 1 }, e: [{}] });
        expect(() => stripNullsForToml({ b: { x: null } }, omittable)).toThrow(TOML_CANNOT_HOLD_MESSAGE);
        expect(() => stripNullsForToml({ list: [1, null] }, omittable)).toThrow(DocumentEncodeError);
        expect(() => stripNullsForToml({ list: [1, null] }, omittable)).toThrow(TOML_CANNOT_HOLD_MESSAGE);
    });

    it("an unquoted TOML date reads as its text", async () => {
        const toml = (await encodeDocument(plan(), "toml")).replace(/^date = .*$/m, "").replace(/^\[session\]$/m, "[session]\ndate = 2026-10-07");
        const result = await readAnyDocumentText(toml, "x.toml", undefined, PLAN);
        expect(result.ok && result.document.payload.session.date).toBe("2026-10-07");
    });
});

describe("format detection", () => {
    it("by extension first", () => {
        expect(formatFromFileName("drills.olplan.json")).toBe("json");
        expect(formatFromFileName("drills.olplan.JSONC")).toBe("jsonc");
        expect(formatFromFileName("drills.olplan.yml")).toBe("yaml");
        expect(formatFromFileName("fall.rankings.toml")).toBe("toml");
        expect(formatFromFileName("notes.txt")).toBeNull();
        expect(detectFormat("x.yaml", '{"format": 1}')).toBe("yaml");
    });

    it("then by content", () => {
        expect(sniffFormat('﻿  {"a": 1}')).toBe("json");
        expect(sniffFormat('{"a": 1, // note\n}')).toBe("jsonc");
        expect(sniffFormat("// header\n{}")).toBe("jsonc");
        expect(sniffFormat("# header\n\nformat = \"x\"")).toBe("toml");
        expect(sniffFormat("[session]\ntitle = \"x\"")).toBe("toml");
        expect(sniffFormat("# header\nformat: x")).toBe("yaml");
        expect(sniffFormat("---\nformat: x")).toBe("yaml");
    });

    it("names a kind's file in each format", () => {
        expect(fileNameForFormat("drills.olplan.json", "yaml")).toBe("drills.olplan.yaml");
        expect(fileNameForFormat("fall.rankings.json", "toml")).toBe("fall.rankings.toml");
        expect(fileNameForFormat("fall.rankings.json", "jsonc")).toBe("fall.rankings.jsonc");
        expect(fileNameForFormat("fall.rankings.json", "json")).toBe("fall.rankings.json");
    });
});

describe("file readers", () => {
    it("readPlanFile and readRankingsFile open every format", async () => {
        for (const format of ["json", "yaml", "toml", "jsonc"] as const) {
            const planFile = new File([await encodeDocument(plan(), format)], `p.olplan.${format}`);
            expect((await readPlanFile(planFile)).ok).toBe(true);
            const rankingsFile = new File([await encodeDocument(sampleRankingsDoc(), format)], `r.rankings.${format}`);
            const read = await readRankingsFile(rankingsFile);
            expect(read.ok && read.doc.format).toBe(RANKINGS_FORMAT);
        }
    });

    it("a library that fails to load is a friendly error, not a throw", async () => {
        vi.spyOn(formatLoaders, "yaml").mockRejectedValue(new Error("offline"));
        const result = await readPlanFile(new File(["format: x"], "p.olplan.yaml"));
        expect(!result.ok && result.error.message).toMatch(/Couldn't load the reader/);
    });
});
