import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const AT = new Date("2026-04-01T00:00:00Z");
const LIB = { id: "cplay1xxxxxxxxxxxxxxxxxxx", name: "My Warm-up", description: null, thumbnail: null, isTemplate: true, createdAt: AT, updatedAt: AT, focus: "goalies", goalies: "required", ageGroups: ["u8"] };

describe("PracticeSessionEditor: drill tags", () => {
    it("adds a library drill with its tags", async () => {
        const store = createMockPlannerStore();
        store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: [LIB], total: 1, page: 1, limit: 20 } });
        store.getPlayById.mockResolvedValue({ success: true, data: { ...LIB, playData: createEmptyPlayData() } });
        const onSave = vi.fn().mockResolvedValue({ success: true });
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <PracticeSessionEditor teamId={TEAM} initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays: [] }} onSave={onSave} />
                </LocalizationProvider>
            </ThemeProvider>,
            { store },
        );
        fireEvent.click(screen.getByRole("button", { name: "Add from library" }));
        fireEvent.click(await screen.findByText("My Warm-up"));
        // The drill list's empty state goes away once the drill is added.
        await waitFor(() => expect(screen.queryByText("No plays added yet")).toBeNull());
        // The library dialog's exit transition hides the page from the accessibility tree until it ends.
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].plays[0]).toMatchObject({ name: "My Warm-up", focus: "goalies", goalies: "required", ageGroups: ["u8"] });
    });
});
