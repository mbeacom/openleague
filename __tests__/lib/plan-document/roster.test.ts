/** Practice roster in plan files (roster and suggestions spec R10, R11): additive, version 1. */
import { describe, expect, it } from "vitest";
import { encodePlanLink, parsePlan, planToEditorSession, readPlanLink, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { MAX_ROSTER_PLAYERS, ROSTER_LIMIT_MESSAGE, ROSTER_NAME_LENGTH_MESSAGE, ROSTER_NUMBER_MESSAGE, type PracticeRoster } from "@/lib/utils/practice-roster";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const NOW = new Date("2026-10-07T18:00:00.000Z");

const ROSTER: PracticeRoster = {
    ageGroup: "u8",
    roles: ["S", "G"],
    players: [
        { key: "k1", name: "Alex", number: "7", role: "S", playerId: "team-player-1" },
        { key: "k2", name: "", number: "", role: "S" },
        { key: "k3", name: "Pat", number: "", role: "G" },
    ],
};

function input(roster: PracticeRoster | null | undefined = ROSTER): PlanSessionInput {
    return {
        title: "Riverside 8U skills",
        durationMinutes: 60,
        date: "2026-10-08",
        startTime: "17:00",
        roster,
        drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Laps", description: null, playData: createEmptyPlayData() }],
    };
}

function rawPlan(roster: unknown) {
    const doc = JSON.parse(JSON.stringify(serializePlan(input(null), "openleague-static", NOW)));
    doc.session.roster = roster;
    return doc;
}

describe("serializePlan roster", () => {
    it("writes positions only by default: no names, numbers, keys or team links", () => {
        const doc = serializePlan(input(), "openleague-hosted", NOW);
        expect(doc.session.roster).toEqual({ ageGroup: "u8", roles: ["S", "G"], players: [{ role: "S" }, { role: "S" }, { role: "G" }] });
        const text = JSON.stringify(doc);
        expect(text).not.toContain("Alex");
        expect(text).not.toContain("Pat");
        expect(text).not.toContain("team-player-1");
        expect(text).not.toContain("k1");
    });

    it("writes names and numbers when asked, still never a team link", () => {
        const doc = serializePlan(input(), "openleague-hosted", NOW, { includeRosterNames: true });
        expect(doc.session.roster?.players).toEqual([{ role: "S", name: "Alex", number: "7" }, { role: "S" }, { role: "G", name: "Pat" }]);
        expect(JSON.stringify(doc)).not.toContain("team-player-1");
    });

    it("writes null when the practice has no roster", () => {
        expect(serializePlan(input(null), "openleague-static", NOW).session.roster).toBeNull();
        expect(serializePlan({ ...input(), roster: undefined }, "openleague-static", NOW).session.roster).toBeNull();
    });

    it("round-trips through parsePlan with and without names", () => {
        for (const includeRosterNames of [false, true]) {
            const doc = serializePlan(input(), "openleague-static", NOW, { includeRosterNames });
            const parsed = parsePlan(JSON.parse(JSON.stringify(doc)));
            expect(parsed.ok && parsed.plan).toEqual(doc);
        }
    });

    it("never puts names in a plan link built from the default serialization", async () => {
        const doc = serializePlan(input(), "openleague-static", NOW);
        const result = await readPlanLink(await encodePlanLink(doc));
        expect(result.ok && result.plan.session.roster?.players).toEqual([{ role: "S" }, { role: "S" }, { role: "G" }]);
    });
});

describe("parsePlan roster", () => {
    it("reads an older file with no roster as none", () => {
        const doc = rawPlan(undefined);
        delete doc.session.roster;
        const parsed = parsePlan(doc);
        expect(parsed.ok && parsed.plan.session.roster).toBeNull();
    });

    it("repairs an unknown age, positions and a player's position", () => {
        const parsed = parsePlan(rawPlan({ ageGroup: "u7", roles: ["G", "Wing", 3], players: [{ role: "Q", name: " Sam " }, { role: "wing" }, { role: "G", number: 30 }] }));
        expect(parsed.ok && parsed.plan.session.roster).toEqual({
            ageGroup: null,
            roles: ["Wing", "G"],
            players: [{ role: "Wing", name: "Sam" }, { role: "Wing" }, { role: "G", number: "30" }],
        });
    });

    it("reports a broken roster as a Roster issue", () => {
        const issues = (roster: unknown) => {
            const parsed = parsePlan(rawPlan(roster));
            return parsed.ok ? [] : parsed.error.issues;
        };
        expect(issues({ ageGroup: null, roles: [], players: "x" })).toEqual(["Roster: The roster's players must be a list"]);
        expect(issues({ ageGroup: null, roles: [], players: [{ role: "S", name: "x".repeat(41) }] })).toEqual([`Roster: ${ROSTER_NAME_LENGTH_MESSAGE}`]);
        expect(issues({ ageGroup: null, roles: [], players: [{ role: "S", number: "12a" }] })).toEqual([`Roster: ${ROSTER_NUMBER_MESSAGE}`]);
        expect(issues({ ageGroup: null, roles: [], players: Array.from({ length: MAX_ROSTER_PLAYERS + 1 }, () => ({ role: "S" })) })).toEqual([
            `Roster: ${ROSTER_LIMIT_MESSAGE}`,
        ]);
    });

    it("gives the editor typed players with fresh keys", () => {
        const doc = serializePlan(input(), "openleague-static", NOW, { includeRosterNames: true });
        expect(planToEditorSession(doc).roster).toEqual({
            ageGroup: "u8",
            roles: ["S", "G"],
            players: [
                { key: "plan-roster-0", name: "Alex", number: "7", role: "S", playerId: null },
                { key: "plan-roster-1", name: "", number: "", role: "S", playerId: null },
                { key: "plan-roster-2", name: "Pat", number: "", role: "G", playerId: null },
            ],
        });
    });
});
