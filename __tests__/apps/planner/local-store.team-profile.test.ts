/** The static planner's "Your team" profile (practice logo spec R4), against both repos. */
import { describe, expect, it, vi } from "vitest";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { META_TEAM_PROFILE } from "@/apps/planner/src/store/records";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { serializePlan } from "@/lib/plan-document";
import { decodePlanLink, encodePlanLink } from "@/lib/plan-document/link";
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
        ["a blank name", { name: "  " }, TEAM_NAME_REQUIRED_MESSAGE],
        ["a 61-character name", { name: "x".repeat(61) }, TEAM_NAME_LENGTH_MESSAGE],
        ["a short hex primary colour", { primaryColor: "#123" }, TEAM_COLOR_MESSAGE],
        ["a named secondary colour", { secondaryColor: "red" }, TEAM_COLOR_MESSAGE],
        ["a JPEG logo", { logo: { dataUrl: "data:image/jpeg;base64,AAAA", width: 1, height: 1 } }, TEAM_LOGO_INVALID_MESSAGE],
        ["a logo wider than 512", { logo: { ...LOGO, width: 513 } }, TEAM_LOGO_INVALID_MESSAGE],
        ["a logo over 200 KB", { logo: { dataUrl: `data:image/png;base64,iVBORw0KGgo${"A".repeat(273_057)}`, width: 1, height: 1 } }, TEAM_LOGO_INVALID_MESSAGE],
    ] as Array<[string, Partial<TeamProfileInput>, string]>)("refuses %s with its message and stores nothing", async (_label, overrides, message) => {
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

    it("never writes any part of the profile into a plan file or a plan link", async () => {
        const { store } = await setup();
        data(await store.saveTeamProfile({ ...HAWKS, primaryColor: "#123ABC", secondaryColor: "#456DEF" }));
        const source = serializePlan(
            { title: "Thursday Skills", durationMinutes: 30, date: "2026-10-08", startTime: "18:00", drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Go", name: "Laps", description: null, playData: createEmptyPlayData() }] },
            "openleague-static",
        );
        const withDrill = data(await store.importPlan(source, { date: new Date("2026-10-08T18:00:00"), addToLibrary: false }));
        const view = data(await store.getSessionView(withDrill.sessionId));
        expect(view.plays).toHaveLength(1);
        expect(view.teamMark?.logoImage?.dataUrl).toBe(PNG);
        const plan = buildPlanDocument(view, new Date(), "openleague-static");
        const texts = [JSON.stringify(plan), JSON.stringify(await decodePlanLink(await encodePlanLink(plan)))];
        for (const text of texts) {
            expect(text).toContain("Thursday Skills");
            for (const leak of [PNG, "data:image/png", "Ice Hawks", "Hawks", "#123ABC", "#456DEF", "teamMark", "teamName", "logo"]) {
                expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
            }
        }
    });

    it("reports a committed save as saved even when a listener throws, and still tells the others", async () => {
        const { store } = await setup();
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const after = vi.fn();
        store.subscribeTeamProfile(() => {
            throw new Error("boom");
        });
        store.subscribeTeamProfile(after);
        expect((await store.saveTeamProfile(HAWKS)).success).toBe(true);
        expect((await store.clearTeamProfile()).success).toBe(true);
        expect(after).toHaveBeenCalledTimes(2);
        expect(store.teamProfileVersion()).toBe(2);
        expect(error).toHaveBeenCalledWith("A team profile listener failed:", "Error");
        error.mockRestore();
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
