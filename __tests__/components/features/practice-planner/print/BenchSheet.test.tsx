/** BenchSheet (3b): header, timeline, one legend, then drills paired into pages. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AA==") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: mockGenerate }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    LegendSwatch: () => <span data-testid="swatch" />,
}));

import { BenchSheet, type BenchSheetSession } from "@/components/features/practice-planner/print/BenchSheet";

const pass = (id: string) => ({
    id,
    action: "pass" as const,
    path: "straight" as const,
    end: "arrow" as const,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    color: "#000000",
    strokeWidth: 2,
});
const withPass = (id: string): PlayData => ({ ...createEmptyPlayData(), drawings: [pass(id)] });

function sessionPlay(
    name: string,
    sequence: number,
    runsWithPrevious: boolean,
    duration: number,
    extra: { instructions?: string | null; description?: string | null; playData?: PlayData | null } = {},
): BenchSheetSession["plays"][number] {
    return {
        id: `row-${name}`,
        sequence,
        duration,
        runsWithPrevious,
        instructions: extra.instructions ?? null,
        play: {
            id: `play-${name}`,
            name,
            description: extra.description ?? null,
            thumbnail: null,
            playData: extra.playData === undefined ? createEmptyPlayData() : extra.playData,
        },
    };
}

const SESSION: BenchSheetSession = {
    id: "csessionxxxxxxxxxxxxxxxxx",
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    isShared: true,
    createdByName: "Coach",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    teamName: "Ice Hawks U12",
    venueId: "cvenuexxxxxxxxxxxxxxxxxxx",
    venueName: "Test Rink",
    venueTimezone: "America/Denver",
    surfaceId: "csurfacexxxxxxxxxxxxxxxxx",
    surfaceName: "Main",
    segmentId: "csegmentxxxxxxxxxxxxxxxxx",
    segmentName: "Half A",
    segmentKind: "HALF",
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on April 7
    plays: [
        sessionPlay("Breakout", 0, false, 15, { instructions: "Hard first pass.", playData: withPass("d1") }),
        sessionPlay("Regroup", 1, true, 10, { instructions: "  ", description: "Neutral-zone regroup.", playData: withPass("d2") }),
        sessionPlay("Shooting", 2, false, 10, { description: "Quick release." }),
        sessionPlay("Lost", 3, false, 5, { playData: null }),
        sessionPlay("Cooldown", 4, false, 5),
    ],
};

function renderSheet(session: BenchSheetSession = SESSION) {
    render(
        <ThemeProvider theme={createTheme()}>
            <BenchSheet session={session} />
        </ThemeProvider>,
    );
}

const drills = () => screen.queryAllByRole("article");

afterEach(() => {
    vi.restoreAllMocks();
    mockGenerate.mockClear();
});

describe("BenchSheet", () => {
    it("prints the header: title, team, date and time range in the venue's zone, and the booking", () => {
        renderSheet();
        expect(screen.getByRole("heading", { level: 1, name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.getByText("Ice Hawks U12")).toBeInTheDocument();
        expect(screen.getByText("Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT")).toBeInTheDocument();
        expect(screen.getByText("Test Rink · Main · Half A")).toBeInTheDocument();
    });

    it("prints the timeline and one combined, de-duplicated legend on page 1", () => {
        renderSheet();
        expect(screen.getByRole("table", { name: "Session timeline" })).toBeInTheDocument();
        expect(screen.getByText("Planned 35 of 60 min")).toBeInTheDocument();
        const legend = screen.getByRole("region", { name: "Legend" });
        expect(within(legend).getAllByText("Pass")).toHaveLength(1);
    });

    it("starts drills on a new page and pairs them, two per page", () => {
        renderSheet();
        const region = screen.getByRole("region", { name: "Drills" });
        expect(region).toHaveClass("bench-page-break");
        const pages = region.querySelectorAll(".bench-page");
        expect(Array.from(pages, (page) => page.querySelectorAll("article").length)).toEqual([2, 2, 1]);
        expect(region.querySelector(".bench-drill--page-end")).toBeNull();
    });

    it("leaves no partial trailing page for an even number of drills", () => {
        renderSheet({ ...SESSION, plays: SESSION.plays.slice(0, 4) });
        const pages = screen.getByRole("region", { name: "Drills" }).querySelectorAll(".bench-page");
        expect(Array.from(pages, (page) => page.querySelectorAll("article").length)).toEqual([2, 2]);
    });

    it("tags stations with the block's start and prints each drill's own minutes", () => {
        renderSheet();
        const [breakout, regroup, shooting] = drills();
        expect(within(breakout).getByText("Station 1 of 2")).toBeInTheDocument();
        expect(within(breakout).getByText("6:00 PM MDT · 15 min")).toBeInTheDocument();
        expect(within(regroup).getByText("Station 2 of 2")).toBeInTheDocument();
        expect(within(regroup).getByText("6:00 PM MDT · 10 min")).toBeInTheDocument();
        expect(within(shooting).queryByText(/^Station /)).not.toBeInTheDocument();
        expect(within(shooting).getByText("6:15 PM MDT · 10 min")).toBeInTheDocument();
    });

    it("prints instructions, else the description, and nothing for a drill with neither", () => {
        renderSheet();
        const [breakout, regroup, shooting, , cooldown] = drills();
        expect(within(breakout).getByText("Hard first pass.")).toBeInTheDocument();
        expect(within(regroup).getByText("Neutral-zone regroup.")).toBeInTheDocument();
        expect(within(shooting).getByText("Quick release.")).toBeInTheDocument();
        expect(cooldown.querySelector(".bench-drill-text")).toBeNull();
    });

    it("has every readable diagram ready on first render, and a placeholder for an unreadable one", () => {
        renderSheet();
        const lost = drills()[3];
        expect(within(lost).getByText("Diagram unavailable")).toBeInTheDocument();
        expect(screen.getAllByRole("img", { name: /^Diagram: / })).toHaveLength(4);
        expect(mockGenerate).toHaveBeenCalledTimes(4);
        expect(mockGenerate).toHaveBeenCalledWith(expect.anything(), { width: 720, height: 306, pixelRatio: 3 });
    });

    it("prints the header and No drills planned for an empty session", () => {
        renderSheet({ ...SESSION, plays: [] });
        expect(screen.getByRole("heading", { level: 1, name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.getByText("No drills planned")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(drills()).toHaveLength(0);
    });

    it("falls back to the viewer's zone with no suffix for a venue zone Intl rejects", () => {
        renderSheet({ ...SESSION, venueTimezone: "Not/AZone" });
        const firstCell = within(screen.getByRole("table", { name: "Session timeline" })).getAllByRole("cell")[0];
        expect(firstCell.textContent).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    });

    it("lowers the diagram pixel ratio for a large session", () => {
        const plays = Array.from({ length: 13 }, (_, i) => sessionPlay(`Drill${i}`, i, false, 1));
        renderSheet({ ...SESSION, duration: 60, plays });
        expect(mockGenerate).toHaveBeenCalledTimes(13);
        expect(mockGenerate).toHaveBeenCalledWith(expect.anything(), { width: 720, height: 306, pixelRatio: 2 });
    });

    it("holds Print until every diagram has loaded", () => {
        const print = vi.spyOn(window, "print").mockImplementation(() => {});
        renderSheet();
        const button = screen.getByRole("button", { name: "Print" });
        expect(button).toBeDisabled();
        expect(screen.getByText("Preparing diagrams…")).toBeInTheDocument();
        const images = screen.getAllByRole("img", { name: /^Diagram: / });
        images.slice(0, -1).forEach((img) => fireEvent.load(img));
        expect(button).toBeDisabled();
        fireEvent.load(images[images.length - 1]);
        expect(button).toBeEnabled();
        expect(screen.queryByText("Preparing diagrams…")).not.toBeInTheDocument();
        fireEvent.click(button);
        expect(print).toHaveBeenCalledTimes(1);
    });

    it("enables Print at once when no drill has a readable diagram", () => {
        renderSheet({ ...SESSION, plays: [sessionPlay("Lost", 0, false, 5, { playData: null })] });
        expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    });

    it("enables Print for an empty session", () => {
        renderSheet({ ...SESSION, plays: [] });
        expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    });

    it("prints on request only, and links back to the session", () => {
        const print = vi.spyOn(window, "print").mockImplementation(() => {});
        renderSheet();
        screen.getAllByRole("img", { name: /^Diagram: / }).forEach((img) => fireEvent.load(img));
        expect(print).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Print" }));
        expect(print).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("link", { name: "Back to session" })).toHaveAttribute(
            "href",
            "/practice-planner/csessionxxxxxxxxxxxxxxxxx",
        );
    });
});
