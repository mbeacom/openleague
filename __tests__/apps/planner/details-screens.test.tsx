/** The static planner's drill details screen, a practice started from a drill, and the list's Edit link. */
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStore, renderScreen } from "./render-screen";
import { DrillDetailScreen } from "@/apps/planner/src/screens/DrillDetailScreen";
import { NewSessionFromDrillScreen } from "@/apps/planner/src/screens/NewSessionFromDrillScreen";
import { SessionListScreen } from "@/apps/planner/src/screens/SessionListScreen";
import { DRILL_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/screens/StatusScreens";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";
import { createEmptyPlayData } from "@/lib/utils/play-data";

afterEach(() => {
    window.location.hash = "";
});

async function libraryDrill(store: LocalPlannerStore, name = "Hilltop Breakout"): Promise<string> {
    const created = await store.createPlay({
        name,
        description: "Wheel behind the net.",
        playData: createEmptyPlayData(),
        focus: "team",
        goalies: "optional",
        ageGroups: ["u12"],
        isTemplate: true,
        teamId: LOCAL_TEAM_ID,
    });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

/** An unowned legacy play outside the library: no session, and not a template. */
async function legacyNonTemplate(repo: ReturnType<typeof memoryStore>["repo"]): Promise<string> {
    const at = new Date();
    await repo.write((tx) =>
        tx.putPlay({ id: "legacy", name: "Old Sketch", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: false, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at }),
    );
    return "legacy";
}

async function practiceWith(store: LocalPlannerStore, playId: string): Promise<string> {
    const created = await store.createSession({
        title: "Brookside Tuesday",
        date: new Date("2026-10-06T19:00:00"),
        duration: 60,
        plays: [{ playId, clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
    });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

describe("DrillDetailScreen", () => {
    it("shows the drill with the coach's actions and its practice count", async () => {
        const { store } = memoryStore();
        const id = await libraryDrill(store);
        await practiceWith(store, id);
        renderScreen(<DrillDetailScreen store={store} id={id} />, store);

        expect(await screen.findByRole("heading", { level: 1, name: "Hilltop Breakout" })).toBeInTheDocument();
        expect(screen.getByText("Wheel behind the net.")).toBeInTheDocument();
        expect(screen.getByText("12U")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `#/library/${id}/edit`);
        expect(screen.getByRole("link", { name: "Add to new practice" })).toHaveAttribute("href", `#/library/${id}/practice`);
        expect(await screen.findByText("Used in 1 practice")).toBeInTheDocument();
    });

    it("duplicates the drill on this device and opens the copy", async () => {
        const { store } = memoryStore();
        const id = await libraryDrill(store);
        renderScreen(<DrillDetailScreen store={store} id={id} />, store);
        fireEvent.click(await screen.findByRole("button", { name: "Duplicate" }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/library\/[^/]+$/));
        expect(window.location.hash).not.toBe(`#/library/${id}`);
        const listing = await store.getPlaysByTeam({ teamId: LOCAL_TEAM_ID, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(listing.success && listing.data.plays.map((p) => p.name).sort()).toEqual(["Hilltop Breakout", "Hilltop Breakout (copy)"]);
    });

    it("says when the drill isn't on this device", async () => {
        const { store } = memoryStore();
        renderScreen(<DrillDetailScreen store={store} id="missing" />, store);
        expect(await screen.findByText(DRILL_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });

    it("treats an unowned play that isn't a library template as not on this device", async () => {
        const { store, repo } = memoryStore();
        const id = await legacyNonTemplate(repo);
        renderScreen(<DrillDetailScreen store={store} id={id} />, store);
        expect(await screen.findByText(DRILL_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByRole("heading", { level: 1, name: "Old Sketch" })).toBeNull();
    });

    it("shows an unreadable diagram's message instead of an empty board", async () => {
        const { store, repo } = memoryStore();
        const at = new Date();
        await repo.write((tx) =>
            tx.putPlay({ id: "broken", name: "Broken", description: null, thumbnail: null, playData: { version: 99 }, isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at }),
        );
        renderScreen(<DrillDetailScreen store={store} id="broken" />, store);
        expect(await screen.findByRole("link", { name: /back to the drill library/i })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { level: 1, name: "Broken" })).toBeNull();
    });
});

describe("NewSessionFromDrillScreen", () => {
    it("starts a practice holding the drill and saves it with that drill", async () => {
        const { store } = memoryStore();
        const id = await libraryDrill(store);
        renderScreen(<NewSessionFromDrillScreen store={store} drillId={id} />, store);
        await screen.findByLabelText(/session title/i);
        expect(screen.getAllByText("Hilltop Breakout").length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Pinewood Thursday" } });
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+\/edit$/));
        const listed = await store.listSessions();
        expect(listed.success && listed.data.map((s) => [s.title, s.drillCount])).toEqual([["Pinewood Thursday", 1]]);
        expect(await store.countPlayUsage(id)).toEqual({ success: true, data: 1 });
    });

    it("says when the drill isn't on this device", async () => {
        const { store } = memoryStore();
        renderScreen(<NewSessionFromDrillScreen store={store} drillId="missing" />, store);
        expect(await screen.findByText(DRILL_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });

    it("rejects an unowned play that isn't a library template before showing an editor", async () => {
        const { store, repo } = memoryStore();
        const id = await legacyNonTemplate(repo);
        renderScreen(<NewSessionFromDrillScreen store={store} drillId={id} />, store);
        expect(await screen.findByText(DRILL_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByLabelText(/session title/i)).toBeNull();
    });
});

describe("SessionListScreen", () => {
    it("opens a practice's details from the card, with Edit as the secondary action", async () => {
        const { store } = memoryStore();
        const sessionId = await practiceWith(store, await libraryDrill(store));
        renderScreen(<SessionListScreen store={store} />, store);
        const title = await screen.findByRole("heading", { name: "Brookside Tuesday" });
        expect(title.closest("a")).toHaveAttribute("href", `#/sessions/${sessionId}`);
        expect(screen.getByRole("link", { name: "Edit Brookside Tuesday" })).toHaveAttribute("href", `#/sessions/${sessionId}/edit`);
    });
});
