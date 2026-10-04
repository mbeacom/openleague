import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { drill, renderEditor, save, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { CANT_ROTATE_MESSAGE } from "@/components/features/practice-planner/StationBlockHeader";
import { STATION_SWITCH_LABEL } from "@/components/features/practice-planner/SessionDrillCard";
import type { PlayInSession, SessionItem } from "@/types/practice-planner";

beforeAll(stubResizeObserver);

/** As getPracticeSessionForEdit loads a block that doesn't rotate: every timing field present. */
const STATIONS: SessionItem[] = [
    drill("ka", 0, { duration: 15, stays: false, rotateEveryMinutes: null }),
    drill("kb", 1, { runsWithPrevious: true, duration: 15, stays: false, rotateEveryMinutes: null }),
    drill("kc", 2, { runsWithPrevious: true, duration: 15, stays: false, rotateEveryMinutes: null }),
];
const ROTATING: SessionItem[] = [
    drill("ka", 0, { stays: false, rotateEveryMinutes: 5, duration: 5 }),
    drill("kb", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    drill("kc", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
];
const WITH_STAYS: SessionItem[] = [
    drill("ka", 0, { stays: true, rotateEveryMinutes: 5, duration: 10 }),
    drill("kb", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    drill("kc", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
];
const station = (name: RegExp) => screen.getByRole("group", { name });
const sent = (onSave: ReturnType<typeof vi.fn>) => onSave.mock.calls[0][0].plays as PlayInSession[];

describe("PracticeSessionEditor: station rotation (spec R8)", () => {
    it("turns rotation on with an interval that keeps the block about as long, and summarizes it", async () => {
        const onSave = renderEditor(STATIONS);
        // Every block's switch is "Rotate": its description names the block it belongs to.
        expect(screen.getByLabelText("Rotate")).toHaveAccessibleDescription("Stations · 3 · 15 min");
        fireEvent.click(screen.getByLabelText("Rotate"));
        expect(screen.getByRole("combobox", { name: /^Every/ })).toHaveTextContent("5 min");
        expect(screen.getByText("3 stations × 5 min = 15 min · groups A–C")).toBeInTheDocument();
        await save();
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.duration])).toEqual([[5, 5], [null, 5], [null, 5]]);
    });

    it("changes the interval and writes every rotating station's minutes", async () => {
        const onSave = renderEditor(ROTATING);
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Every/ }));
        fireEvent.click(await screen.findByRole("option", { name: "6 min" }));
        expect(screen.getByText("3 stations × 6 min = 18 min · groups A–C")).toBeInTheDocument();
        await save();
        expect(sent(onSave).map((p) => p.duration)).toEqual([6, 6, 6]);
    });

    it("shows Stays in place of the minutes while the block rotates", () => {
        renderEditor(ROTATING);
        const card = station(/Drill kb/);
        expect(within(card).getByLabelText("Stays")).not.toBeChecked();
        expect(within(card).getByText("Doesn't rotate, e.g. goalie station")).toBeInTheDocument();
        expect(within(card).queryByText(/^Duration:/)).toBeNull();
    });

    it("keeps a stays station for the whole block while the others rotate", async () => {
        const onSave = renderEditor(ROTATING);
        fireEvent.click(within(station(/Drill ka/)).getByLabelText("Stays"));
        expect(screen.getByText("2 stations × 5 min = 10 min · groups A–B")).toBeInTheDocument();
        await save();
        expect(sent(onSave).map((p) => [p.stays, p.duration])).toEqual([[true, 10], [false, 5], [false, 5]]);
    });

    it("explains when the block can't rotate, keeps the coach's ticks, and saves without the rotation", async () => {
        const onSave = renderEditor(ROTATING.slice(0, 2).map((row) => ({ ...row })));
        fireEvent.click(within(station(/Drill ka/)).getByLabelText("Stays"));
        expect(screen.getByText(CANT_ROTATE_MESSAGE)).toBeInTheDocument();
        expect(within(station(/Drill ka/)).getByLabelText("Stays")).toBeChecked();
        await save();
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.stays])).toEqual([[null, false], [null, false]]);
    });

    it("shows and hides the rotation grid", async () => {
        renderEditor(WITH_STAYS);
        expect(screen.queryByRole("table", { name: /^Rotation grid/ })).toBeNull();
        // aria-controls only while the grid it names is in the document (the collapse unmounts it).
        expect(screen.getByRole("button", { name: "Show rotation grid" })).not.toHaveAttribute("aria-controls");
        fireEvent.click(screen.getByRole("button", { name: "Show rotation grid" }));
        const table = screen.getByRole("table", { name: /^Rotation grid/ });
        const controls = screen.getByRole("button", { name: "Hide rotation grid" }).getAttribute("aria-controls");
        expect(controls && document.getElementById(controls)?.contains(table)).toBe(true);
        expect(within(table).getAllByRole("row").map((row) => row.textContent)).toEqual([
            "StartDrill kaDrill kbDrill kc",
            "0–5 minallAB",
            "5–10 minallBA",
        ]);
        fireEvent.click(screen.getByRole("button", { name: "Hide rotation grid" }));
        // The grid unmounts when its collapse transition ends.
        await waitFor(() => expect(screen.queryByRole("table", { name: /^Rotation grid/ })).toBeNull());
    });

    it("turning rotation off clears it and every Stays mark", async () => {
        const onSave = renderEditor(WITH_STAYS);
        fireEvent.click(screen.getByLabelText("Rotate"));
        expect(screen.queryByLabelText("Stays")).toBeNull();
        await save();
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.stays])).toEqual([[null, false], [null, false], [null, false]]);
    });

    it("gives each station back its own minutes when Rotate is turned off in the same sitting", async () => {
        const onSave = renderEditor([
            drill("ka", 0, { duration: 12, stays: false, rotateEveryMinutes: null }),
            drill("kb", 1, { runsWithPrevious: true, duration: 9, stays: false, rotateEveryMinutes: null }),
            drill("kc", 2, { runsWithPrevious: true, duration: 15, stays: false, rotateEveryMinutes: null }),
        ]);
        fireEvent.click(screen.getByLabelText("Rotate"));
        // Rotating writes M (here 15 / 3 = 5) on every station...
        expect(screen.getByText("3 stations × 5 min = 15 min · groups A–C")).toBeInTheDocument();
        fireEvent.click(within(station(/Drill ka/)).getByLabelText("Stays"));
        fireEvent.click(screen.getByLabelText("Rotate"));
        await save();
        // ...and turning it off again restores what each station had, Stays tick or not.
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.stays, p.duration])).toEqual([[null, false, 12], [null, false, 9], [null, false, 15]]);
    });

    it("keeps M on every station when a block that loaded rotating is turned off (nothing to restore)", async () => {
        const onSave = renderEditor(ROTATING);
        fireEvent.click(screen.getByLabelText("Rotate"));
        await save();
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.duration])).toEqual([[null, 5], [null, 5], [null, 5]]);
    });

    it("restores a station's minutes only in the block that remembered them, after it leaves and joins another", async () => {
        const onSave = renderEditor([
            drill("ka", 0, { duration: 12, stays: false, rotateEveryMinutes: null }),
            drill("kb", 1, { runsWithPrevious: true, duration: 9, stays: false, rotateEveryMinutes: null }),
            drill("kc", 2, { runsWithPrevious: true, duration: 15, stays: false, rotateEveryMinutes: null }),
            drill("kd", 3, { duration: 6, stays: false, rotateEveryMinutes: 6 }),
            drill("ke", 4, { runsWithPrevious: true, duration: 6, stays: false, rotateEveryMinutes: null }),
        ]);
        // The first block rotates (remembering 12, 9 and 15), then kc leaves it...
        fireEvent.click(screen.getAllByLabelText("Rotate")[0]);
        fireEvent.click(within(station(/Drill kc/)).getByLabelText(STATION_SWITCH_LABEL));
        // ...and the rotating block kd–ke joins kc, which now heads it.
        fireEvent.click(within(screen.getByRole("group", { name: /Drill kd/ })).getByLabelText(STATION_SWITCH_LABEL));
        fireEvent.click(screen.getAllByLabelText("Rotate")[1]);
        await save();
        // kc's 15 belonged to the first block's rotation: turning off this one keeps M.
        expect(sent(onSave).map((p) => [p.id, p.rotateEveryMinutes, p.duration])).toEqual([
            ["ka", 5, 5], ["kb", null, 5], ["kc", null, 6], ["kd", null, 6], ["ke", null, 6],
        ]);
    });

    it("explains that a block can't rotate once a rotating station is deleted, and saves without the rotation", async () => {
        const onSave = renderEditor(WITH_STAYS.map((row) => ({ ...row })));
        fireEvent.click(screen.getByRole("button", { name: "Delete play 3" }));
        expect(screen.getByText(CANT_ROTATE_MESSAGE)).toBeInTheDocument();
        await save();
        expect(sent(onSave).map((p) => [p.id, p.rotateEveryMinutes, p.stays])).toEqual([["ka", null, false], ["kb", null, false]]);
    });

    it("offers no rotation on a drill that runs on its own", () => {
        renderEditor([drill("ka", 0)]);
        expect(screen.queryByLabelText("Rotate")).toBeNull();
    });
});
