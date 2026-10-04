/** Shared harness for the PracticeSessionEditor practice-timing tests (Add block, Between blocks, rotation). */
import { vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession, PracticeSessionData, SessionItem } from "@/types/practice-planner";

export const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
export const SESSION = "csessionxxxxxxxxxxxxxxxxx";

/** jsdom has no ResizeObserver, which the editor's board uses: call from beforeAll. */
export function stubResizeObserver(): void {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

export function drill(id: string, sequence: number, extra: Partial<PlayInSession> = {}): PlayInSession {
    return {
        id, playId: `cplay${id}xxxxxxxxxxxxxxxxxxx`, name: `Drill ${id}`, sequence, runsWithPrevious: false,
        duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "", ...extra,
    };
}

/** A saved session's editor; returns its onSave mock. */
export function renderEditor(plays: SessionItem[], extra: Partial<PracticeSessionData> = {}, onSave = vi.fn().mockResolvedValue({ success: true })) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId={SESSION}
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays, ...extra }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return onSave;
}

export async function save(): Promise<void> {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
}
