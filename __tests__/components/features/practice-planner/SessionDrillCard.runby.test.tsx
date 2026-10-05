/** Run by on a session drill card (practice staff, spec R8). */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { SessionDrillCard, type SessionDrillCardProps } from "@/components/features/practice-planner/SessionDrillCard";
import { createEmptyPlayData } from "@/lib/utils/play-data";

function renderCard(props: Partial<SessionDrillCardProps> = {}) {
    renderWithPlanner(
        <SessionDrillCard
            play={{
                id: "k2", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 1, duration: 10,
                runsWithPrevious: false, instructions: "", playData: createEmptyPlayData(), staff: ["s1"],
            }}
            index={1}
            canMoveUp
            canMoveDown
            station={{ checked: false, canToggle: true }}
            onToggleStation={vi.fn()}
            runBy={{ staff: [{ id: "s1", name: "Sam" }], value: ["s1"], onChange: vi.fn() }}
            isEditing={false}
            onDelete={vi.fn()} onEdit={vi.fn()} onUpdate={vi.fn()} onCancelEdit={vi.fn()}
            onMoveUp={vi.fn()} onMoveDown={vi.fn()}
            canEditDiagram
            onEditDiagram={vi.fn()}
            {...props}
        />,
    );
    return screen.getByRole("combobox", { name: "Run by for Breakout" });
}

describe("SessionDrillCard: Run by", () => {
    it("is enabled on an idle card", () => {
        expect(renderCard()).toBeEnabled();
    });

    it("is disabled while the list is busy (saving or sharing)", () => {
        expect(renderCard({ disabled: true })).toBeDisabled();
    });

    it("is disabled during the create lock", () => {
        expect(renderCard({ locked: true })).toBeDisabled();
    });
});
