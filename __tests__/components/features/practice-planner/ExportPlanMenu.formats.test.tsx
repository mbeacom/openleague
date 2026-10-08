/** Config-format exports: "Download plan file as YAML / TOML / JSONC" writes the same plan, readable again. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
    ExportPlanMenu,
    FILE_TOO_LARGE_TO_IMPORT_NOTICE,
    FORMAT_EXPORT_FAILED_NOTICE,
    buildPlanDocument,
    formatTooLargeNotice,
    importMeasuredText,
    importProblemNotice,
    type ExportableSession,
} from "@/components/features/practice-planner/ExportPlanMenu";
import { formatLoaders, readAnyDocumentText } from "@/lib/document-formats";
import { MAX_PLAN_FILE_BYTES, PLAN_FORMAT, parsePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { renderWithPlanner } from "@/__tests__/helpers/planner";

const SESSION: ExportableSession = {
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    startAt: null,
    venueTimezone: null,
    plays: [
        { sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, play: { name: "Breakout", description: null, playData: createEmptyPlayData() } },
        { sequence: 1, duration: 10, runsWithPrevious: true, instructions: null, play: { name: "Regroup", description: null, playData: createEmptyPlayData() } },
    ],
};

let clicks: string[];

beforeEach(() => {
    clicks = [];
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:plan");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download);
    });
});

afterEach(() => vi.restoreAllMocks());

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Export plan" }));

describe("ExportPlanMenu formats", () => {
    it.each([
        ["YAML", "tuesday-skills.olplan.yaml", "application/yaml"],
        ["TOML", "tuesday-skills.olplan.toml", "application/toml"],
        ["JSONC", "tuesday-skills.olplan.jsonc", "text/plain;charset=utf-8"],
    ])("downloads the plan as %s, and it reads back as the same plan", async (label, fileName, type) => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: `Download plan file as ${label}` }));
        await waitFor(() => expect(clicks).toEqual([fileName]));
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe(type);
        const result = await readAnyDocumentText(await blob.text(), fileName, undefined, { kind: PLAN_FORMAT });
        expect(result.ok).toBe(true);
        const expected = parsePlan(JSON.parse(JSON.stringify(buildPlanDocument(SESSION))));
        expect(result.ok && expected.ok && result.document.payload.session).toEqual(expected.ok && expected.plan.session);
    });

    it("the plain item still downloads JSON at once", () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        expect(clicks).toEqual(["tuesday-skills.olplan.json"]);
    });

    it("says so when a format's library can't load", async () => {
        vi.spyOn(formatLoaders, "yaml").mockRejectedValue(new Error("offline"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file as YAML" }));
        expect(await screen.findByText(FORMAT_EXPORT_FAILED_NOTICE)).toBeInTheDocument();
        expect(clicks).toEqual([]);
    });

    it("measures another format as the importer does, as compact JSON, not the pretty-printed file", () => {
        // Long strokes: the pretty-printed JSON is several times the compact form.
        const points = Array.from({ length: 120 }, (_, i) => ({ x: i % 100, y: 5 }));
        const board = { ...createEmptyPlayData(), drawings: Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, action: "skate" as const, path: "straight" as const, end: "arrow" as const, points, color: "#000000", strokeWidth: 2 })) };
        const plays = Array.from({ length: 10 }, (_, i) => ({ sequence: i, duration: 5, runsWithPrevious: false, instructions: null, play: { name: `Drill ${i}`, description: null, playData: board } }));
        const doc = buildPlanDocument({ ...SESSION, plays });
        const size = (text: string) => new TextEncoder().encode(text).byteLength;
        expect(size(JSON.stringify(doc))).toBeLessThan(MAX_PLAN_FILE_BYTES);
        expect(size(JSON.stringify(doc, null, 2))).toBeGreaterThan(MAX_PLAN_FILE_BYTES);

        expect(importMeasuredText(doc, "json")).toBe(JSON.stringify(doc, null, 2));
        expect(importProblemNotice(doc, importMeasuredText(doc, "json"))).toBe(FILE_TOO_LARGE_TO_IMPORT_NOTICE);
        for (const format of ["yaml", "toml", "jsonc"] as const) {
            expect(importMeasuredText(doc, format)).toBe(JSON.stringify(doc));
            expect(importProblemNotice(doc, importMeasuredText(doc, format))).toBeNull();
        }
    });

    it("warns when a file in another format would be too large to open again", () => {
        expect(formatTooLargeNotice("x", "toml")).toEqual([]);
        expect(formatTooLargeNotice("x".repeat(MAX_PLAN_FILE_BYTES + 10_000), "toml")).toEqual([
            "This TOML file is too large to open again. Download the plan file (JSON) instead.",
        ]);
    });
});
