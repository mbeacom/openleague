import { describe, expect, it } from "vitest";
import {
    createPlaySchema,
    createPracticeSessionSchema,
    getPlaysByTeamSchema,
    practiceSessionPlayInputSchema,
    updatePlaySchema,
    updatePracticeSessionSchema,
} from "@/lib/utils/validation";
import { GOALIES_ATTENDING_MESSAGE } from "@/lib/utils/drill-tags";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const PLAY = "cplayxxxxxxxxxxxxxxxxxxxx";

function item(overrides: Record<string, unknown> = {}) {
    return { playId: PLAY, clientKey: "k1", sequence: 0, duration: 15, instructions: "", ...overrides };
}

const session = { title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 20, teamId: TEAM };

describe("practiceSessionPlayInputSchema (2b)", () => {
    it("defaults runsWithPrevious to false, so older clients keep sequential drills", () => {
        expect(practiceSessionPlayInputSchema.parse(item()).runsWithPrevious).toBe(false);
    });

    it("keeps an explicit station flag", () => {
        expect(practiceSessionPlayInputSchema.parse(item({ runsWithPrevious: true })).runsWithPrevious).toBe(true);
    });

    it("rejects a non-boolean flag", () => {
        expect(practiceSessionPlayInputSchema.safeParse(item({ runsWithPrevious: "yes" })).success).toBe(false);
    });

    it("is the play item of both the create and the update payloads", () => {
        const plays = [item(), item({ clientKey: "k2", sequence: 1, runsWithPrevious: true })];
        const created = createPracticeSessionSchema.parse({ ...session, plays });
        const updated = updatePracticeSessionSchema.parse({ ...session, id: SESSION, plays });
        expect(created.plays.map((play) => play.runsWithPrevious)).toEqual([false, true]);
        expect(updated.plays.map((play) => play.runsWithPrevious)).toEqual([false, true]);
    });
});

describe("goaltender fields", () => {
    const CUID = "cjld2cjxh0000qzrmn831i7rn";

    it("createPlaySchema defaults focus and goalies", () => {
        const parsed = createPlaySchema.parse({ name: "Drill", teamId: CUID, playData: createEmptyPlayData() });
        expect([parsed.focus, parsed.goalies]).toEqual(["team", "optional"]);
    });

    it("updatePlaySchema leaves omitted tags undefined, meaning unchanged", () => {
        const parsed = updatePlaySchema.parse({ id: CUID, name: "Drill", teamId: CUID, playData: createEmptyPlayData() });
        expect(parsed.focus).toBeUndefined();
        expect(parsed.goalies).toBeUndefined();
    });

    it("rejects unknown tag values", () => {
        expect(createPlaySchema.safeParse({ name: "D", teamId: CUID, playData: createEmptyPlayData(), focus: "keepers" }).success).toBe(false);
        expect(getPlaysByTeamSchema.safeParse({ teamId: CUID, goalies: "maybe" }).success).toBe(false);
    });

    it("accepts library filters", () => {
        expect(getPlaysByTeamSchema.parse({ teamId: CUID, focus: "goalies", goalies: "required" })).toMatchObject({ focus: "goalies", goalies: "required" });
    });

    it("accepts a goalie count of 0–10 or null, and leaves it undefined when omitted", () => {
        const base = { id: CUID, title: "Practice", date: "2026-10-06T23:00:00.000Z", duration: 60, teamId: CUID };
        expect(updatePracticeSessionSchema.parse({ ...base, goaliesAttending: 0 }).goaliesAttending).toBe(0);
        expect(updatePracticeSessionSchema.parse({ ...base, goaliesAttending: null }).goaliesAttending).toBeNull();
        expect(updatePracticeSessionSchema.parse(base).goaliesAttending).toBeUndefined();
        for (const bad of [-1, 11, 2.5]) {
            const result = updatePracticeSessionSchema.safeParse({ ...base, goaliesAttending: bad });
            expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([GOALIES_ATTENDING_MESSAGE]);
        }
    });
});
