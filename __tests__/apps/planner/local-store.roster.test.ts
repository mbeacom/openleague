/** The practice roster in the static store (roster and suggestions spec R7, R11, R12), against both repos. */
import { describe, expect, it } from "vitest";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import type { StoredSession } from "@/apps/planner/src/store/records";
import type { LocalSessionSave } from "@/apps/planner/src/store/types";
import { serializePlan } from "@/lib/plan-document";
import type { ActionResult } from "@/lib/planner-store";
import { ROSTER_LIMIT_MESSAGE, ROSTER_NAME_LENGTH_MESSAGE, ROSTER_NO_TEAM_LINK_MESSAGE, ROSTER_NUMBER_MESSAGE, type PracticeRoster } from "@/lib/utils/practice-roster";

const ROSTER: PracticeRoster = {
    ageGroup: "u8",
    roles: ["S", "G"],
    players: [
        { key: "r1", name: "Alex", number: "7", role: "S" },
        { key: "r2", name: "", number: "", role: "S" },
        { key: "r3", name: "Pat", number: "30", role: "G" },
    ],
};

const READ_BACK: PracticeRoster = {
    ...ROSTER,
    players: ROSTER.players.map((player) => ({ ...player, playerId: null })),
};

function save(overrides: Partial<LocalSessionSave> = {}): LocalSessionSave {
    return { title: "Lakeview 8U", date: new Date("2026-10-08T17:00:00"), duration: 60, plays: [], ...overrides };
}

function data<T>(result: ActionResult<T>): T {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

describe.each(REPOS)("practice roster in the static store (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    it("stores a roster on create and returns it to the view and the editor", async () => {
        const { store } = await setup();
        const { id } = data(await store.createSession(save({ roster: ROSTER })));
        expect(data(await store.getSessionView(id)).roster).toEqual(READ_BACK);
        expect(data(await store.getSessionForEdit(id)).initialData.roster).toEqual(READ_BACK);
    });

    it("stores none when a create sends none", async () => {
        const { store } = await setup();
        const { id } = data(await store.createSession(save()));
        expect(data(await store.getSessionView(id)).roster).toBeNull();
    });

    it("keeps the roster when an update leaves it out, replaces it when sent, clears it on null", async () => {
        const { store } = await setup();
        const { id } = data(await store.createSession(save({ roster: ROSTER })));
        data(await store.updateSession(id, save({ title: "Renamed" })));
        expect(data(await store.getSessionView(id)).roster).toEqual(READ_BACK);

        const smaller: PracticeRoster = { ageGroup: "u12", roles: ["F", "D", "G"], players: [{ key: "r9", name: "Sam", number: "", role: "D" }] };
        data(await store.updateSession(id, save({ roster: smaller })));
        expect(data(await store.getSessionView(id)).roster).toEqual({ ...smaller, players: [{ ...smaller.players[0], playerId: null }] });

        data(await store.updateSession(id, save({ roster: null })));
        expect(data(await store.getSessionView(id)).roster).toBeNull();
    });

    it("reads a session stored before the roster as none", async () => {
        const { repo, clock, store } = await setup();
        const legacy: StoredSession = { id: "legacy", title: "Old", date: clock.now, duration: 60, rows: [], createdAt: clock.now, updatedAt: clock.now };
        await repo.write((tx) => tx.putSession(legacy));
        expect(data(await store.getSessionView("legacy")).roster).toBeNull();
        data(await store.updateSession("legacy", save()));
        expect(data(await store.getSessionView("legacy")).roster).toBeNull();
    });

    it("refuses what hosted refuses, in its words, and any team link", async () => {
        const { store } = await setup();
        const bad = (players: PracticeRoster["players"]) => store.createSession(save({ roster: { ...ROSTER, players } }));
        expect(await bad([{ key: "a", name: "x".repeat(41), number: "", role: "S" }])).toEqual({ success: false, error: ROSTER_NAME_LENGTH_MESSAGE });
        expect(await bad([{ key: "a", name: "", number: "1234", role: "S" }])).toEqual({ success: false, error: ROSTER_NUMBER_MESSAGE });
        expect(await bad(Array.from({ length: 41 }, (_, i) => ({ key: `k${i}`, name: "", number: "", role: "S" })))).toEqual({ success: false, error: ROSTER_LIMIT_MESSAGE });
        expect(await bad([{ key: "a", name: "", number: "", role: "S", playerId: "cplayerxxxxxxxxxxxxxxxxxx" }])).toEqual({ success: false, error: ROSTER_NO_TEAM_LINK_MESSAGE });
    });

    it("copies the roster to a duplicate with new player ids", async () => {
        const { store } = await setup();
        const { id } = data(await store.createSession(save({ roster: ROSTER })));
        const copy = data(await store.duplicatePracticeSession({ id, teamId: "local", date: new Date("2026-10-09T17:00:00") }));
        const roster = data(await store.getSessionView(copy.id)).roster;
        expect(roster?.players.map((p) => [p.name, p.number, p.role])).toEqual(ROSTER.players.map((p) => [p.name, p.number, p.role]));
        expect(roster?.players.some((p) => ROSTER.players.some((source) => source.key === p.key))).toBe(false);
    });

    it("imports a plan's roster as typed players, with names only when the file has them", async () => {
        const { store } = await setup();
        const input = { title: "Imported", durationMinutes: 60, date: null, startTime: null, roster: ROSTER, drills: [] };
        const withNames = serializePlan(input, "openleague-hosted", new Date(), { includeRosterNames: true });
        const withoutNames = serializePlan(input, "openleague-hosted", new Date());
        const one = data(await store.importPlan(withNames, { date: new Date("2026-10-08T17:00:00"), addToLibrary: false }));
        const two = data(await store.importPlan(withoutNames, { date: new Date("2026-10-08T17:00:00"), addToLibrary: false }));
        expect(data(await store.getSessionView(one.sessionId)).roster?.players.map((p) => [p.name, p.number, p.role])).toEqual([
            ["Alex", "7", "S"],
            ["", "", "S"],
            ["Pat", "30", "G"],
        ]);
        expect(data(await store.getSessionView(two.sessionId)).roster?.players.map((p) => [p.name, p.number, p.role])).toEqual([
            ["", "", "S"],
            ["", "", "S"],
            ["", "", "G"],
        ]);
    });
});
