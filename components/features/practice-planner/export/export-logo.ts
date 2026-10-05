/**
 * The logo an export embeds (practice logo spec R1, R4): the static profile's
 * stored PNG, else the hosted read through the planner seam. Any failure is
 * null, and the export draws the Crest (spec R6): an export never fails because
 * of its logo.
 */
import type { LogoImage } from "@/types/practice-planner";
import type { ExportSession } from "./bench-sheet-model";

export async function resolveExportLogo(
    session: ExportSession,
    fetchLogo?: (sessionId: string) => Promise<LogoImage | null>,
): Promise<LogoImage | null> {
    const mark = session.teamMark;
    if (!mark?.logoUrl) return null;
    if (mark.logoImage !== undefined) return mark.logoImage;
    if (!session.id || !fetchLogo) return null;
    try {
        return await fetchLogo(session.id);
    } catch (error) {
        console.warn("Bench sheet export: the team logo is unavailable:", error instanceof Error ? error.name : "unknown error");
        return null;
    }
}
