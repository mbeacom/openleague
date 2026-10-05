import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStore, renderScreen, wrapScreen } from "./render-screen";
import { ImportScreen, planStartDate } from "@/apps/planner/src/screens/ImportScreen";
import { PRIVACY_NOTE } from "@/apps/planner/src/config";
import { FILE_TOO_LARGE_MESSAGE, MAX_PLAN_FILE_BYTES, NOT_A_PLAN_MESSAGE, encodePlanLink, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { drillRows, toSessionRowInputs } from "@/lib/utils/session-rows";

// jsdom has no canvas; the preview's diagrams (a template's are not empty) draw as a stub.
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({
    generateThumbnail: vi.fn(() => "data:image/png;base64,AA=="),
}));

const INPUT: PlanSessionInput = {
    title: "Tuesday Skills",
    durationMinutes: 60,
    date: "2026-10-06",
    startTime: "19:00",
    drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Hard", name: "Breakout", description: null, playData: createEmptyPlayData() }],
};
const PLAN = serializePlan(INPUT, "openleague-hosted");

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

function chooseFile(file: File) {
    fireEvent.change(screen.getByTestId("plan-file-input"), { target: { files: [file] } });
}

describe("planStartDate", () => {
    it("combines the plan's local date and start in the browser's zone", () => {
        expect(planStartDate(PLAN)).toEqual(new Date(2026, 9, 6, 19, 0));
    });

    it("uses midnight without a start, and now without a date", () => {
        const now = new Date("2026-10-03T12:00:00");
        expect(planStartDate(serializePlan({ ...INPUT, startTime: null }, "openleague-hosted"), now)).toEqual(new Date(2026, 9, 6, 0, 0));
        expect(planStartDate(serializePlan({ ...INPUT, date: null, startTime: null }, "openleague-hosted"), now)).toBe(now);
    });
});

