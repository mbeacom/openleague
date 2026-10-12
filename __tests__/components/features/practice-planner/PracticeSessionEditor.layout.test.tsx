/** The session editor's layout: the setup rail beside the drill list, the sticky save bar, and Compact rows. */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { drill, renderEditor, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { COMPACT_ROWS_LABEL } from "@/components/features/practice-planner/SessionDrillList";
import { STATION_SWITCH_LABEL } from "@/components/features/practice-planner/SessionDrillCard";
import { DRILL_DENSITY_STORAGE_KEY } from "@/components/features/practice-planner/useDrillDensity";

beforeAll(stubResizeObserver);
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

/** The CSS Emotion generated for an element's classes. */
function cssFor(element: HTMLElement): string {
    const sheets = Array.from(document.querySelectorAll("style")).map((style) => style.textContent ?? "").join("\n");
    return Array.from(element.classList)
        .filter((name) => name.startsWith("css-"))
        .map((name) => sheets.split("}").filter((rule) => rule.includes(`.${name}`)).join("}"))
        .join("\n");
}

const PLAYS = [drill("a", 0, { name: "Breakout", instructions: "Hard first pass" }), drill("b", 1, { name: "Shooting" })];
const compactSwitch = () => screen.getByRole("switch", { name: COMPACT_ROWS_LABEL });
const card = (name: string) => screen.getByRole("heading", { name }).closest(".MuiCard-root") as HTMLElement;

describe("PracticeSessionEditor layout", () => {
    it("puts the session's setup in a rail that sticks once the page is wide, and the drills in the main column", () => {
        renderEditor(PLAYS);
        const rail = screen.getByRole("complementary", { name: "Session setup" });
        expect(within(rail).getByRole("textbox", { name: /title/i })).toBeInTheDocument();
        expect(within(rail).queryByRole("heading", { name: "Plays in Session" })).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Plays in Session" })).toBeInTheDocument();

        const css = cssFor(rail);
        expect(css).toMatch(/@container \(min-width: ?1000px\)/);
        expect(css).toMatch(/position: ?sticky/);
    });

    it("keeps the save bar in view at the bottom, above the phone navigation's inset", () => {
        renderEditor(PLAYS);
        const bar = screen.getByRole("region", { name: "Save" });
        expect(within(bar).getByRole("button", { name: /^save session/i })).toBeInTheDocument();
        const css = cssFor(bar);
        expect(css).toMatch(/position: ?sticky/);
        expect(css).toMatch(/--planner-bottom-inset/);
    });

    it("drops the old 1400px cap and its extra padding", () => {
        renderEditor(PLAYS);
        const root = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
        expect(cssFor(root)).not.toMatch(/max-width: ?1400px/);
    });
});

describe("PracticeSessionEditor: Compact rows", () => {
    it("starts with the full cards", () => {
        renderEditor(PLAYS);
        expect(compactSwitch()).not.toBeChecked();
        expect(card("Breakout")).not.toHaveAttribute("data-density");
        expect(screen.getByText("Hard first pass")).toBeInTheDocument();
    });

    it("shows one line per drill with every control, and remembers the choice on this device", () => {
        renderEditor(PLAYS);
        fireEvent.click(compactSwitch());

        expect(card("Breakout")).toHaveAttribute("data-density", "compact");
        expect(screen.queryByText("Hard first pass")).not.toBeInTheDocument();
        const row = card("Breakout");
        for (const name of ["Move play 1 up", "Move play 1 down", "Edit play 1", "Edit diagram for Breakout", "Delete play 1"]) {
            expect(within(row).getByRole("button", { name })).toBeInTheDocument();
        }
        expect(localStorage.getItem(DRILL_DENSITY_STORAGE_KEY)).toBe("compact");

        // Another visit on this device opens compact.
        cleanup();
        renderEditor(PLAYS);
        expect(compactSwitch()).toBeChecked();
        expect(card("Shooting")).toHaveAttribute("data-density", "compact");

        // Back to the full cards forgets it.
        fireEvent.click(compactSwitch());
        expect(localStorage.getItem(DRILL_DENSITY_STORAGE_KEY)).toBeNull();
        expect(card("Shooting")).not.toHaveAttribute("data-density");
    });

    it("opens the full card to edit a compact row", () => {
        localStorage.setItem(DRILL_DENSITY_STORAGE_KEY, "compact");
        renderEditor(PLAYS);
        fireEvent.click(screen.getByRole("button", { name: "Edit play 1" }));
        expect(screen.getByRole("spinbutton", { name: "Duration (minutes)" })).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Instructions" })).toHaveValue("Hard first pass");
    });

    it("keeps the station switch on a compact row, so a drill can join or leave a station block", () => {
        localStorage.setItem(DRILL_DENSITY_STORAGE_KEY, "compact");
        renderEditor(PLAYS);
        // The first drill always runs on its own: no switch.
        expect(within(card("Breakout")).queryByRole("switch", { name: STATION_SWITCH_LABEL })).not.toBeInTheDocument();
        const toggle = within(card("Shooting")).getByRole("switch", { name: STATION_SWITCH_LABEL });
        expect(toggle).not.toBeChecked();
        fireEvent.click(toggle);
        expect(screen.getByRole("group", { name: "Station 2 of 2: Shooting" })).toHaveAttribute("data-density", "compact");
        const joined = within(card("Shooting")).getByRole("switch", { name: STATION_SWITCH_LABEL });
        expect(joined).toBeChecked();
        fireEvent.click(joined);
        expect(screen.queryByRole("group", { name: "Station 2 of 2: Shooting" })).not.toBeInTheDocument();
    });

    it("reads a stored value it doesn't know as the full cards", () => {
        localStorage.setItem(DRILL_DENSITY_STORAGE_KEY, "dense");
        renderEditor(PLAYS);
        expect(compactSwitch()).not.toBeChecked();
    });
});
