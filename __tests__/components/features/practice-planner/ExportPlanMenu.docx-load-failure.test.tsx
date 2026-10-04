/** The Word export's chunk can fail to load (an offline static planner that never fetched it, or a redeploy). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/features/practice-planner/export/bench-sheet-docx", () => {
    throw new Error("Failed to fetch dynamically imported module");
});
vi.mock("@/components/features/practice-planner/export/export-images", () => ({
    canvasRenderers: { diagram: () => null, swatch: () => null },
}));

import { DOCX_LOAD_FAILED_NOTICE, ExportPlanMenu } from "@/components/features/practice-planner/ExportPlanMenu";
import { renderWithPlanner } from "@/__tests__/helpers/planner";

describe("ExportPlanMenu Word export offline", () => {
    it("says the Word export couldn't load and points at the HTML file", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        renderWithPlanner(
            <ExportPlanMenu session={{ title: "Tuesday Skills", date: "2026-04-07T22:00:00.000Z", duration: 60, plays: [] }} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Download Word document (.docx)" }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(DOCX_LOAD_FAILED_NOTICE));
        expect(DOCX_LOAD_FAILED_NOTICE).toBe(
            "Couldn't load the Word export. Check your connection and try again, or download the bench sheet (HTML).",
        );
    });
});
