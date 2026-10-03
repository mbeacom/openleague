/**
 * Autosave must never ask the server to email the team; only the explicit
 * Save button requests a notification.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
  PracticeSessionEditor,
  nextPlaySequence,
  type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
  } as unknown as typeof ResizeObserver;
});

vi.mock("@/lib/actions/plays", () => ({
  getPlaysByTeam: vi.fn().mockResolvedValue({ success: true, data: { plays: [], total: 0 } }),
  getPlayById: vi.fn(),
  deletePlay: vi.fn(),
}));

// The editor hosts SessionDrillDialog, which imports these server actions.
vi.mock("@/lib/actions/practice-session-drills", () => ({
  saveSessionDrill: vi.fn(),
  copySessionDrillToLibrary: vi.fn(),
}));

function renderEditor(onSave: (s: PracticeSessionSubmitData) => Promise<{ success: true }>) {
  return render(
    <ThemeProvider theme={createTheme()}>
     <LocalizationProvider dateAdapter={AdapterDateFns}>
      <PracticeSessionEditor
        sessionId="csessionxxxxxxxxxxxxxxxxx"
        teamId="cteamxxxxxxxxxxxxxxxxxxxx"
        initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00Z"), plays: [] }}
        onSave={onSave}
      />
     </LocalizationProvider>
    </ThemeProvider>,
  );
}

describe("PracticeSessionEditor notify", () => {
  it("autosave does not request notify; the Save button does", async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn().mockResolvedValue({ success: true as const });
      renderEditor(onSave);

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Practice v2" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0].notify).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: /^save/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1][0].notify).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("nextPlaySequence", () => {
  it("is max + 1 so a gap cannot collide, and 0 for an empty list", () => {
    expect(nextPlaySequence([])).toBe(0);
    expect(nextPlaySequence([{ sequence: 0 }, { sequence: 2 }])).toBe(3);
  });
});
