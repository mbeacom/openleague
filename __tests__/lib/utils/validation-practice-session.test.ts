import { describe, expect, it } from "vitest";
import {
    createPracticeSessionSchema,
    practiceSessionPlayInputSchema,
    updatePracticeSessionSchema,
} from "@/lib/utils/validation";

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