describe("ImportScreen", () => {
    it("imports a plan file and opens the new practice", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        // AppShell's footer carries the note; the screen doesn't repeat it.
        expect(screen.queryByText(PRIVACY_NOTE)).toBeNull();
        chooseFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json", { type: "application/json" }));
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: /also add these drills to my library/i }));
        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        const library = await store.getPlaysByTeam({ teamId: "local", isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(library.success && library.data.plays.map((p) => p.name)).toEqual(["Breakout"]);
    });

    it("shows the reason a file can't be imported", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        chooseFile(new File(["not json"], "notes.txt"));
        expect(await screen.findByText(NOT_A_PLAN_MESSAGE)).toBeInTheDocument();
        chooseFile(new File(["a".repeat(MAX_PLAN_FILE_BYTES + 1)], "big.json"));
        expect(await screen.findByText(FILE_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    });

    it("reads a #plan= link and takes the plan out of the address bar", async () => {
        const { store } = memoryStore();
        const value = await encodePlanLink(PLAN);
        window.history.replaceState(null, "", `/#plan=${value}`);
        renderScreen(<ImportScreen store={store} linkValue={value} />, store);
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        expect(window.location.hash).toBe("#/import");
    });

    it("shows a second link pasted into the open screen", async () => {
        const { store } = memoryStore();
        const first = await encodePlanLink(PLAN);
        const second = await encodePlanLink(serializePlan({ ...INPUT, title: "Thursday Skating" }, "openleague-hosted"));
        const view = renderScreen(<ImportScreen store={store} linkValue={first} />, store);
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        // The route flips to #/import: the screen keeps its plan.
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={null} />, store));
        expect(screen.getByText("Tuesday Skills")).toBeInTheDocument();
        // A new link pasted into the address bar replaces it.
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={second} />, store));
        expect(await screen.findByText("Thursday Skating")).toBeInTheDocument();
    });

    it("tells the hash route the link was replaced, so the router doesn't keep #plan=", async () => {
        const { store } = memoryStore();
        const value = await encodePlanLink(PLAN);
        window.history.replaceState(null, "", `/#plan=${value}`);
        const onHashChange = vi.fn(() => window.location.hash);
        window.addEventListener("hashchange", onHashChange);
        try {
            renderScreen(<ImportScreen store={store} linkValue={value} />, store);
            expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
            expect(onHashChange).toHaveReturnedWith("#/import");
        } finally {
            window.removeEventListener("hashchange", onHashChange);
        }
    });

    it("re-reads the same link pasted again after a file was chosen", async () => {
        const { store } = memoryStore();
        const value = await encodePlanLink(PLAN);
        window.history.replaceState(null, "", `/#plan=${value}`);
        const view = renderScreen(<ImportScreen store={store} linkValue={value} />, store);
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={null} />, store));
        chooseFile(new File([JSON.stringify(serializePlan({ ...INPUT, title: "From A File" }, "openleague-hosted"))], "file.olplan.json"));
        expect(await screen.findByText("From A File")).toBeInTheDocument();
        window.history.replaceState(null, "", `/#plan=${value}`);
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={value} />, store));
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        expect(window.location.hash).toBe("#/import");
    });

    it("keeps a link pasted while a chosen file is still being read", async () => {
        const { store } = memoryStore();
        const view = renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        let finishRead!: (text: string) => void;
        const slow = new File(["{}"], "slow.olplan.json", { type: "application/json" });
        Object.defineProperty(slow, "text", { value: () => new Promise<string>((resolve) => (finishRead = resolve)) });
        chooseFile(slow);

        const link = await encodePlanLink(serializePlan({ ...INPUT, title: "Thursday Skating" }, "openleague-hosted"));
        window.history.replaceState(null, "", `/#plan=${link}`);
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={link} />, store));
        expect(await screen.findByText("Thursday Skating")).toBeInTheDocument();

        await act(async () => finishRead(JSON.stringify(PLAN)));
        expect(screen.queryByText("Tuesday Skills")).toBeNull();
        expect(screen.getByText("Thursday Skating")).toBeInTheDocument();
    });

    it("says an undated plan will be dated now and can be changed in Edit", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        chooseFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json", { type: "application/json" }));
        await screen.findByText("Tuesday Skills");
        expect(screen.queryByText(/no date/i)).toBeNull();

        const undated = serializePlan({ ...INPUT, date: null, startTime: null }, "openleague-hosted");
        chooseFile(new File([JSON.stringify(undated)], "undated.olplan.json", { type: "application/json" }));
        expect(await screen.findByText(/this plan has no date.*change the date in edit/i)).toBeInTheDocument();
    });

    it("offers Start over, not a library copy, for a template, and dates it now", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        fireEvent.click(screen.getByRole("button", { name: "Use template: Skills Stations" }));
        await screen.findByText("Skills Stations");
        expect(screen.getByText(/this plan has no date.*change the date in edit/i)).toBeInTheDocument();
        expect(screen.queryByRole("checkbox", { name: /also add these drills/i })).toBeNull();
        expect(screen.queryByRole("button", { name: "Choose another file" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Start over" }));
        expect(screen.getByRole("heading", { name: "Start from a template" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Choose plan file" })).toBeInTheDocument();
    });

    it("saves a starter template as a practice in this browser", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        fireEvent.click(screen.getByRole("button", { name: "Use template: Goalie & Skater Rotation" }));
        expect(await screen.findByText("Goalie & Skater Rotation")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        const sessions = await store.listSessions();
        expect(sessions.success && sessions.data.map((s) => s.title)).toEqual(["Goalie & Skater Rotation"]);
    });

    it("stores fresh drills, so editing a practice made from a template never changes the starter drills", async () => {
        const before = structuredClone(STARTER_PLAYS);
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        fireEvent.click(screen.getByRole("button", { name: "Use template: Skills Stations" }));
        await screen.findByText("Skills Stations");
        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        const sessionId = window.location.hash.slice("#/sessions/".length);

        const edit = await store.getSessionForEdit(sessionId);
        expect(edit.success).toBe(true);
        if (!edit.success) return;
        const { initialData } = edit.data;
        for (const play of drillRows(initialData.plays)) {
            for (const starter of STARTER_PLAYS) expect(play.playData).not.toBe(starter.playData);
            // Edit every drill in place, as the board does, and store it.
            play.playData.players.length = 0;
            play.playData.annotations.push({ id: "note", text: "Edited", position: { x: 50, y: 40 }, fontSize: 14, color: "#000000" });
            const saved = await store.saveSessionDrill({ sessionId, teamId: "local", playId: play.playId, name: `${play.name} (edited)`, playData: play.playData });
            expect(saved).toMatchObject({ success: true });
        }
        // A template adds nothing to the library: its drills are already offered there as starters.
        const library = await store.getPlaysByTeam({ teamId: "local", isTemplate: true, page: 1, limit: 100, dateFilter: "all" });
        expect(library.success && library.data.total).toBe(0);
        const updated = await store.updateSession(sessionId, {
            title: "Edited",
            date: initialData.date,
            duration: initialData.duration,
            // The static store doesn't take block rows yet, so the update carries the drill rows.
            plays: toSessionRowInputs(initialData.plays).map((row) => ({ ...row, instructions: "Changed" })),
        });
        expect(updated.success).toBe(true);

        expect(STARTER_PLAYS).toEqual(before);
    });

    it("previews the plan with the device team's mark", async () => {
        const { store } = memoryStore();
        await store.saveTeamProfile({ name: "Ice Hawks", logo: null, primaryColor: "#00695C", secondaryColor: null });
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        chooseFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json", { type: "application/json" }));
        const title = await screen.findByRole("heading", { level: 2, name: "Tuesday Skills" });
        await waitFor(() => expect(title.parentElement?.textContent).toContain("IH"));
    });
});

