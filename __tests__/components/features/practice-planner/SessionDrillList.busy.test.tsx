import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { SessionDrillList } from "@/components/features/practice-planner/SessionDrillList";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

const play: PlayInSession = {
    id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 0, duration: 10, runsWithPrevious: false,
    instructions: "", playData: createEmptyPlayData(),
};

function renderList(disabled: boolean) {
    renderWithPlanner(
        <SessionDrillList
            plays={[play]} duration={60} editingPlayId={null} disabled={disabled}
            onOpenLibrary={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} onUpdate={vi.fn()}
            onCancelEdit={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onToggleStation={vi.fn()}
            canEditDiagram onEditDiagram={vi.fn()} onNewDrill={vi.fn()}
        />,
    );
}

describe("SessionDrillList busy state", () => {
    it("disables Edit diagram and New drill while saving or sharing", () => {
        renderList(true);
        expect(screen.getByRole("button", { name: /Edit diagram for Breakout/ })).toBeDisabled();
        expect(screen.getByRole("button", { name: "New drill" })).toBeDisabled();
    });

    it("enables them when idle", () => {
        renderList(false);
        expect(screen.getByRole("button", { name: /Edit diagram for Breakout/ })).toBeEnabled();
        expect(screen.getByRole("button", { name: "New drill" })).toBeEnabled();
    });
});
