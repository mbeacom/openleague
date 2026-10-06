/** Export plan (ADR-0020): download the plan file; optionally copy an "Open in planner" link. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
    ExportPlanMenu,
    OPENED_IN_HOSTED_NOTICE,
    buildPlanDocument,
    unreadableDiagramNotice,
    type ExportableSession,
} from "@/components/features/practice-planner/ExportPlanMenu";
import { LINK_TOO_LARGE_MESSAGE, MAX_PLAN_DRILLS, MAX_PLAN_FILE_BYTES, decodePlanLink, parsePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { drillRows } from "@/lib/utils/session-rows";
import { formatDateTimeLocalInput, resolveTimeZone } from "@/lib/utils/date";
import { createHashPlatform, renderWithPlanner } from "@/__tests__/helpers/planner";
import type { PlannerPlatform } from "@/lib/planner-store";

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
        expect(drillRows(doc.session.drills)[0].drill.playData).toEqual(createEmptyPlayData());
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
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));

        expect(clicks).toEqual([{ download: "tuesday-skills.olplan.json", href: "blob:plan" }]);
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe("application/json");
    });

    it("revokes the download's object URL only after a delay, so the browser can start the download", () => {
        vi.useFakeTimers();
        try {
            renderWithPlanner(<ExportPlanMenu session={SESSION} />);
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

    it("still downloads a plan that can't be imported as-is, and warns with its first problem", async () => {
        const tooMany: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: MAX_PLAN_DRILLS + 1 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1 })),
        };
        renderWithPlanner(<ExportPlanMenu session={tooMany} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));

        expect(clicks).toHaveLength(1);
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(
            `This file can't be imported as-is: A plan can hold at most ${MAX_PLAN_DRILLS} rows (drills and blocks)`,
        );
    });

    it("still downloads a file too large to import, and warns before the importer refuses it", async () => {
        const huge: ExportableSession = {
            ...SESSION,
            plays: [{ ...sessionPlay("Huge", 0), instructions: "a".repeat(MAX_PLAN_FILE_BYTES) }],
        };
        renderWithPlanner(<ExportPlanMenu session={huge} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));

        expect(clicks).toHaveLength(1);
        expect(await screen.findByRole("alert")).toHaveTextContent(
            `This file is too large to import (over ${MAX_PLAN_FILE_BYTES / 1000} KB).`,
        );
    });

    it("downloads a valid plan without an import warning", () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        expect(screen.queryByText(/can't be imported as-is/)).not.toBeInTheDocument();
    });

    it("warns when drills were exported blank", async () => {
        renderWithPlanner(<ExportPlanMenu session={{ ...SESSION, plays: [sessionPlay("Broken", 0, false, false)] }} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        expect(await screen.findByText("1 drill had an unreadable diagram and was exported blank.")).toBeInTheDocument();
    });

    it("hides the link item when no static planner URL is configured", () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "");
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        openMenu();
        expect(screen.queryByRole("menuitem", { name: /open in planner/i })).not.toBeInTheDocument();
    });

    it("copies a planner link whose fragment decodes back to the plan", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));

        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const link = writeText.mock.calls[0][0] as string;
        expect(link).toMatch(/^https:\/\/planner\.example\/app\/#plan=[A-Za-z0-9_-]+$/);
        const result = parsePlan(await decodePlanLink(link.split("#plan=")[1]));
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
        expect(await screen.findByText("Link copied. Paste it to open this plan in the planner.")).toBeInTheDocument();
    });

    it("doesn't copy a link to a plan that can't be imported, and warns instead", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        const tooMany: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: MAX_PLAN_DRILLS + 1 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1 })),
        };

        renderWithPlanner(<ExportPlanMenu session={tooMany} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            `This file can't be imported as-is: A plan can hold at most ${MAX_PLAN_DRILLS} rows (drills and blocks)`,
        );
        expect(writeText).not.toHaveBeenCalled();
    });

    it("says when the plan is too large for a link", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn() } });
        const big: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: 40 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1, instructions: "a".repeat(2000) })),
        };

        renderWithPlanner(<ExportPlanMenu session={big} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));
        expect(await screen.findByText(LINK_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    });
});

describe("ExportPlanMenu in the static planner", () => {
    const STATIC_PLATFORM: PlannerPlatform = {
        ...createHashPlatform(),
        planGenerator: "openleague-static",
        planLink: { label: "Open in OpenLeague", mode: "open", baseUrl: "https://openl.app/practice-planner/import" },
    };

    function fakeTab() {
        return { opener: {} as unknown, location: { replace: vi.fn() }, close: vi.fn() };
    }

    it("writes generator openleague-static into the downloaded file", async () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(JSON.parse(await blob.text()).generator).toBe("openleague-static");
    });

    it("opens the hosted import page in a tab opened inside the click", async () => {
        const tab = fakeTab();
        const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        renderWithPlanner(<ExportPlanMenu session={SESSION} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));

        // Synchronous: no await has run yet, so a popup blocker sees the click.
        expect(open).toHaveBeenCalledWith("", "_blank");
        expect(tab.opener).toBeNull();
        await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(1));
        const url = tab.location.replace.mock.calls[0][0] as string;
        expect(url).toMatch(/^https:\/\/openl\.app\/practice-planner\/import#plan=[A-Za-z0-9_-]+$/);
        const result = parsePlan(await decodePlanLink(url.split("#plan=")[1]));
        expect(result.ok && result.plan.generator).toBe("openleague-static");
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
        expect(await screen.findByText(OPENED_IN_HOSTED_NOTICE)).toBeInTheDocument();
    });

    it("closes the blank tab and says so when the plan is too large for a link", async () => {
        const tab = fakeTab();
        vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        const big: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: 40 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1, instructions: "a".repeat(2000) })),
        };
        renderWithPlanner(<ExportPlanMenu session={big} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));
        expect(await screen.findByText(LINK_TOO_LARGE_MESSAGE)).toBeInTheDocument();
        expect(tab.close).toHaveBeenCalled();
        expect(tab.location.replace).not.toHaveBeenCalled();
    });

    it("navigates this tab when the browser blocks the new one", async () => {
        vi.spyOn(window, "open").mockReturnValue(null);
        const platform = { ...STATIC_PLATFORM, navigate: vi.fn() };
        renderWithPlanner(<ExportPlanMenu session={SESSION} />, { platform });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));
        await waitFor(() => expect(platform.navigate).toHaveBeenCalledTimes(1));
        expect(platform.navigate.mock.calls[0][0]).toMatch(/^https:\/\/openl\.app\/practice-planner\/import#plan=/);
    });

    it("opens nothing for a plan the import page would refuse", async () => {
        const open = vi.spyOn(window, "open");
        const tooMany: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: MAX_PLAN_DRILLS + 1 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1 })),
        };
        renderWithPlanner(<ExportPlanMenu session={tooMany} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("This file can't be imported as-is");
        expect(open).not.toHaveBeenCalled();
    });
});

describe("buildPlanDocument: goaltender fields", () => {
    it("writes each drill's age groups, and [] for a drill without them", () => {
        const session: ExportableSession = {
            ...SESSION,
            plays: [
                { ...sessionPlay("Keep-Away", 0), play: { name: "Keep-Away", description: null, playData: createEmptyPlayData(), ageGroups: ["u8", "u6"] } },
                sessionPlay("Weave", 1),
            ],
        };
        expect(drillRows(buildPlanDocument(session, NOW).session.drills).map((d) => d.drill.ageGroups)).toEqual([["u6", "u8"], []]);
    });

    it("writes the count and drill tags, and keeps goalie markers even when none attend", () => {
        const goalieBoard = {
            ...createEmptyPlayData(),
            players: [{ id: "g", role: "G" as const, label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
        };
        const session: ExportableSession = {
            ...SESSION,
            goaliesAttending: 0,
            plays: [{ ...sessionPlay("Warm-up", 0), play: { name: "Warm-up", description: null, playData: goalieBoard, focus: "goalies", goalies: "optional" } }],
        };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.goaliesAttending).toBe(0);
        expect(drillRows(doc.session.drills)[0].drill).toMatchObject({ focus: "goalies", goalies: "optional" });
        expect(drillRows(doc.session.drills)[0].drill.playData.players.map((p) => p.role)).toEqual(["G"]);
    });
});

describe("buildPlanDocument: block rows, rotation and the gap", () => {
    it("writes every row in order, each drill's timing, and the gap", () => {
        const session: ExportableSession = {
            ...SESSION,
            transitionMinutes: 2,
            plays: [
                { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", runsWithPrevious: false, label: null },
                { ...sessionPlay("A", 1), rotateEveryMinutes: 5, stays: false },
                { ...sessionPlay("B", 2), runsWithPrevious: true, stays: false, rotateEveryMinutes: null },
            ],
        };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.transitionMinutes).toBe(2);
        expect(doc.session.drills.map((entry) => entry.kind)).toEqual(["warmup", "drill", "drill"]);
        expect(doc.session.drills[0]).toEqual({ kind: "warmup", sequence: 0, durationMinutes: 8, instructions: "Laps", label: null, staff: [] });
        expect(doc.session.drills[1]).toMatchObject({ rotateEveryMinutes: 5, stays: false });
    });
});

describe("buildPlanDocument: practice staff (spec R5, R6)", () => {
    it("writes the staff list and each row's staff as names: no ids, no links", () => {
        const session: ExportableSession = {
            ...SESSION,
            staff: [{ id: "s1", name: "Coach Lee", teamOfficialId: "cofficialxxxxxxxxxxxxxxxx" }, { id: "s2", name: "Sam" }],
            plays: [
                { kind: "warmup", sequence: 0, duration: 8, instructions: null, runsWithPrevious: false, label: null, staff: ["s2"] },
                { ...sessionPlay("A", 1), staff: ["s1", "s2", "gone"] },
            ],
        };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.staff).toEqual(["Coach Lee", "Sam"]);
        expect(doc.session.drills.map((entry) => entry.staff)).toEqual([["Sam"], ["Coach Lee", "Sam"]]);
        expect(JSON.stringify(doc)).not.toMatch(/cofficial|"s1"|"s2"/);
    });

    it("keeps the first 4 names of a row that lists more, so the file still opens", () => {
        const staff = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Coach ${i}` }));
        const session: ExportableSession = { ...SESSION, staff, plays: [{ ...sessionPlay("A", 0), staff: staff.map((member) => member.id) }] };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.drills[0].staff).toEqual(["Coach 0", "Coach 1", "Coach 2", "Coach 3"]);
        expect(parsePlan(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    });

    it("leaves off a row's person the list filtered out (a 13th person, an over-long name)", () => {
        const staff = [
            ...Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `Coach ${i}` })),
            { id: "s12", name: "Thirteenth" },
            { id: "long", name: "x".repeat(61) },
        ];
        const session: ExportableSession = {
            ...SESSION,
            staff,
            plays: [{ ...sessionPlay("A", 0), staff: ["s12", "s0"] }, { ...sessionPlay("B", 1), staff: ["long"] }],
        };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.staff).toHaveLength(12);
        expect(doc.session.staff).not.toContain("Thirteenth");
        expect(doc.session.drills.map((entry) => entry.staff)).toEqual([["Coach 0"], []]);
        expect(parsePlan(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    });

    it("writes empty lists for a session without staff", () => {
        const doc = buildPlanDocument(SESSION, NOW);
        expect(doc.session.staff).toEqual([]);
        expect(doc.session.drills.every((entry) => entry.staff.length === 0)).toBe(true);
    });
});
