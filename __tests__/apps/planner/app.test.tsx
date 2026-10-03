import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act as rtlAct, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlannerApp } from "@/apps/planner/src/App";
import { NOT_SAVING_MESSAGE, STALE_TAB_MESSAGE } from "@/apps/planner/src/screens/AppShell";
import { createStaleSignal } from "@/apps/planner/src/store/open-store";
import { SESSION_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/store/sessions";
import { memoryStore } from "./render-screen";
import { encodePlanLink, serializePlan } from "@/lib/plan-document";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

async function savedSession(store: ReturnType<typeof memoryStore>["store"], title = "Tuesday Skills") {
    const created = await store.createSession({ title, date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

function app(store: ReturnType<typeof memoryStore>["store"], durable = true, stale = createStaleSignal()) {
    return <PlannerApp store={store} durable={durable} stale={stale} />;
}

describe("PlannerApp", () => {
    it("shows the empty practice list with both actions", async () => {
        const { store } = memoryStore();
        render(app(store));
        expect(await screen.findByText("Plan your first practice")).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /new practice/i })[0]).toHaveAttribute("href", "#/sessions/new");
        expect(screen.getAllByRole("link", { name: /import plan/i })[0]).toHaveAttribute("href", "#/import");
    });

    it("lists saved practices linking to their detail", async () => {
        const { store } = memoryStore();
        const id = await savedSession(store);
        render(app(store));
        const card = await screen.findByRole("link", { name: /tuesday skills/i });
        expect(card).toHaveAttribute("href", `#/sessions/${id}`);
    });

    it("keeps store identity across re-renders: one list load, one library load", async () => {
        const { store } = memoryStore();
        const stale = createStaleSignal();
        const list = vi.spyOn(store, "listSessions");
        const view = render(app(store, true, stale));
        await screen.findByText("Plan your first practice");
        view.rerender(app(store, true, stale));
        await screen.findByText("Plan your first practice");
        expect(list).toHaveBeenCalledTimes(1);

        const plays = vi.spyOn(store, "getPlaysByTeam");
        await rtlAct(async () => {
            window.location.hash = "#/library";
            window.dispatchEvent(new HashChangeEvent("hashchange"));
        });
        await screen.findByRole("heading", { name: "Drill library" });
        view.rerender(app(store, true, stale));
        await waitFor(() => expect(plays).toHaveBeenCalledTimes(1));
    });

    it("shows a session's detail without team sharing", async () => {
        const { store } = memoryStore();
        const id = await savedSession(store);
        window.location.hash = `#/sessions/${id}`;
        render(app(store));
        expect(await screen.findByRole("heading", { name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^share$/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Export plan" })).toBeInTheDocument();
    });

    it("says when a session isn't on this device", async () => {
        const { store } = memoryStore();
        window.location.hash = "#/sessions/missing";
        render(app(store));
        expect(await screen.findByText(SESSION_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });

    it("renders the bench sheet without the app chrome", async () => {
        const { store } = memoryStore();
        const id = await savedSession(store);
        window.location.hash = `#/sessions/${id}/print`;
        render(app(store));
        expect(await screen.findByRole("link", { name: /back to session/i })).toHaveAttribute("href", `#/sessions/${id}`);
        expect(screen.queryByText("OpenLeague Planner")).not.toBeInTheDocument();
    });

    it("shows the seeded starter drills in the library", async () => {
        const { store } = memoryStore();
        await store.seedStarterDrills();
        window.location.hash = "#/library";
        render(app(store));
        expect(await screen.findByText(STARTER_PLAYS[0].name)).toBeInTheDocument();
    });

    it("opens a #plan= link under StrictMode and lands on the new session", async () => {
        const { store } = memoryStore();
        const plan = serializePlan(
            {
                title: "Linked Practice",
                durationMinutes: 60,
                date: "2026-10-06",
                startTime: "19:00",
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Breakout", description: null, playData: createEmptyPlayData() }],
            },
            "openleague-hosted",
        );
        window.history.replaceState(null, "", `/#plan=${await encodePlanLink(plan)}`);
        render(<StrictMode>{app(store)}</StrictMode>);
        expect(await screen.findByText("Linked Practice")).toBeInTheDocument();
        expect(window.location.hash).toBe("#/import");
        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        expect(await screen.findByRole("heading", { name: "Linked Practice" })).toBeInTheDocument();
    });

    it("warns when the browser isn't letting the planner save", async () => {
        const { store } = memoryStore();
        render(app(store, false));
        expect(await screen.findByText(NOT_SAVING_MESSAGE)).toBeInTheDocument();
    });

    it("asks for a reload when another tab upgraded the planner", async () => {
        const { store } = memoryStore();
        const stale = createStaleSignal();
        render(app(store, true, stale));
        await screen.findByText("Plan your first practice");
        rtlAct(() => stale.markStale());
        expect(await screen.findByText(STALE_TAB_MESSAGE)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    });
});
