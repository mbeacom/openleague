/** The static planner's "Your team" profile (practice logo spec R4), against both repos. */
import { describe, expect, it, vi } from "vitest";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { META_TEAM_PROFILE } from "@/apps/planner/src/store/records";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { serializePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import {
    TEAM_COLOR_MESSAGE,
    TEAM_LOGO_INVALID_MESSAGE,
    TEAM_NAME_LENGTH_MESSAGE,
    TEAM_NAME_REQUIRED_MESSAGE,
    type TeamProfileInput,
} from "@/lib/utils/team-mark";
import type { ActionResult } from "@/lib/planner-store";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const LOGO = { dataUrl: PNG, width: 1, height: 1 };
const HAWKS: TeamProfileInput = { name: " Ice\u0007  Hawks ", logo: LOGO, primaryColor: "#9b1b30", secondaryColor: null };

function data<T>(result: ActionResult<T>): T {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

describe.each(REPOS)("team profile (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        const store = createLocalPlannerStore(h.repo, h.options);
        const session = data(await store.createSession({ title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] }));
        return { ...h, store, sessionId: session.id };
    }

    it("has no profile on a device that never set one: no team name, no mark", async () => {
        const { store, sessionId } = await setup();
        expect(data(await store.getTeamProfile())).toBeNull();
        const view = data(await store.getSessionView(sessionId));
        expect([view.teamName, view.teamMark]).toEqual(["", null]);
        expect(store.teamProfileVersion()).toBe(0);
    });

    it("saves the cleaned profile, and every practice shows its name and mark", async () => {
        const { store, sessionId } = await setup();
        const saved = data(await store.saveTeamProfile(HAWKS));
        expect(saved).toEqual({ name: "Ice Hawks", logo: LOGO, primaryColor: "#9B1B30", secondaryColor: null });
        expect(data(await store.getTeamProfile())).toEqual(saved);
        const view = data(await store.getSessionView(sessionId));
        expect(view.teamName).toBe("Ice Hawks");
        expect(view.teamMark).toEqual({ id: LOCAL_TEAM_ID, name: "Ice Hawks", logoUrl: PNG, color: "#9B1B30", logoImage: LOGO });
    });

    it.each([
        [{ name: "  " }, TEAM_NAME_REQUIRED_MESSAGE],
        [{ name: "x".repeat(61) }, TEAM_NAME_LENGTH_MESSAGE],
        [{ primaryColor: "#123" }, TEAM_COLOR_MESSAGE],
        [{ secondaryColor: "red" }, TEAM_COLOR_MESSAGE],
        [{ logo: { dataUrl: "data:image/jpeg;base64,AAAA", width: 1, height: 1 } }, TEAM_LOGO_INVALID_MESSAGE],
        [{ logo: { ...LOGO, width: 513 } }, TEAM_LOGO_INVALID_MESSAGE],
        [{ logo: { dataUrl: `data:image/png;base64,${"A".repeat(273_068)}`, width: 1, height: 1 } }, TEAM_LOGO_INVALID_MESSAGE],
    ] as Array<[Partial<TeamProfileInput>, string]>)("refuses %o with its message and stores nothing", async (overrides, message) => {
        const { store } = await setup();
        expect(await store.saveTeamProfile({ ...HAWKS, ...overrides })).toEqual({ success: false, error: message });
        expect(data(await store.getTeamProfile())).toBeNull();
        expect(store.teamProfileVersion()).toBe(0);
    });

    it("clears the profile, and practices go back to no team", async () => {
        const { store, sessionId } = await setup();
        data(await store.saveTeamProfile(HAWKS));
        expect(data(await store.clearTeamProfile())).toBeNull();
        expect(data(await store.getTeamProfile())).toBeNull();
        expect(data(await store.getSessionView(sessionId)).teamMark).toBeNull();
    });

    it("reads a damaged record leniently: a bad logo drops, a bad name is no profile", async () => {
        const { store, repo } = await setup();
        await repo.write((tx) => tx.putMeta(META_TEAM_PROFILE, { name: "Ice Hawks", logo: { dataUrl: "javascript:x", width: 1, height: 1 }, primaryColor: "#00695C" }));
        expect(data(await store.getTeamProfile())).toEqual({ name: "Ice Hawks", logo: null, primaryColor: "#00695C", secondaryColor: null });
        await repo.write((tx) => tx.putMeta(META_TEAM_PROFILE, { name: 42 }));
        expect(data(await store.getTeamProfile())).toBeNull();
    });

    it("tells subscribers after each save and clear, never after a refusal", async () => {
        const { store } = await setup();
        const listener = vi.fn();
        const unsubscribe = store.subscribeTeamProfile(listener);
        data(await store.saveTeamProfile(HAWKS));
        await store.saveTeamProfile({ ...HAWKS, name: "" });
        data(await store.clearTeamProfile());
        expect(listener).toHaveBeenCalledTimes(2);
        expect(store.teamProfileVersion()).toBe(2);
        unsubscribe();
        data(await store.saveTeamProfile(HAWKS));
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("keeps the profile out of plan files, and an import never changes it", async () => {
        const { store, sessionId } = await setup();
        const saved = data(await store.saveTeamProfile(HAWKS));
        const text = JSON.stringify(buildPlanDocument(data(await store.getSessionView(sessionId)), new Date(), "openleague-static"));
        expect(text).not.toContain(PNG);
        expect(text).not.toContain("Ice Hawks");
        const plan = serializePlan(
            { title: "Imported", durationMinutes: 30, date: "2026-10-08", startTime: "18:00", drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Laps", description: null, playData: createEmptyPlayData() }] },
            "openleague-hosted",
        );
        data(await store.importPlan(plan, { date: new Date("2026-10-08T18:00:00"), addToLibrary: false }));
        expect(data(await store.getTeamProfile())).toEqual(saved);
    });
});
