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
