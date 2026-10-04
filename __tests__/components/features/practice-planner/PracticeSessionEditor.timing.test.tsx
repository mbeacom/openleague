import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { TEAM, drill, renderEditor, save, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import type { SessionItem } from "@/types/practice-planner";

beforeAll(stubResizeObserver);

/** As getPracticeSessionForEdit returns it: normalized, every timing field loaded. */
const STORED: SessionItem[] = [
    { id: "kw", kind: "warmup", label: "Laps", sequence: 0, duration: 8, instructions: "Easy", runsWithPrevious: false },
    drill("ka", 1, { stays: true, rotateEveryMinutes: 5, duration: 10 }),
    drill("kb", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    drill("kc", 3, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    { id: "kd", kind: "cooldown", label: "", sequence: 4, duration: 5, instructions: "", runsWithPrevious: false },
];

describe("PracticeSessionEditor: Add block", () => {
    it("adds each block kind at the end with its default label and minutes", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        for (const name of ["Warm-up", "Water break", "Transition", "Cool-down"]) {
            fireEvent.click(screen.getByRole("button", { name: "Add block" }));
            fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${name}`) }));
        }
        expect(screen.getByRole("heading", { name: "Cool-down" })).toBeInTheDocument();
        await save();
        const plays = onSave.mock.calls[0][0].plays as SessionItem[];
        expect(plays.map((row) => [row.kind ?? "drill", row.duration, row.sequence])).toEqual([
            ["drill", 10, 0], ["warmup", 8, 1], ["break", 2, 2], ["transition", 2, 3], ["cooldown", 5, 4],
        ]);
        expect(plays.slice(1).every((row) => "label" in row && row.label === "")).toBe(true);
    });

    it("keeps Add block out of reach while the session is being saved for the first time", async () => {
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <PracticeSessionEditor teamId={TEAM} initialData={{ title: "Practice", duration: 60, date: new Date(), plays: [] }} onSave={() => new Promise(() => undefined)} />
                </LocalizationProvider>
            </ThemeProvider>,
        );
        await save();
        expect(screen.getByRole("button", { name: "Add block" })).toBeDisabled();
    });
});

describe("PracticeSessionEditor: Between blocks", () => {
    it("offers None and 1–5 minutes, counts the gap in the total, and saves the choice", async () => {
        const onSave = renderEditor([drill("k1", 0), drill("k2", 1)]);
        const field = screen.getByRole("combobox", { name: /^Between blocks/ });
        expect(field).toHaveTextContent("None");
        fireEvent.mouseDown(field);
        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual(["None", "1 min", "2 min", "3 min", "4 min", "5 min"]);
        fireEvent.click(screen.getByRole("option", { name: "2 min" }));
        expect(screen.getByText("Total Play Time: 22 minutes")).toBeInTheDocument();
        await save();
        expect(onSave.mock.calls[0][0].transitionMinutes).toBe(2);
    });

    it("sends no gap when none was loaded and the coach didn't pick one (absent = unchanged)", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        await save();
        expect(onSave.mock.calls[0][0].transitionMinutes).toBeUndefined();
    });
});

describe("PracticeSessionEditor: an untouched editor", () => {
    it("saves every stored value back: block rows, labels, notes, stays, rotation and the gap", async () => {
        const onSave = renderEditor(STORED, { transitionMinutes: 3 });
        expect(screen.getByRole("combobox", { name: /^Between blocks/ })).toHaveTextContent("3 min");
        fireEvent.change(screen.getByLabelText(/^Session Title/), { target: { value: "Renamed" } });
        await save();
        const sent = onSave.mock.calls[0][0];
        expect(sent.title).toBe("Renamed");
        expect(sent.plays).toEqual(STORED);
        expect(sent.transitionMinutes).toBe(3);
    });

    it("shows the block cards between the drills", () => {
        renderEditor(STORED, { transitionMinutes: 3 });
        const laps = screen.getByRole("region", { name: "Laps" });
        expect(within(laps).getByText("8 min")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Cool-down" })).toBeInTheDocument();
    });
});

describe("PracticeSessionEditor: drill cards around block rows", () => {
    const ROWS: SessionItem[] = [
        { id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "", runsWithPrevious: false },
        drill("ka", 1, { name: "" }),
        { id: "kb", kind: "break", label: "", sequence: 2, duration: 2, instructions: "", runsWithPrevious: false },
        drill("kc", 3, { name: "" }),
    ];

    it("numbers the drills 1, 2 and keeps each row's move position", async () => {
        const onSave = renderEditor(ROWS);
        expect(screen.getByText("#1")).toBeInTheDocument();
        expect(screen.getByText("#2")).toBeInTheDocument();
        expect(screen.queryByText("#4")).toBeNull();
        expect(screen.getByRole("heading", { name: "Drill 1" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Drill 2" })).toBeInTheDocument();
        expect(screen.getByText("Play 2")).toBeInTheDocument();
        // "Move play 2 up" moves the fourth row (index 3) above the break.
        fireEvent.click(screen.getByRole("button", { name: "Move play 2 up" }));
        await save();
        expect((onSave.mock.calls[0][0].plays as SessionItem[]).map((row) => row.id)).toEqual(["kw", "ka", "kc", "kb"]);
    });

    it("offers no station switch on a drill right after a block row", () => {
        renderEditor(ROWS);
        expect(screen.queryAllByRole("switch", { name: /Run as a station with the previous drill/ })).toHaveLength(0);
        expect(screen.queryAllByRole("checkbox", { name: /Run as a station with the previous drill/ })).toHaveLength(0);
    });

    it("keeps the station switch on a drill right after a drill", () => {
        renderEditor([...ROWS, drill("kd", 4)]);
        expect(screen.getAllByRole("switch", { name: /Run as a station with the previous drill/ })).toHaveLength(1);
    });

    it("keeps an open drill editor open while a block is edited", () => {
        renderEditor(ROWS);
        fireEvent.click(screen.getByRole("button", { name: "Edit play 1" }));
        expect(screen.getByRole("spinbutton", { name: "Duration (minutes)" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "More minutes for Water break" }));
        const water = screen.getByRole("region", { name: "Water break" });
        fireEvent.change(within(water).getByRole("textbox", { name: "Note" }), { target: { value: "Fill bottles" } });
        fireEvent.change(within(water).getByRole("textbox", { name: "Label" }), { target: { value: "Water" } });
        expect(screen.getByRole("spinbutton", { name: "Duration (minutes)" })).toBeInTheDocument();
    });
});
