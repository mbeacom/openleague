/** BenchSheet (3b): header, timeline, one legend, then drills paired into pages. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createHashPlatform, renderWithPlanner } from "@/__tests__/helpers/planner";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { DrillRow, PlayData } from "@/types/practice-planner";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AA==") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: mockGenerate }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    LegendSwatch: () => <span data-testid="swatch" />,
}));
vi.mock("@/lib/utils/canvas/crest-png", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/crest-png")>()),
    crestPng: () => "data:image/png;base64,CREST",
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
): DrillRow {
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
    renderWithPlanner(
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
        const plays = Array.from({ length: 25 }, (_, i) => sessionPlay(`Drill${i}`, i, false, 1));
        renderSheet({ ...SESSION, duration: 60, plays });
        expect(mockGenerate).toHaveBeenCalledTimes(25);
        expect(mockGenerate).toHaveBeenCalledWith(expect.anything(), { width: 720, height: 306, pixelRatio: 2 });
    });

    it("holds Print until every diagram has loaded", () => {
        const print = vi.spyOn(window, "print").mockImplementation(() => {});
        renderSheet();
        const button = screen.getByRole("button", { name: "Print" });
        expect(button).toBeDisabled();
        expect(screen.getByText("Preparing print…")).toBeInTheDocument();
        const images = screen.getAllByRole("img", { name: /^Diagram: / });
        images.slice(0, -1).forEach((img) => fireEvent.load(img));
        expect(button).toBeDisabled();
        fireEvent.load(images[images.length - 1]);
        expect(button).toBeEnabled();
        expect(screen.queryByText("Preparing print…")).not.toBeInTheDocument();
        fireEvent.click(button);
        expect(print).toHaveBeenCalledTimes(1);
    });

    it("enables Print once the other drills are ready when one image fails to decode", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        renderSheet();
        const button = screen.getByRole("button", { name: "Print" });
        const [broken, ...rest] = screen.getAllByRole("img", { name: /^Diagram: / });
        fireEvent.error(broken);
        expect(within(drills()[0]).getByText("Diagram unavailable")).toBeInTheDocument();
        expect(button).toBeDisabled();
        rest.forEach((img) => fireEvent.load(img));
        expect(button).toBeEnabled();
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

describe("BenchSheet chrome and place line", () => {
    it("marks the toolbar no-print so the Print and Back controls never reach paper", () => {
        renderSheet();
        const toolbar = screen.getByRole("button", { name: "Print" }).closest(".no-print");
        expect(toolbar).not.toBeNull();
        expect(within(toolbar as HTMLElement).getByRole("link", { name: /back to session/i })).toBeInTheDocument();
    });

    it("shows the place line as venue, surface and segment", () => {
        renderSheet();
        expect(screen.getByText("Test Rink · Main · Half A")).toBeInTheDocument();
    });

    it("omits the place line when the session has no venue", () => {
        renderSheet({ ...SESSION, venueId: null, venueName: null, surfaceId: null, surfaceName: null, segmentId: null, segmentName: null, segmentKind: null, startAt: null, venueTimezone: null });
        expect(screen.queryByText(/Test Rink|Main|Half A/)).toBeNull();
    });

});

describe("BenchSheet goalie markers", () => {
    it("prints optional-goalie drills without the goalie when 0 goalies attend", async () => {
        const goalieBoard: PlayData = {
            ...createEmptyPlayData(),
            players: [
                { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
                { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
            ],
        };
        mockGenerate.mockClear();
        renderSheet({
            ...SESSION,
            goaliesAttending: 0,
            plays: [{ ...sessionPlay("D-Zone", 0, false, 10, { playData: goalieBoard }), play: { id: "play-dz", name: "D-Zone", description: null, thumbnail: null, playData: goalieBoard, goalies: "optional" } }],
        });
        await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
        const drawnPlayers = (mockGenerate.mock.calls[0] as unknown as [PlayData])[0].players;
        expect(drawnPlayers.map((p) => p.role)).toEqual(["F"]);
    });
});

describe("BenchSheet: the team and its mark (practice logo spec R5)", () => {
    const renderSheet = (session: BenchSheetSession) =>
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <BenchSheet session={session} />
            </ThemeProvider>,
            { platform: createHashPlatform() },
        );

    it("prints no team line and no mark for a static device without a team", () => {
        renderSheet({ ...SESSION, teamName: "", teamMark: null });
        expect(screen.getByRole("heading", { level: 1, name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.queryByRole("img", { name: / logo$/ })).toBeNull();
    });

    it("prints the static device's team name and its Crest beside the title", () => {
        renderSheet({ ...SESSION, teamName: "Ice Hawks", teamMark: { id: "local", name: "Ice Hawks", logoUrl: null, color: "#9B1B30" } });
        expect(screen.getByText("Ice Hawks")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
    });

    it("prints a hosted team's logo beside the title", () => {
        const logoUrl = "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png";
        renderSheet({ ...SESSION, teamMark: { id: SESSION.teamId, name: SESSION.teamName, logoUrl, color: null } });
        expect(screen.getByRole("img", { name: `${SESSION.teamName} logo` })).toHaveAttribute("src", logoUrl);
    });
});

describe("BenchSheet: print waits for the team mark", () => {
    const renderSheet = (session: BenchSheetSession) =>
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <BenchSheet session={session} />
            </ThemeProvider>,
            { platform: createHashPlatform() },
        );
    const NO_DRILLS = { ...SESSION, plays: [] };

    it("enables Print only once a hosted logo has loaded", () => {
        const logoUrl = "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png";
        renderSheet({ ...NO_DRILLS, teamMark: { id: SESSION.teamId, name: SESSION.teamName, logoUrl, color: null } });
        const print = screen.getByRole("button", { name: "Print" });
        expect(print).toBeDisabled();
        fireEvent.load(screen.getByRole("img", { name: `${SESSION.teamName} logo` }));
        expect(print).toBeEnabled();
    });

    it("enables Print once the Crest stands in for a logo that failed", () => {
        const logoUrl = "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png";
        renderSheet({ ...NO_DRILLS, teamMark: { id: SESSION.teamId, name: SESSION.teamName, logoUrl, color: null } });
        fireEvent.error(screen.getByRole("img", { name: `${SESSION.teamName} logo` }));
        const print = screen.getByRole("button", { name: "Print" });
        expect(print).toBeDisabled();
        fireEvent.load(screen.getByRole("img", { name: `${SESSION.teamName} logo` }));
        expect(print).toBeEnabled();
    });

    it("doesn't wait for a mark when there is no team", () => {
        renderSheet({ ...NO_DRILLS, teamName: "", teamMark: null });
        expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    });
});

describe("BenchSheet: block rows", () => {
    const WITH_BLOCKS: BenchSheetSession = {
        ...SESSION,
        transitionMinutes: 1,
        plays: [
            { id: "row-w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false },
            sessionPlay("Breakout", 1, false, 15, { playData: withPass("d1") }),
            { id: "row-c", kind: "cooldown", label: null, sequence: 2, duration: 5, instructions: null, runsWithPrevious: false },
        ],
    };

    it("puts blocks on the timeline but gives only drills a page, numbered from 1", async () => {
        renderSheet(WITH_BLOCKS);
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(within(timeline).getByText(/Warm-up · Easy laps/)).toBeInTheDocument();
        expect(within(timeline).getByText("Cool-down")).toBeInTheDocument();
        expect(drills().map((article) => article.getAttribute("aria-label"))).toEqual(["Drill 1: Breakout"]);
    });

    it("prints the timeline for a practice with only blocks", () => {
        renderSheet({ ...WITH_BLOCKS, plays: [WITH_BLOCKS.plays[0]] });
        expect(screen.queryByText("No drills planned")).toBeNull();
        expect(screen.getByRole("table", { name: "Session timeline" })).toBeInTheDocument();
        expect(drills()).toHaveLength(0);
        expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    });
});

describe("BenchSheet: rotation and the gap", () => {
    it("says the gap in the header and prints the rotation grid on the timeline", () => {
        renderSheet({
            ...SESSION,
            transitionMinutes: 2,
            plays: [
                { ...sessionPlay("Goalie", 0, false, 10), stays: true, rotateEveryMinutes: 5 },
                { ...sessionPlay("Skate A", 1, true, 5), stays: false, rotateEveryMinutes: null },
                { ...sessionPlay("Skate B", 2, true, 5), stays: false, rotateEveryMinutes: null },
            ],
        });
        expect(screen.getByText("2 min between blocks")).toBeInTheDocument();
        expect(screen.getByRole("table", { name: /^Rotation grid/ })).toBeInTheDocument();
    });

    it("says nothing about a gap when there is none", () => {
        renderSheet();
        expect(screen.queryByText(/between blocks/)).toBeNull();
    });
});

describe("BenchSheet: practice staff (spec R9)", () => {
    it("prints the staff line in the header and who runs each timeline row", () => {
        const [breakout, regroup, shooting, lost, cooldown] = SESSION.plays;
        renderSheet({
            ...SESSION,
            staff: [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }],
            plays: [{ ...breakout, staff: ["s1", "s2"] }, regroup, shooting, { ...lost, staff: ["s2"] }, cooldown],
        });
        expect(screen.getByText("Staff: Coach Lee, Sam")).toBeInTheDocument();
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(timeline).toHaveTextContent("Breakout · 15 min · run by Coach Lee, Sam");
        expect(timeline).toHaveTextContent("Lost · run by Sam");
    });

    it("prints no staff line for a practice without staff", () => {
        renderSheet();
        expect(screen.queryByText(/^Staff:/)).toBeNull();
    });
});
