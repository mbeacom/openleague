/** The drill editor's animation preview and Steps mode (animated playback R8). */
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { PLAY_DATA_VERSION, type PlayData, type SavedPlay } from "@/types/practice-planner";

const theme = createTheme();

function renderEditor(playData?: PlayData) {
    const initialData: Partial<SavedPlay> | undefined = playData ? { name: "Angling", playData } : undefined;
    return render(
        <ThemeProvider theme={theme}>
            <PlayEditor teamId="team-1" initialData={initialData} />
        </ThemeProvider>
    );
}

const moving: PlayData = {
    version: PLAY_DATA_VERSION,
    players: [{ id: "a", role: "F", label: "A", position: { x: 20, y: 20 }, color: "#1976D2" }],
    drawings: [
        {
            id: "s",
            action: "skate",
            path: "straight",
            end: "arrow",
            points: [{ x: 22, y: 20 }, { x: 60, y: 40 }],
            color: "#212121",
            strokeWidth: 3,
        },
    ],
    equipment: [],
    annotations: [],
};

describe("PlayEditor animation preview", () => {
    it("is unavailable until the diagram has something that moves", () => {
        renderEditor();
        expect(screen.getByRole("button", { name: "Preview animation" })).toBeDisabled();
    });

    it("opens the playback board for the drill being edited, and closes back to the editor", async () => {
        const user = userEvent.setup();
        renderEditor(moving);
        await user.click(screen.getByRole("button", { name: "Preview animation" }));
        const dialog = await screen.findByRole("dialog", { name: "Preview: Angling" });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByRole("group", { name: /Angling playback/ })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Close playback" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});

describe("PlayEditor Steps mode", () => {
    it("opens the step controls, numbers the drill in drawing order and returns it to automatic", async () => {
        const user = userEvent.setup();
        renderEditor(moving);
        expect(screen.queryByText(/Tapping a movement assigns step/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "steps mode" }));
        expect(screen.getByText("Tapping a movement assigns step 1. Tap it again to remove its step.")).toBeInTheDocument();
        expect(screen.getByText(/grey numbers show the automatic order/)).toBeInTheDocument();
        const automatic = screen.getByRole("button", { name: "Use automatic order" });
        expect(automatic).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Number in drawing order" }));
        expect(screen.getByText(/Steps play in order/)).toBeInTheDocument();
        expect(automatic).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "New step" }));
        expect(screen.getByText(/assigns step 2\./)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Same step" }));
        expect(screen.getByText(/assigns step 1\./)).toBeInTheDocument();

        await user.click(automatic);
        expect(screen.getByText(/grey numbers show the automatic order/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(screen.queryByText(/Tapping a movement assigns step/)).not.toBeInTheDocument();
    });
});
