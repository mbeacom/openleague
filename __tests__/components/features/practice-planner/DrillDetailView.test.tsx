/** The drill details page (hosted and static): what it shows, and who gets which action. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import type { LibraryPlay } from "@/lib/planner-store";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock("@/components/features/practice-planner/export/download", () => download);
vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()),
    generateThumbnail: () => "data:image/png;base64,AAAA",
}));
vi.mock("@/lib/utils/canvas/diagram-fonts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/diagram-fonts")>()),
    waitForDiagramFont: () => Promise.resolve(),
}));

import { DrillDetailView } from "@/components/features/practice-planner/DrillDetailView";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAY_ID = "cplayxxxxxxxxxxxxxxxxxxxx";

function play(overrides: Partial<LibraryPlay> = {}): LibraryPlay {
    return {
        id: PLAY_ID,
        name: "Riverside Breakout",
        description: "D to D, then up the wall.",
        thumbnail: "data:image/png;base64,AAAA",
        focus: "skaters",
        goalies: "required",
        ageGroups: ["u10", "u12"],
        isTemplate: true,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        updatedAt: new Date("2026-09-01T00:00:00Z"),
        playData: {
            ...createEmptyPlayData(),
            area: { kind: "half-left" },
            equipment: [
                { id: "c1", kind: "cone", position: { x: 20, y: 20 }, rotation: 0 },
                { id: "c2", kind: "cone", position: { x: 30, y: 20 }, rotation: 0 },
                { id: "p1", kind: "puckPile", position: { x: 40, y: 20 }, rotation: 0 },
            ],
        },
        ...overrides,
    };
}

function renderView(props: Partial<Parameters<typeof DrillDetailView>[0]> = {}) {
    const store = createMockPlannerStore();
    const platform = createHashPlatform();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <DrillDetailView play={play()} teamId={TEAM} canEdit {...props} />
        </ThemeProvider>,
        { store, platform },
    );
    return { store, platform };
}

beforeEach(() => vi.clearAllMocks());

describe("DrillDetailView", () => {
    it("shows the drill: name, diagram, description and tags", () => {
        renderView({ usageCount: 3 });
        expect(screen.getByRole("heading", { level: 1, name: "Riverside Breakout" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Riverside Breakout diagram" })).toBeInTheDocument();
        expect(screen.getByText("D to D, then up the wall.")).toBeInTheDocument();
        expect(screen.getByText("Skaters")).toBeInTheDocument();
        expect(screen.getByText("Needs goalie")).toBeInTheDocument();
        expect(screen.getByText("10U, 12U")).toBeInTheDocument();
        expect(screen.getAllByText("Half ice (left)").length).toBeGreaterThan(0);
        expect(screen.getByText("Cone ×2")).toBeInTheDocument();
        expect(screen.getAllByText("Puck pile").length).toBeGreaterThan(0);
        expect(screen.getByTestId("drill-usage")).toHaveTextContent("Used in 3 practices");
    });

    it("says so when there is no description, no gear and every age", () => {
        renderView({ play: play({ description: null, ageGroups: [], playData: createEmptyPlayData() }) });
        expect(screen.getByText("No description yet.")).toBeInTheDocument();
        expect(screen.getByText("No equipment drawn")).toBeInTheDocument();
        expect(screen.getByText("All ages")).toBeInTheDocument();
        expect(screen.queryByTestId("drill-usage")).toBeNull();
    });

    it("renders another feature's extra rows in its slot", () => {
        renderView({ extras: <div data-testid="extra-row">Gear list</div> });
        expect(screen.getByTestId("extra-row")).toBeInTheDocument();
    });

    it("gives an editor Edit, Add to new practice and Duplicate, linked with the platform's routes", () => {
        renderView();
        expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `#/library/${PLAY_ID}/edit`);
        expect(screen.getByRole("link", { name: "Add to new practice" })).toHaveAttribute("href", `#/library/${PLAY_ID}/practice`);
        expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Drill library" })).toHaveAttribute("href", "#/library");
    });

    it("shows a viewer the drill without the editing actions", () => {
        renderView({ canEdit: false });
        expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Add to new practice" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
        expect(screen.getByRole("button", { name: "Download diagram" })).toBeInTheDocument();
    });

    it("duplicates into the library and opens the copy", async () => {
        const { store, platform } = renderView();
        store.createPlay.mockResolvedValue({ success: true, data: { id: "cnewxxxxxxxxxxxxxxxxxxxxx", name: "Riverside Breakout (copy)", isTemplate: true } });
        fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
        await waitFor(() => expect(platform.navigate).toHaveBeenCalledWith("#/library/cnewxxxxxxxxxxxxxxxxxxxxx"));
        expect(store.createPlay).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Riverside Breakout (copy)",
                description: "D to D, then up the wall.",
                focus: "skaters",
                goalies: "required",
                ageGroups: ["u10", "u12"],
                isTemplate: true,
                teamId: TEAM,
            }),
        );
    });

    it("shows a failed duplicate and stays", async () => {
        const { store, platform } = renderView();
        store.createPlay.mockResolvedValue({ success: false, error: "Only team admins can add plays" });
        fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
        expect(await screen.findByText("Only team admins can add plays")).toBeInTheDocument();
        expect(platform.navigate).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Duplicate" })).toBeEnabled();
    });

    it("downloads the diagram as a PNG named after the drill", async () => {
        renderView();
        fireEvent.click(screen.getByRole("button", { name: "Download diagram" }));
        await waitFor(() => expect(download.downloadBlob).toHaveBeenCalledTimes(1));
        const [blob, name] = download.downloadBlob.mock.calls[0];
        expect((blob as Blob).type).toBe("image/png");
        expect(name).toBe("riverside-breakout-diagram.png");
    });
});
