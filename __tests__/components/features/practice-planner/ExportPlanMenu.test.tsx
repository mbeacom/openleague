/** Export plan (ADR-0020): download the plan file; optionally copy an "Open in planner" link. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
    ExportPlanMenu,
    buildPlanDocument,
    unreadableDiagramNotice,
    type ExportableSession,
} from "@/components/features/practice-planner/ExportPlanMenu";
import { LINK_TOO_LARGE_MESSAGE, decodePlanLink, parsePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { formatDateTimeLocalInput, resolveTimeZone } from "@/lib/utils/date";

const NOW = new Date("2026-10-03T18:00:00.000Z");

function sessionPlay(name: string, sequence: number, runsWithPrevious = false, readable = true) {
    return {
        sequence,
        duration: 10,
        runsWithPrevious,
        instructions: null,
        play: { name, description: null, playData: readable ? createEmptyPlayData() : null },
    };
}

const SESSION: ExportableSession = {
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    startAt: null,
    venueTimezone: null,
    plays: [sessionPlay("Breakout", 0), sessionPlay("Regroup", 1, true)],
};

const BOOKED: ExportableSession = {
    ...SESSION,
    venueTimezone: "America/Denver",
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on April 7
};

let clicks: Array<{ download: string; href: string }>;

beforeEach(() => {
    clicks = [];
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:plan");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push({ download: this.download, href: this.getAttribute("href") ?? "" });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
}

describe("buildPlanDocument", () => {
    it("formats a booked session's date and start in the venue's zone", () => {
        const doc = buildPlanDocument(BOOKED, NOW);
        expect([doc.session.date, doc.session.startTime]).toEqual(["2026-04-07", "18:00"]);
        expect(doc.generator).toBe("openleague-hosted");
        expect(doc.exportedAt).toBe(NOW.toISOString());
    });

    it("formats an unbooked session in the viewer's zone", () => {
        const [date, time] = formatDateTimeLocalInput(new Date(SESSION.date), resolveTimeZone(null)).split("T");
        const doc = buildPlanDocument(SESSION, NOW);
        expect([doc.session.date, doc.session.startTime]).toEqual([date, time]);
    });

    it("exports an unreadable diagram as an empty board and still parses", () => {
        const doc = buildPlanDocument({ ...SESSION, plays: [sessionPlay("Broken", 0, false, false)] }, NOW);
        expect(doc.session.drills[0].drill.playData).toEqual(createEmptyPlayData());
        expect(parsePlan(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    });
});

describe("unreadableDiagramNotice", () => {
    it.each([
        [0, null],
        [1, "1 drill had an unreadable diagram and was exported blank."],
        [3, "3 drills had unreadable diagrams and were exported blank."],
    ])("for %i", (count, expected) => {
        expect(unreadableDiagramNotice(count)).toBe(expected);
    });
});

describe("ExportPlanMenu", () => {
    it("downloads the plan as <slug>.olplan.json", () => {
        render(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));

        expect(clicks).toEqual([{ download: "tuesday-skills.olplan.json", href: "blob:plan" }]);
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe("application/json");
    });

    it("revokes the download's object URL only after a delay, so the browser can start the download", () => {
        vi.useFakeTimers();
        try {
            render(<ExportPlanMenu session={SESSION} />);
            openMenu();
            fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
            vi.advanceTimersByTime(999);
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:plan");
        } finally {
            vi.useRealTimers();
        }
    });

    it("warns when drills were exported blank", async () => {
        render(<ExportPlanMenu session={{ ...SESSION, plays: [sessionPlay("Broken", 0, false, false)] }} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        expect(await screen.findByText("1 drill had an unreadable diagram and was exported blank.")).toBeInTheDocument();
    });

    it("hides the link item when no static planner URL is configured", () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "");
        render(<ExportPlanMenu session={SESSION} />);
        openMenu();
        expect(screen.queryByRole("menuitem", { name: /open in planner/i })).not.toBeInTheDocument();
    });

    it("copies a planner link whose fragment decodes back to the plan", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

        render(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));

        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const link = writeText.mock.calls[0][0] as string;
        expect(link).toMatch(/^https:\/\/planner\.example\/app\/#plan=[A-Za-z0-9_-]+$/);
        const result = parsePlan(await decodePlanLink(link.split("#plan=")[1]));
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
        expect(await screen.findByText("Link copied. Paste it to open this plan in the planner.")).toBeInTheDocument();
    });

    it("says when the plan is too large for a link", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn() } });
        const big: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: 40 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1, instructions: "a".repeat(2000) })),
        };

        render(<ExportPlanMenu session={big} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));
        expect(await screen.findByText(LINK_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    });
});
