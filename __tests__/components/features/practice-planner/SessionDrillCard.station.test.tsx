/** The station switch on a session drill card (practice planner 2b). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
    SessionDrillCard,
    STATION_CAP_TOOLTIP,
    STATION_SWITCH_LABEL,
    type SessionDrillCardProps,
} from "@/components/features/practice-planner/SessionDrillCard";
import { createEmptyPlayData } from "@/lib/utils/play-data";

function renderCard(props: Partial<SessionDrillCardProps> = {}) {
    const onToggleStation = vi.fn();
    render(
        <SessionDrillCard
            play={{
                id: "k2", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 1, duration: 10,
                runsWithPrevious: false, instructions: "", playData: createEmptyPlayData(),
            }}
            index={1}
            canMoveUp
            canMoveDown
            station={{ checked: false, canToggle: true }}
            onToggleStation={onToggleStation}
            isEditing={false}
            onDelete={vi.fn()} onEdit={vi.fn()} onUpdate={vi.fn()} onCancelEdit={vi.fn()}
            onMoveUp={vi.fn()} onMoveDown={vi.fn()}
            canEditDiagram
            onEditDiagram={vi.fn()}
            {...props}
        />,
    );
    return { onToggleStation };
}

describe("SessionDrillCard station switch", () => {
    it("reports its own position when toggled", () => {
        const { onToggleStation } = renderCard();
        fireEvent.click(screen.getByLabelText(STATION_SWITCH_LABEL));
        expect(onToggleStation).toHaveBeenCalledWith(1);
    });

    it("is disabled during the create lock", () => {
        renderCard({ locked: true });
        expect(screen.getByLabelText(STATION_SWITCH_LABEL)).toBeDisabled();
    });

    it("is disabled with the cap tooltip when it would exceed the block cap", () => {
        renderCard({ station: { checked: false, canToggle: false } });
        expect(screen.getByLabelText(STATION_SWITCH_LABEL)).toBeDisabled();
        expect(screen.getByLabelText(STATION_CAP_TOOLTIP)).toBeInTheDocument();
    });

    it("is absent on the first drill", () => {
        renderCard({ index: 0, station: null });
        expect(screen.queryByLabelText(STATION_SWITCH_LABEL)).not.toBeInTheDocument();
    });
});
