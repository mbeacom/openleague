/** The drill editor's animation preview: the same playback the drill page shows, before saving. */
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
