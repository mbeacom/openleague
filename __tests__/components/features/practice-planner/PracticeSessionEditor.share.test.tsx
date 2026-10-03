/** The editor offers team sharing only when its host can share (the static planner can't). */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";

function renderEditor(onShare?: (id: string) => Promise<void>) {
    return renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId="csessionxxxxxxxxxxxxxxxxx"
                    teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00Z"), plays: [] }}
                    onSave={vi.fn().mockResolvedValue({ success: true })}
                    onShare={onShare}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

describe("PracticeSessionEditor share control", () => {
    it("shows Share with Team when the host passes onShare", () => {
        renderEditor(vi.fn().mockResolvedValue(undefined));
        expect(screen.getByRole("button", { name: /share with team/i })).toBeInTheDocument();
    });

    it("hides it without onShare, so it can't 'succeed' as a no-op", () => {
        renderEditor();
        expect(screen.queryByRole("button", { name: /share with team/i })).not.toBeInTheDocument();
    });
});
