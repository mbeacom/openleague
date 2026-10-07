import { beforeEach, describe, expect, it, vi } from "vitest";

const waits = vi.hoisted(() => ({ crest: vi.fn(), diagram: vi.fn() }));

vi.mock("@/lib/utils/canvas/crest-png", () => ({ waitForCrestFont: waits.crest }));
vi.mock("@/lib/utils/canvas/diagram-fonts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/diagram-fonts")>()),
    waitForDiagramFont: waits.diagram,
}));
vi.mock("@/components/features/practice-planner/export/export-images", () => ({ canvasRenderers: {} }));
vi.mock("@/components/features/practice-planner/export/bench-sheet-model", () => ({ buildBenchSheetModel: () => ({}) }));
vi.mock("@/components/features/practice-planner/export/bench-sheet-html", () => ({ renderBenchSheetHtml: () => "<html></html>" }));
vi.mock("@/components/features/practice-planner/export/download", () => ({ downloadBlob: vi.fn() }));

import { exportBenchSheet } from "@/components/features/practice-planner/export/export-bench-sheet";
import type { ExportSession } from "@/components/features/practice-planner/export/bench-sheet-model";

describe("exportBenchSheet font waits", () => {
    beforeEach(() => {
        waits.crest.mockReset();
        waits.diagram.mockReset();
    });

    it("waits for the Crest and diagram fonts together, not one after the other", async () => {
        let releaseCrest!: () => void;
        waits.crest.mockReturnValue(new Promise<void>((resolve) => { releaseCrest = resolve; }));
        waits.diagram.mockResolvedValue(undefined);
        const session = { title: "Practice", teamName: "Wolves", teamMark: { color: "#0D47A1" } } as unknown as ExportSession;

        const done = exportBenchSheet(session, "html", { logo: null });
        await vi.waitFor(() => expect(waits.crest).toHaveBeenCalled());
        // The Crest font is still loading; the diagram font's wait has already started.
        expect(waits.diagram).toHaveBeenCalled();
        releaseCrest();
        await done;
    });
});
