import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStore, renderScreen } from "./render-screen";
import { SessionEditorScreen, toLocalSessionSave } from "@/apps/planner/src/screens/SessionEditorScreen";
import { DrillEditorScreen } from "@/apps/planner/src/screens/DrillEditorScreen";
import { DRILL_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/screens/StatusScreens";
import { SESSION_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/store/sessions";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import type { PracticeSessionSubmitData } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";

afterEach(() => {
    window.location.hash = "";
});

describe("toLocalSessionSave", () => {
    it("maps the editor's payload exactly as EditSessionWrapper does for hosted", () => {
        const date = new Date("2026-10-06T19:00:00");
        const submitted = {
            title: "Tuesday",
            date,
            duration: 60,
            goaliesAttending: 2,
            isShared: false,
            plays: [{ id: "k1", playId: "p1", name: "A", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData() }],
            overrideConflicts: false,
            overrideReason: "",
            notify: true,
        } as unknown as PracticeSessionSubmitData;
        expect(toLocalSessionSave(submitted)).toEqual({
            title: "Tuesday",
            date,
            duration: 60,
            goaliesAttending: 2,
            plays: [{ kind: "drill", playId: "p1", clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
        });
    });

    it("leaves the goalie count out when the editor sends none, so an update keeps the stored count", () => {
        const submitted = { title: "Tuesday", date: new Date("2026-10-06T19:00:00"), duration: 60, isShared: false, plays: [] } as unknown as PracticeSessionSubmitData;
        expect(toLocalSessionSave(submitted)).not.toHaveProperty("goaliesAttending");
        expect(toLocalSessionSave({ ...submitted, goaliesAttending: null })).toHaveProperty("goaliesAttending", null);
    });

    it("sends block rows and the gap, and leaves the gap out when the editor holds none", () => {
        const submitted = {
            title: "T", date: new Date("2026-10-06T19:00:00"), duration: 60, isShared: false, transitionMinutes: 2,
            plays: [{ id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "", runsWithPrevious: false }],
        } as unknown as PracticeSessionSubmitData;
        expect(toLocalSessionSave(submitted)).toMatchObject({ transitionMinutes: 2, plays: [{ kind: "warmup", clientKey: "kw", label: null }] });
        expect(toLocalSessionSave({ ...submitted, transitionMinutes: undefined })).not.toHaveProperty("transitionMinutes");
    });

    it("sends the staff list as keys and names, and leaves it out when the editor holds none", () => {
        const base = {
            title: "Tuesday", date: new Date("2026-10-06T19:00:00"), duration: 60, isShared: false, plays: [],
            overrideConflicts: false, overrideReason: "", notify: true,
        } as unknown as PracticeSessionSubmitData;
        expect(toLocalSessionSave({ ...base, staff: [{ id: "st1", name: "Sam" }] }).staff).toEqual([{ key: "st1", name: "Sam" }]);
        expect(toLocalSessionSave(base)).not.toHaveProperty("staff");
    });
});

describe("SessionEditorScreen", () => {
    it("creates a practice and continues on its edit page", async () => {
        const { store } = memoryStore();
        renderScreen(<SessionEditorScreen store={store} />, store);
        fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Tuesday Skills" } });
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+\/edit$/));
        const listed = await store.listSessions();
        expect(listed.success && listed.data.map((s) => s.title)).toEqual(["Tuesday Skills"]);
    });

    it("edits a saved practice without offering team sharing", async () => {
        const { store } = memoryStore();
        const lib = await store.createPlay({ name: "Breakout", playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID });
        if (!lib.success) throw new Error(lib.error);
        const created = await store.createSession({
            title: "Tuesday Skills",
            date: new Date("2026-10-06T19:00:00"),
            duration: 60,
            plays: [{ playId: lib.data.id, clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
        });
        if (!created.success) throw new Error(created.error);

        renderScreen(<SessionEditorScreen store={store} id={created.data.id} />, store);
        expect(await screen.findByDisplayValue("Tuesday Skills")).toBeInTheDocument();
        expect(screen.getAllByText("Breakout").length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: /share with team/i })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Renamed" } });
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        await waitFor(async () => {
            const view = await store.getSessionView(created.data.id);
            expect(view.success && view.data.title).toBe("Renamed");
        });
    });

    it("says when the practice isn't on this device", async () => {
        const { store } = memoryStore();
        renderScreen(<SessionEditorScreen store={store} id="missing" />, store);
        expect(await screen.findByText(SESSION_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });
});

describe("DrillEditorScreen", () => {
    it("creates a library drill and returns to the library", async () => {
        const { store } = memoryStore();
        renderScreen(<DrillEditorScreen store={store} />, store);
        fireEvent.change(screen.getByLabelText(/play name/i), { target: { value: "Breakout" } });
        fireEvent.click(screen.getByRole("button", { name: /^save play/i }));
        await waitFor(() => expect(window.location.hash).toBe("#/library"));
        const listing = await store.getPlaysByTeam({ teamId: LOCAL_TEAM_ID, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(listing.success && listing.data.plays.map((p) => p.name)).toEqual(["Breakout"]);
    });

    it("refuses to edit an unreadable diagram", async () => {
        const { store, repo } = memoryStore();
        const at = new Date();
        await repo.write((tx) =>
            tx.putPlay({ id: "broken", name: "Broken", description: null, thumbnail: null, playData: { version: 99 }, isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at }),
        );
        renderScreen(<DrillEditorScreen store={store} id="broken" />, store);
        expect(await screen.findByText(/Editing is disabled so the stored drawing isn't overwritten/)).toBeInTheDocument();
    });

    it("says when the drill isn't on this device", async () => {
        const { store } = memoryStore();
        renderScreen(<DrillEditorScreen store={store} id="missing" />, store);
        expect(await screen.findByText(DRILL_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });
});
