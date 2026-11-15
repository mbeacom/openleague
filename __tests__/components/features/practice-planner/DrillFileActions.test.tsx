/** Drill files in the library (#523): Share drills downloads a file; Import drills adds a file's drills. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

const { mockDownload } = vi.hoisted(() => ({ mockDownload: vi.fn() }));
vi.mock("@/components/features/practice-planner/export/download", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/features/practice-planner/export/download")>()),
    downloadBlob: mockDownload,
}));
vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()),
    generateThumbnail: () => "data:image/png;base64,AA==",
}));
vi.mock("@/lib/utils/canvas/diagram-fonts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/diagram-fonts")>()),
    waitForDiagramFont: () => Promise.resolve(),
}));

import { ALREADY_IN_LIBRARY, DrillFileActions, drillsAddedNotice } from "@/components/features/practice-planner/DrillFileActions";
import { NEWER_DRILLS_FILE_MESSAGE, createDrillsDocument, parseDrillsDocument, serializeDrillsDocument } from "@/lib/drill-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteam000000000000000000001";
const summary = (id: string, name: string) => ({ id, name, description: null, thumbnail: null, isTemplate: true, createdAt: new Date(), updatedAt: new Date() });
const full = (id: string, name: string) => ({ ...summary(id, name), focus: "skaters", goalies: "none", ageGroups: ["u10"], playData: createEmptyPlayData() });

const pickFile = (text: string) =>
    fireEvent.change(screen.getByTestId("drills-file-input"), { target: { files: [new File([text], "drills.drills.json", { type: "application/json" })] } });

beforeEach(() => mockDownload.mockClear());

describe("DrillFileActions", () => {
    it("downloads the chosen drills as a drill file", async () => {
        const store = createMockPlannerStore();
        store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: [summary("p2", "Wrist Shots"), summary("p1", "Breakout")], total: 2, page: 1, limit: 100 } });
        store.getPlayById.mockImplementation(async ({ id }: { id: string }) => ({ success: true, data: full(id, id === "p1" ? "Breakout" : "Wrist Shots") }));
        renderWithPlanner(<DrillFileActions teamId={TEAM} libraryNames={null} onImported={vi.fn()} />, { store, platform: createHashPlatform() });

        fireEvent.click(screen.getByRole("button", { name: "Share drills" }));
        const dialog = await screen.findByRole("dialog", { name: "Share drills" });
        fireEvent.click(await within(dialog).findByRole("checkbox", { name: "Breakout" }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Download 1 drill" }));

        await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
        const [blob, name] = mockDownload.mock.calls[0] as [Blob, string];
        expect(name).toBe("breakout.drills.json");
        const parsed = parseDrillsDocument(JSON.parse(await blob.text()));
        expect(parsed.ok && parsed.doc.drills.map((drill) => [drill.name, drill.focus, drill.ageGroups])).toEqual([["Breakout", "skaters", ["u10"]]]);
        expect(parsed.ok && parsed.doc.generator).toBe("openleague-static");
        expect(store.getPlayById).toHaveBeenCalledWith({ id: "p1", teamId: TEAM });
    });

    it("adds a file's drills to the library, leaving out names it already has", async () => {
        const store = createMockPlannerStore();
        store.createPlay.mockResolvedValue({ success: true, data: { id: "new", name: "x", isTemplate: true } });
        const onImported = vi.fn();
        renderWithPlanner(<DrillFileActions teamId={TEAM} libraryNames={new Set(["breakout"])} onImported={onImported} />, { store, platform: createHashPlatform() });

        const doc = createDrillsDocument(
            [
                { name: "Breakout", description: null, playData: null },
                { name: "Cone Weave", description: "Tight turns.", focus: "skaters", playData: null },
            ],
            "openleague-hosted",
        );
        pickFile(serializeDrillsDocument(doc));
        const dialog = await screen.findByRole("dialog", { name: "Import drills" });
        expect(within(dialog).getByText(`· ${ALREADY_IN_LIBRARY}`, { exact: false })).toBeInTheDocument();
        expect(within(dialog).getByRole("checkbox", { name: /Breakout/ })).not.toBeChecked();
        expect(within(dialog).getByRole("checkbox", { name: "Cone Weave" })).toBeChecked();
        fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 drill" }));

        await waitFor(() => expect(onImported).toHaveBeenCalledWith(1));
        expect(store.createPlay).toHaveBeenCalledTimes(1);
        expect(store.createPlay).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Cone Weave", description: "Tight turns.", focus: "skaters", isTemplate: true, teamId: TEAM, thumbnail: "data:image/png;base64,AA==" }),
        );
        expect(await screen.findByText(drillsAddedNotice(1))).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("says why a file was refused, and reports a partial import", async () => {
        const store = createMockPlannerStore();
        store.createPlay
            .mockResolvedValueOnce({ success: true, data: { id: "a", name: "A", isTemplate: true } })
            .mockResolvedValueOnce({ success: false, error: "Only team admins can add drills." });
        const onImported = vi.fn();
        renderWithPlanner(<DrillFileActions teamId={TEAM} libraryNames={new Set()} onImported={onImported} />, { store, platform: createHashPlatform() });

        const doc = createDrillsDocument([{ name: "A", description: null, playData: null }, { name: "B", description: null, playData: null }], "openleague-static");
        pickFile(JSON.stringify({ ...doc, version: 2 }));
        expect(await screen.findByText(NEWER_DRILLS_FILE_MESSAGE)).toBeInTheDocument();

        pickFile(serializeDrillsDocument(doc));
        const dialog = await screen.findByRole("dialog", { name: "Import drills" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add 2 drills" }));
        expect(await within(dialog).findByText(`Only team admins can add drills. ${drillsAddedNotice(1)}`)).toBeInTheDocument();
        expect(onImported).toHaveBeenCalledWith(1);
    });
});
