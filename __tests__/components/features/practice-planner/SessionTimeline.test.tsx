/** SessionTimeline (3b): one row per block, start times, minutes, drill names, planned footer. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SessionTimeline } from "@/components/features/practice-planner/SessionTimeline";
import { TIME_PLACEHOLDER } from "@/lib/hooks/useClockText";

const play = (name: string, sequence: number, duration: number, runsWithPrevious = false) => ({
    id: `row-${name}`,
    sequence,
    duration,
    runsWithPrevious,
    play: { name },
});

const PLAYS = [play("Breakout", 0, 15), play("Regroup", 1, 10, true), play("Shooting", 2, 10)];
const START = new Date("2026-04-07T22:00:00.000Z"); // 6:00 PM EDT

type Props = Partial<React.ComponentProps<typeof SessionTimeline<(typeof PLAYS)[number]>>>;

function ui(props: Props = {}) {
    return (
        <ThemeProvider theme={createTheme()}>
            <SessionTimeline
                plays={PLAYS}
                sessionStart={START}
                timeZone="America/New_York"
                showZone
                durationMinutes={60}
                {...props}
            />
        </ThemeProvider>
    );
}

function bodyRows() {
    return within(screen.getByRole("table", { name: "Session timeline" })).getAllByRole("row").slice(1);
}

describe("SessionTimeline (screen)", () => {
    it("shows one row per block with its start, minutes and drills", () => {
        render(ui());
        const [stations, shooting] = bodyRows();
        expect(bodyRows()).toHaveLength(2);

        expect(within(stations).getByText("6:00 PM EDT")).toBeInTheDocument();
        expect(within(stations).getByText("15")).toBeInTheDocument();
        expect(within(stations).getByText("Stations · 2")).toBeInTheDocument();
        expect(within(stations).getByText("Breakout")).toBeInTheDocument();
        expect(within(stations).getByText("Regroup")).toBeInTheDocument();

        expect(within(shooting).getByText("6:15 PM EDT")).toBeInTheDocument();
        expect(within(shooting).getByText("Shooting")).toBeInTheDocument();
        expect(within(shooting).queryByText(/^Stations/)).not.toBeInTheDocument();
    });

    it("uses the viewer's zone with no suffix when the session isn't booked", () => {
        render(ui({ timeZone: undefined, showZone: false }));
        expect(within(bodyRows()[0]).getAllByRole("cell")[0].textContent).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    });

    it("reads Planned X of Y min, and flags over time", () => {
        const { unmount } = render(ui());
        expect(screen.getByText("Planned 25 of 60 min")).toBeInTheDocument();
        unmount();

        render(ui({ durationMinutes: 20 }));
        expect(screen.getByText("Planned 25 of 20 min (over time!)")).toBeInTheDocument();
    });

    it("selects a drill when its name is clicked, and highlights the active block", () => {
        const onSelectPlay = vi.fn();
        render(ui({ onSelectPlay, activePlayId: "row-Regroup" }));

        fireEvent.click(screen.getByRole("button", { name: "Shooting" }));
        expect(onSelectPlay).toHaveBeenCalledWith("row-Shooting");

        expect(bodyRows()[0]).toHaveClass("Mui-selected");
        expect(bodyRows()[1]).not.toHaveClass("Mui-selected");
    });

    it("emits no viewer-zone clock text from the server (hydration)", () => {
        const unbooked = renderToStaticMarkup(ui({ timeZone: undefined, showZone: false }));
        expect(unbooked).toContain(TIME_PLACEHOLDER);
        expect(unbooked).not.toMatch(/\d:\d\d [AP]M/);

        expect(renderToStaticMarkup(ui())).toContain("6:00 PM EDT");
    });
});

describe("SessionTimeline (print)", () => {
    it("renders a plain table with no controls", () => {
        render(ui({ variant: "print", onSelectPlay: vi.fn() }));
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(within(bodyRows()[0]).getByText("Stations · 2")).toBeInTheDocument();
        expect(within(bodyRows()[0]).getByText(/Regroup · 10 min/)).toBeInTheDocument();
        expect(screen.getByText("Planned 25 of 60 min")).toBeInTheDocument();
    });
});

describe("SessionTimeline: block rows and the gap between blocks", () => {
    const ROWS = [
        { id: "row-w", sequence: 0, duration: 8, runsWithPrevious: false, kind: "warmup" as const, label: null, instructions: "Easy laps" },
        play("Breakout", 1, 15),
        { id: "row-c", sequence: 2, duration: 5, runsWithPrevious: false, kind: "cooldown" as const, label: "Stretch", instructions: null },
    ];

    it("shows a block by its label and note, never as a link, and folds the gap into start times", () => {
        render(
            <ThemeProvider theme={createTheme()}>
                <SessionTimeline plays={ROWS} sessionStart={START} timeZone="America/New_York" showZone durationMinutes={60} transitionMinutes={2} onSelectPlay={vi.fn()} />
            </ThemeProvider>,
        );
        const [warmup, breakout, cooldown] = bodyRows();
        expect(within(warmup).getByText("Warm-up")).toBeInTheDocument();
        expect(within(warmup).getByText(/Easy laps/)).toBeInTheDocument();
        expect(within(warmup).queryByRole("button")).toBeNull();
        expect(within(breakout).getByText("6:10 PM EDT")).toBeInTheDocument();
        expect(within(breakout).getByRole("button", { name: "Breakout" })).toBeInTheDocument();
        expect(within(cooldown).getByText("6:27 PM EDT")).toBeInTheDocument();
        expect(within(cooldown).getByText("Stretch")).toBeInTheDocument();
        expect(screen.getByText("Planned 32 of 60 min")).toBeInTheDocument();
    });

    it("prints a block as plain text", () => {
        const html = renderToStaticMarkup(
            <SessionTimeline variant="print" plays={ROWS} sessionStart={START} timeZone="America/New_York" showZone durationMinutes={60} transitionMinutes={2} />,
        );
        expect(html).toContain("Warm-up · Easy laps");
        expect(html).toContain("Planned 32 of 60 min");
    });
});

describe("SessionTimeline: a rotating station block (spec R9)", () => {
    const ROTATING = [
        { ...play("Goalie", 0, 10), stays: true, rotateEveryMinutes: 5 },
        { ...play("Skate A", 1, 5, true), stays: false, rotateEveryMinutes: null },
        { ...play("Skate B", 2, 5, true), stays: false, rotateEveryMinutes: null },
    ];

    it("chips the interval, marks the stays station, and puts the grid with clock times under the block", () => {
        render(ui({ plays: ROTATING }));
        const [block, gridRow] = bodyRows();
        expect(within(block).getByText("Rotates every 5 min")).toBeInTheDocument();
        // The chip is a div: its caption line must not be a <p> (invalid nesting, a React 19 hydration error).
        expect(block.querySelector("p .MuiChip-root")).toBeNull();
        expect(within(block).getByText(/stays/)).toBeInTheDocument();
        expect(within(block).getByText("10")).toBeInTheDocument();
        const grid = within(gridRow).getByRole("table", { name: /^Rotation grid/ });
        expect(within(grid).getAllByRole("row").map((row) => row.textContent)).toEqual([
            "StartGoalieSkate ASkate B",
            "6:00 PM EDTallAB",
            "6:05 PM EDTallBA",
        ]);
    });

    it("prints the rotation header, the stays mark and the grid", () => {
        const html = renderToStaticMarkup(ui({ plays: ROTATING, variant: "print" }));
        expect(html).toContain("Stations · rotate every 5 min · 10 min");
        expect(html).toContain("Goalie · stays");
        expect(html).toContain('class="bench-rotation"');
        expect(html).toMatch(/<td>all<\/td>/);
    });
});
