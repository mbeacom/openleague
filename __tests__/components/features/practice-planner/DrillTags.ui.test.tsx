import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { GoalieBadge } from "@/components/features/practice-planner/GoalieBadge";
import { DrillTagFields } from "@/components/features/practice-planner/DrillTagFields";
import { DrillFilterChips } from "@/components/features/practice-planner/DrillFilterChips";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { SessionDrillCard } from "@/components/features/practice-planner/SessionDrillCard";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: vi.fn(() => "data:image/png;base64,AA==") }));

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("GoalieBadge", () => {
    it("is an image named for screen readers", () => {
        themed(<GoalieBadge />);
        expect(screen.getByRole("img", { name: "Needs a goalie" })).toHaveTextContent("G");
    });
});

describe("DrillTagFields", () => {
    it("sets Goalies to required when Focus becomes Goalies, and leaves it alone otherwise", async () => {
        const onChange = vi.fn();
        themed(<DrillTagFields value={{ focus: "team", goalies: "optional" }} onChange={onChange} />);
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Focus/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Goalies" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "goalies", goalies: "required" });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Focus/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Skaters" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "skaters", goalies: "optional" });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Goalies/ }));
        fireEvent.click(await screen.findByRole("option", { name: "No goalie" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "team", goalies: "none" });
    });
});

describe("DrillFilterChips", () => {
    it("reports single-select chip changes per row; All / Any clears the row", () => {
        const onChange = vi.fn();
        themed(<DrillFilterChips value={{ focus: "goalies" }} onChange={onChange} />);
        const focus = screen.getByRole("group", { name: "Focus" });
        expect(within(focus).getByRole("button", { name: "Goalies" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(within(focus).getByRole("button", { name: "All" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: undefined });
        fireEvent.click(within(screen.getByRole("group", { name: "Goalies" })).getByRole("button", { name: "Needs goalie" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "goalies", goalies: "required" });
    });
});

describe("PlayEditor drill tags", () => {
    it("starts from the drill's tags, or team / optional", () => {
        themed(<PlayEditor teamId="t" initialData={{ name: "Warm-up", focus: "goalies", goalies: "required" }} autoSave={false} />);
        expect(screen.getByRole("combobox", { name: /^Focus/ })).toHaveTextContent("Goalies");
        expect(screen.getByRole("combobox", { name: /^Goalies/ })).toHaveTextContent("Needs goalie");
    });

    it("saves the chosen tags with the drill", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        themed(<PlayEditor teamId="t" initialData={{ name: "Warm-up" }} autoSave={false} onSave={onSave} />);
        expect(screen.getByRole("combobox", { name: /^Focus/ })).toHaveTextContent("Team");
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Focus/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Goalies" }));
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ focus: "goalies", goalies: "required" })));
    });
});

describe("SessionDrillCard goalie badge", () => {
    function card(goalies?: "none" | "optional" | "required") {
        renderWithPlanner(
            <SessionDrillCard
                play={{ id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Warm-up", sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", playData: createEmptyPlayData(), goalies }}
                index={0} canMoveUp={false} canMoveDown={false} station={null} onToggleStation={vi.fn()} isEditing={false}
                onDelete={vi.fn()} onEdit={vi.fn()} onUpdate={vi.fn()} onCancelEdit={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()}
                canEditDiagram onEditDiagram={vi.fn()}
            />,
        );
    }
    it("shows the badge only for a drill that needs a goalie", () => {
        card("required");
        expect(screen.getByRole("img", { name: "Needs a goalie" })).toBeInTheDocument();
    });
    it("hides it otherwise, including untagged drills", () => {
        card(undefined);
        expect(screen.queryByRole("img", { name: "Needs a goalie" })).toBeNull();
    });
});
