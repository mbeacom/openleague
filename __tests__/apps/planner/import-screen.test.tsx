import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStore, renderScreen, wrapScreen } from "./render-screen";
import { ImportScreen, planStartDate } from "@/apps/planner/src/screens/ImportScreen";
import { PRIVACY_NOTE } from "@/apps/planner/src/config";
import { FILE_TOO_LARGE_MESSAGE, MAX_PLAN_FILE_BYTES, NOT_A_PLAN_MESSAGE, encodePlanLink, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

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
        expect(screen.getByText(PRIVACY_NOTE)).toBeInTheDocument();
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
});
