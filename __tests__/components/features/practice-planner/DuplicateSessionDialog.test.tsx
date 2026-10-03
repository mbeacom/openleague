import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { DuplicateSessionDialog } from "@/components/features/practice-planner/DuplicateSessionDialog";
const actions = createMockPlannerStore();

const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const SOURCE_DATE = "2026-04-07T22:00:00.000Z";

function plusSevenDays(iso: string): Date {
    const date = new Date(iso);
    date.setDate(date.getDate() + 7);
    return date;
}

beforeEach(() => vi.clearAllMocks());

describe("DuplicateSessionDialog", () => {
    it("defaults to a week later and opens the copy's edit page", async () => {
        actions.duplicatePracticeSession.mockResolvedValue({ success: true, data: { id: "ccopyxxxxxxxxxxxxxxxxxxxx" } });
        renderWithPlanner(<DuplicateSessionDialog open sessionId={SESSION} teamId={TEAM} sourceDate={SOURCE_DATE} onClose={vi.fn()} />, { store: actions });

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
        });

        const sent = actions.duplicatePracticeSession.mock.calls[0][0];
        expect(sent).toMatchObject({ id: SESSION, teamId: TEAM });
        expect(sent.date.toISOString()).toBe(plusSevenDays(SOURCE_DATE).toISOString());
        expect(push).toHaveBeenCalledWith("/practice-planner/ccopyxxxxxxxxxxxxxxxxxxxx/edit");
    });

    it("shows the error and stays open when duplication fails", async () => {
        actions.duplicatePracticeSession.mockResolvedValue({ success: false, error: "Practice session not found" });
        renderWithPlanner(<DuplicateSessionDialog open sessionId={SESSION} teamId={TEAM} sourceDate={SOURCE_DATE} onClose={vi.fn()} />, { store: actions });

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
        });
        expect(screen.getByText("Practice session not found")).toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });
});
