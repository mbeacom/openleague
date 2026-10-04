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
import {
    BLOCK_HAS_NO_DRILL_MESSAGE,
    BLOCK_LABEL_MESSAGE,
    DRILL_NEEDS_PLAY_MESSAGE,
    ROTATE_MINUTES_MESSAGE,
    TRANSITION_MINUTES_MESSAGE,
} from "@/lib/utils/session-rows";
import { BLOCK_ROW_FIELDS_ERROR, BLOCK_STATION_ERROR } from "@/lib/utils/session-timeline";

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

describe("practice timing fields (spec R2, R3)", () => {
    const CUID = "cjld2cjxh0000qzrmn831i7rn";
    const base = { title: "Practice", date: "2026-10-06T23:00:00.000Z", duration: 60, teamId: CUID };
    const drillRow = { playId: CUID, clientKey: "k1", sequence: 0, duration: 10, instructions: "" };
    const blockRow = { kind: "break", clientKey: "k2", sequence: 1, duration: 2, instructions: "", label: "Water" };
    const issues = (input: unknown) => {
        const result = practiceSessionPlayInputSchema.safeParse(input);
        return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };

    it("reads a row without a kind as a drill, leaving its timing undefined (unchanged)", () => {
        const parsed = practiceSessionPlayInputSchema.parse(drillRow);
        expect(parsed).toMatchObject({ kind: "drill", runsWithPrevious: false });
        expect(parsed.stays).toBeUndefined();
        expect(parsed.rotateEveryMinutes).toBeUndefined();
    });

    it("takes a block row with no play", () => {
        expect(practiceSessionPlayInputSchema.parse(blockRow)).toMatchObject({ kind: "break", label: "Water" });
    });

    it("rejects a drill without a play, and a block with one or with station fields", () => {
        expect(issues({ ...drillRow, playId: undefined })).toEqual([DRILL_NEEDS_PLAY_MESSAGE]);
        expect(issues({ ...blockRow, playId: CUID })).toEqual([BLOCK_HAS_NO_DRILL_MESSAGE]);
        // An empty play id on a block row is still a drill field it can't carry, not a malformed id.
        expect(issues({ ...blockRow, playId: "" })).toEqual([BLOCK_HAS_NO_DRILL_MESSAGE]);
        expect(issues({ ...drillRow, playId: "" })).toEqual([DRILL_NEEDS_PLAY_MESSAGE]);
        expect(issues({ ...blockRow, runsWithPrevious: true })).toEqual([BLOCK_STATION_ERROR]);
        expect(issues({ ...blockRow, stays: true })).toEqual([BLOCK_ROW_FIELDS_ERROR]);
        expect(issues({ ...blockRow, kind: "stretch" })).toHaveLength(1);
    });

    it("limits the label and the rotation, and lets null clear a rotation", () => {
        expect(issues({ ...blockRow, label: "x".repeat(61) })).toEqual([BLOCK_LABEL_MESSAGE]);
        for (const bad of [0, 31, 2.5]) expect(issues({ ...drillRow, rotateEveryMinutes: bad })).toEqual([ROTATE_MINUTES_MESSAGE]);
        expect(practiceSessionPlayInputSchema.parse({ ...drillRow, rotateEveryMinutes: null }).rotateEveryMinutes).toBeNull();
    });

    it("takes a gap of 0–5 minutes; absent means unchanged on update", () => {
        expect(createPracticeSessionSchema.parse({ ...base, transitionMinutes: 5 }).transitionMinutes).toBe(5);
        expect(updatePracticeSessionSchema.parse({ ...base, id: CUID }).transitionMinutes).toBeUndefined();
        for (const bad of [-1, 6, 1.5]) {
            const result = updatePracticeSessionSchema.safeParse({ ...base, id: CUID, transitionMinutes: bad });
            expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([TRANSITION_MINUTES_MESSAGE]);
        }
    });
});
