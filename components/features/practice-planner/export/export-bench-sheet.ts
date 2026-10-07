/**
 * Bench sheet downloads (sub-project 4): build the model with the canvas
 * renderers, then render HTML here or load the Word renderer with import(),
 * so `docx` never reaches either main bundle (ADR-0020).
 */
import { planExportFileName } from "@/lib/plan-document";
import { waitForCrestFont } from "@/lib/utils/canvas/crest-png";
import { waitForDiagramFont } from "@/lib/utils/canvas/diagram-fonts";
import { isLogoImage } from "@/lib/utils/team-mark";
import type { LogoImage } from "@/types/practice-planner";
import { buildBenchSheetModel, type BenchSheetModel, type ExportSession } from "./bench-sheet-model";
import { renderBenchSheetHtml } from "./bench-sheet-html";
import { canvasRenderers } from "./export-images";
import { downloadBlob } from "./download";

export type BenchSheetFormat = "html" | "docx";

/** The Word renderer's chunk didn't load: offline, or a redeploy replaced it. */
export class ExportModuleLoadError extends Error {
    constructor(cause: unknown) {
        super("The Word export couldn't be loaded", { cause });
        this.name = "ExportModuleLoadError";
    }
}

/** Lets the menu close and the busy notice paint before the canvas work starts. */
function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function exportBenchSheet(
    session: ExportSession,
    format: BenchSheetFormat,
    options: { logo: LogoImage | null },
): Promise<void> {
    await yieldToBrowser();
    // The Crest stands in for a missing logo: let its font load first, as the printed sheet does.
    // Without a team name no mark is drawn (buildBenchSheetModel), so there is nothing to wait for.
    const needsCrest = Boolean(session.teamMark && session.teamName?.trim() && !isLogoImage(options.logo));
    // Exported diagrams must not bake in the fallback font. Both load at once.
    await Promise.all([needsCrest ? waitForCrestFont() : undefined, waitForDiagramFont()]);
    const model = buildBenchSheetModel(session, canvasRenderers, { logo: options.logo });
    if (format === "html") {
        const blob = new Blob([renderBenchSheetHtml(model)], { type: "text/html;charset=utf-8" });
        downloadBlob(blob, planExportFileName(session.title, "html"));
        return;
    }
    let renderDocx: (model: BenchSheetModel) => Promise<Blob>;
    try {
        renderDocx = (await import("./bench-sheet-docx")).renderBenchSheetDocx;
    } catch (error) {
        throw new ExportModuleLoadError(error);
    }
    downloadBlob(await renderDocx(model), planExportFileName(session.title, "docx"));
}
