/** renderBenchSheetDocx: the bench sheet as a Word document. Bytes are unzipped and read as XML. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    DOCX_MIME_TYPE,
    renderBenchSheetDocx,
    renderBenchSheetDocxBytes,
} from "@/components/features/practice-planner/export/bench-sheet-docx";
import type { BenchSheetModel } from "@/components/features/practice-planner/export/bench-sheet-model";
import { unzipEntry, zipEntryNames } from "@/__tests__/helpers/zip";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function drill(number: number, extra: Partial<BenchSheetModel["drills"][number]> = {}): BenchSheetModel["drills"][number] {
    return { number, name: `Drill ${number}`, start: "6:00 PM", minutes: 10, station: null, diagram: PNG, text: null, ...extra };
}

const MODEL: BenchSheetModel = {
    title: "Tuesday <Skills> & Co",
    teamName: "Hawks U12",
    when: "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT",
    place: "Ice House · Rink A",
    gap: null,
    staff: null,
    timeline: [{ start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min", "Regroup · 8 min"] }],
    planned: "Planned 10 of 60 min",
    overTime: false,
    legend: [{ label: "Pass", image: PNG }],
    drills: [
        drill(1, { name: `Breakout "fast"`, station: "Station 1 of 2", text: "Line one\r\nLine <two>" }),
        drill(2, { diagram: null }),
        drill(3),
    ],
};

async function documentXml(model: BenchSheetModel): Promise<string> {
    const zip = await renderBenchSheetDocxBytes(model);
    return new TextDecoder().decode(unzipEntry(zip, "word/document.xml") ?? new Uint8Array());
}

describe("renderBenchSheetDocx", () => {
    it("is a Word document Blob", async () => {
        const blob = await renderBenchSheetDocx(MODEL);
        expect(blob.type).toBe(DOCX_MIME_TYPE);
        expect(DOCX_MIME_TYPE).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        expect(blob.size).toBeGreaterThan(1000);
    });

    it("is a zip with the document, its media and its properties", async () => {
        const zip = await renderBenchSheetDocxBytes(MODEL);
        expect(String.fromCharCode(zip[0], zip[1])).toBe("PK");
        const names = zipEntryNames(zip);
        expect(names).toContain("word/document.xml");
        expect(names.some((name) => /^word\/media\/.+\.png$/.test(name))).toBe(true);
        const core = new TextDecoder().decode(unzipEntry(zip, "docProps/core.xml") ?? new Uint8Array());
        expect(core).toContain("<dc:title>Tuesday &lt;Skills&gt; &amp; Co</dc:title>");
        expect(core).toContain("<dc:creator>OpenLeague</dc:creator>");
    });

    it("writes every string as escaped text", async () => {
        const xml = await documentXml(MODEL);
        expect(xml).toContain("Tuesday &lt;Skills&gt; &amp; Co");
        expect(xml).toContain("1. Breakout &quot;fast&quot;");
        expect(xml).toContain("Line &lt;two&gt;");
        expect(xml).not.toContain("<two>");
        for (const text of ["Hawks U12", "Ice House · Rink A", "Stations · 2", "• Breakout · 10 min", "Planned 10 of 60 min", "Legend", "Pass", "Station 1 of 2"]) {
            expect(xml).toContain(text);
        }
    });

    it("starts every pair of drills on a new page", async () => {
        const xml = await documentXml(MODEL);
        expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2); // drills 1 and 3
    });

    it("embeds one picture per readable diagram and swatch, and says when a diagram is missing", async () => {
        const xml = await documentXml(MODEL);
        expect(xml.match(/<pic:pic\b/g)).toHaveLength(3); // 1 swatch + drills 1 and 3
        expect(xml).toContain("Diagram unavailable");
    });

    it("keeps a Windows line break as one break", async () => {
        const xml = await documentXml(MODEL);
        expect(xml.match(/<w:br\/>/g)).toHaveLength(1);
        expect(xml).not.toContain("\r");
    });

    it("says No drills planned for an empty session", async () => {
        const xml = await documentXml({ ...MODEL, timeline: [], legend: [], drills: [] });
        expect(xml).toContain("No drills planned");
        expect(xml).not.toContain("<w:tbl>");
    });

    it("keeps the diagram with its text only when there is text to keep it with", async () => {
        const keepNexts = async (text: string | null) =>
            (await documentXml({ ...MODEL, drills: [drill(1, { text })] })).match(/<w:keepNext\/>/g)?.length ?? 0;
        // The heading and the time line always keep with what follows.
        expect(await keepNexts(null)).toBe(2);
        expect(await keepNexts("")).toBe(2);
        expect(await keepNexts("Line")).toBe(3);
    });

    it("drops characters XML 1.0 forbids from text, alt text and the title", async () => {
        const bad = "\u0001\u000B\uFFFE\uFFFF";
        const model: BenchSheetModel = {
            ...MODEL,
            title: `Ses${bad}sion`,
            teamName: `Hawks${bad} U12`,
            legend: [{ label: `Pa${bad}ss`, image: PNG }],
            drills: [drill(1, { name: `Break${bad}out`, text: `Line${bad} one` })],
        };
        const zip = await renderBenchSheetDocxBytes(model);
        const xml = new TextDecoder().decode(unzipEntry(zip, "word/document.xml") ?? new Uint8Array());
        const core = new TextDecoder().decode(unzipEntry(zip, "docProps/core.xml") ?? new Uint8Array());
        for (const part of [xml, core]) {
            expect(part).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
        }
        expect(core).toContain("<dc:title>Session</dc:title>");
        for (const text of ["Session", "Hawks U12", "Pass", "1. Breakout", "Line one", 'descr="Diagram: Breakout"']) {
            expect(xml).toContain(text);
        }
    });

    it("imports only types from the model, so the lazy Word chunk carries no React or MUI code", () => {
        const source = readFileSync(path.join(process.cwd(), "components/features/practice-planner/export/bench-sheet-docx.ts"), "utf8");
        const modelImports = source.match(/^import\b[^;]*from\s+"\.\/bench-sheet-model";/gm) ?? [];
        expect(modelImports.length).toBeGreaterThan(0);
        for (const statement of modelImports) expect(statement).toMatch(/^import type\b/);
    });
});

describe("renderBenchSheetDocx: block rows", () => {
    it("writes a block as its label and note in the timeline", async () => {
        const xml = await documentXml({
            ...MODEL,
            timeline: [{ kind: "block", start: "5:50 PM", minutes: 8, label: "Warm-up", note: "Easy laps", stations: null }, ...MODEL.timeline],
        });
        expect(xml).toContain("Warm-up · Easy laps");
    });
});

describe("renderBenchSheetDocx: rotation and the gap (spec R10)", () => {
    it("writes the gap in the header and a rotation block's grid as a real table", async () => {
        const xml = await documentXml({
            ...MODEL,
            gap: "2 min between blocks",
            timeline: [{
                kind: "rotation",
                start: "6:00 PM",
                minutes: 10,
                label: "Stations · rotate every 5 min · 10 min",
                stations: ["Goalie · stays", "Skate A", "Skate B"],
                grid: { columns: ["Goalie", "Skate A", "Skate B"], rows: [{ start: "6:00 PM", cells: ["all", "A", "B"] }, { start: "6:05 PM", cells: ["all", "B", "A"] }] },
            }],
        });
        expect(xml).toContain("2 min between blocks");
        expect(xml).toContain("Stations · rotate every 5 min · 10 min");
        expect(xml).toContain("Goalie · stays");
        // The timeline table, plus the grid nested in its third cell.
        expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
        expect(xml).toMatch(/>all</);
        // The grid sets its own columns: a narrow Start, the stations sharing the rest.
        const grid = xml.slice(xml.lastIndexOf("<w:tbl>"));
        const widths = [...grid.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]));
        expect(widths).toHaveLength(4);
        expect(widths[0]).toBeLessThan(widths[1]);
        expect(new Set(widths.slice(1)).size).toBe(1);
    });
});

describe("renderBenchSheetDocx: practice staff (spec R9)", () => {
    it("writes the staff line and each row's names as safe text", async () => {
        const xml = await documentXml({
            ...MODEL,
            staff: "Staff: <Coach> & Sam\u0007",
            timeline: [
                ...MODEL.timeline,
                { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null, runBy: "run by <Sam>" },
                { kind: "block", start: "6:25 PM MDT", minutes: 2, label: "Water", note: "Fill up", stations: null, runBy: "run by Coach Lee" },
            ],
        });
        expect(xml).toContain("Staff: &lt;Coach&gt; &amp; Sam");
        expect(xml).not.toContain("\u0007");
        expect(xml).toContain("Shooting · run by &lt;Sam&gt;");
        expect(xml).toContain("Water · Fill up · run by Coach Lee");
    });
});
