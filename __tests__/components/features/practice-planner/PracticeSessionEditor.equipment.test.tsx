/** The session editor's Practice equipment section and the drill cards' lines (practice equipment spec R3–R5). */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { EquipmentCountItem, EquipmentKind, PlayData, PlayInSession } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";

const board = (kinds: EquipmentKind[]): PlayData => ({
    ...createEmptyPlayData(),
    equipment: kinds.map((kind, i) => ({ id: `e${i}`, kind, position: { x: 10 + i * 5, y: 10 }, rotation: 0 })),
});

function drill(id: string, sequence: number, kinds: EquipmentKind[], runsWithPrevious = false): PlayInSession {
    return { id, playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`, name: `Drill ${id}`, sequence, runsWithPrevious, duration: 10, instructions: "", playData: board(kinds), thumbnail: "" };
}

// A lone drill with 3 cones, then a station block of two drills with 2 cones and a net each.
const PLAYS = [drill("a", 0, ["cone", "cone", "cone"]), drill("b", 1, ["cone", "cone", "net"]), drill("c", 2, ["cone", "cone", "net"], true)];

function renderEditor(equipment?: EquipmentCountItem[], onSave = vi.fn().mockResolvedValue({ success: true })) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId="csessionxxxxxxxxxxxxxxxxx"
                    teamId={TEAM}
                    initialData={{ title: "Riverside Tuesday", duration: 60, date: new Date("2026-10-06T23:00:00.000Z"), plays: PLAYS, equipment }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return { onSave };
}

const section = () => screen.getByRole("region", { name: "Practice equipment" });
const totals = () => within(section()).getByRole("list", { name: "Practice equipment totals" });

describe("PracticeSessionEditor: practice equipment", () => {
    it("rolls the drills up: stations add up, blocks share", () => {
        renderEditor();
        expect(within(totals()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Cones ×4", "Nets ×2"]);
    });

    it("shows each drill's line on its card", () => {
        renderEditor();
        expect(screen.getAllByTestId("drill-equipment-line").map((line) => line.textContent)).toEqual([
            "Equipment: Cones ×3",
            "Equipment: Cones ×2 · Net ×1",
            "Equipment: Cones ×2 · Net ×1",
        ]);
    });

    it("breaks each total down by drill on demand", () => {
        renderEditor([{ name: "Pucks", count: 30 }]);
        fireEvent.click(within(section()).getByRole("switch", { name: "Show by drill" }));
        const nets = within(totals()).getAllByRole("listitem").find((li) => li.textContent?.startsWith("Nets ×2"));
        expect(nets?.textContent).toContain("Drill b · Station 1 of 2 ×1");
        expect(nets?.textContent).toContain("Drill c · Station 2 of 2 ×1");
        const pucks = within(totals()).getAllByRole("listitem").find((li) => li.textContent?.startsWith("Pucks ×30"));
        expect(pucks?.textContent).toContain("Added for the practice ×30");
    });

    it("adds the practice's own items and saves them; removing one saves without it", async () => {
        const { onSave } = renderEditor([{ name: "Whiteboard marker", count: 1 }]);
        fireEvent.change(within(section()).getByRole("combobox", { name: "Item" }), { target: { value: "Water bottles" } });
        fireEvent.change(within(section()).getByLabelText("Count"), { target: { value: "20" } });
        fireEvent.click(within(section()).getByRole("button", { name: "Add item" }));
        expect(within(totals()).getAllByRole("listitem").map((li) => li.textContent)).toContain("Water bottles ×20");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].equipment).toEqual([{ name: "Whiteboard marker", count: 1 }, { name: "Water bottles", count: 20 }]);

        fireEvent.click(within(section()).getByRole("button", { name: "Remove Whiteboard marker" }));
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls.at(-1)?.[0].equipment).toEqual([{ name: "Water bottles", count: 20 }]);
    });

    it("saves the loaded list unchanged when the coach doesn't touch it", async () => {
        const { onSave } = renderEditor([{ name: "Water bottles", count: 20 }]);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].equipment).toEqual([{ name: "Water bottles", count: 20 }]);
    });
});
