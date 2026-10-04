import { describe, expect, it } from "vitest";
import {
    BLOCK_DEFAULTS,
    BLOCK_KINDS,
    SESSION_ROW_KINDS,
    type BlockInSession,
    type PlayInSession,
    type SessionItem,
} from "@/types/practice-planner";
import {
    applyRowEdit,
    blockTitle,
    drillRows,
    isBlockKind,
    isBlockRow,
    isDrillRow,
    needsStoredTiming,
    newBlockItem,
    toBlockLabel,
    rotationColumnName,
    toDrillRowInput,
    toRotateEveryMinutes,
    toRowKind,
    toSessionRowInputs,
    toTransitionMinutes,
    withStoredTiming,
} from "@/lib/utils/session-rows";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const DRILL: PlayInSession = {
    id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 0, runsWithPrevious: false,
    duration: 10, instructions: "Hard", playData: createEmptyPlayData(),
};
const BLOCK: BlockInSession = { id: "k2", kind: "break", label: "", sequence: 1, duration: 2, instructions: "", runsWithPrevious: false };

describe("row kinds", () => {
    it("lists the five kinds, with a default label and minutes for each block kind", () => {
        expect(SESSION_ROW_KINDS).toEqual(["drill", "warmup", "break", "transition", "cooldown"]);
        expect(BLOCK_KINDS).toEqual(["warmup", "break", "transition", "cooldown"]);
        expect(BLOCK_DEFAULTS).toEqual({
            warmup: { label: "Warm-up", minutes: 8 },
            break: { label: "Water break", minutes: 2 },
            transition: { label: "Transition", minutes: 2 },
            cooldown: { label: "Cool-down", minutes: 5 },
        });
    });

    it("reads an unknown or missing kind as a drill", () => {
        for (const kind of SESSION_ROW_KINDS) expect(toRowKind(kind)).toBe(kind);
        expect([undefined, null, "stretch", 3].map(toRowKind)).toEqual(["drill", "drill", "drill", "drill"]);
        expect(BLOCK_KINDS.every(isBlockKind)).toBe(true);
        expect(["drill", undefined, "stretch"].some(isBlockKind)).toBe(false);
    });

    it("narrows rows: a row without a kind is a drill", () => {
        const rows: SessionItem[] = [DRILL, BLOCK, { ...DRILL, id: "k3", kind: "drill" }];
        expect(rows.filter(isDrillRow).map((row) => row.id)).toEqual(["k1", "k3"]);
        expect(rows.filter(isBlockRow).map((row) => row.id)).toEqual(["k2"]);
        expect(drillRows(rows).map((row) => row.playId)).toEqual([DRILL.playId, DRILL.playId]);
    });
});

describe("block text and lenient readers", () => {
    it("titles a block by its label, else its kind's default", () => {
        expect(blockTitle("break", "")).toBe("Water break");
        expect(blockTitle("break", null)).toBe("Water break");
        expect(blockTitle("break", "  Fill bottles  ")).toBe("Fill bottles");
    });

    it("reads labels, rotation and the gap leniently", () => {
        expect(toBlockLabel("  Stretch\u0007 ")).toBe("Stretch");
        expect(toBlockLabel("")).toBeNull();
        expect(toBlockLabel(7)).toBeNull();
        // A rotation grid's column: a drill's name, or a block's title.
        expect(rotationColumnName({ play: { name: "Skate A" } })).toBe("Skate A");
        expect(rotationColumnName({ kind: "drill", play: { name: "Goalie" } })).toBe("Goalie");
        expect(rotationColumnName({ kind: "break", label: null })).toBe("Water break");
        expect(toBlockLabel("x".repeat(70))).toHaveLength(60);
        // Never cut through an emoji: a pair that doesn't fit the 60 is dropped whole,
        // so the label still passes every 60-character check (they count UTF-16 units).
        expect(toBlockLabel(`${"x".repeat(59)}🏒🏒`)).toBe("x".repeat(59));
        expect(toBlockLabel(`${"x".repeat(58)}🏒`)).toBe(`${"x".repeat(58)}🏒`);
        expect([1, 30, 5].map(toRotateEveryMinutes)).toEqual([1, 30, 5]);
        expect([0, 31, 2.5, "5", null, undefined].map(toRotateEveryMinutes)).toEqual([null, null, null, null, null, null]);
        expect([0, 5, 3].map(toTransitionMinutes)).toEqual([0, 5, 3]);
        expect([-1, 6, 1.5, "2", null, undefined].map(toTransitionMinutes)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it("makes a new block with its kind's default minutes and an empty label", () => {
        expect(newBlockItem("warmup", 4, "block-1")).toEqual({
            id: "block-1", kind: "warmup", label: "", sequence: 4, duration: 8, instructions: "", runsWithPrevious: false,
        });
    });
});

describe("applyRowEdit", () => {
    it("changes only what the edit names, and a label only on a block", () => {
        expect(applyRowEdit(BLOCK, { label: "Water", duration: 3 })).toEqual({ ...BLOCK, label: "Water", duration: 3 });
        const drill = applyRowEdit(DRILL, { label: "ignored", instructions: "Soft" });
        expect(drill).toEqual({ ...DRILL, instructions: "Soft" });
        expect(drill).not.toHaveProperty("label");
    });
});

describe("row inputs", () => {
    it("sends a drill's timing only when the editor holds it (absent = unchanged)", () => {
        expect(toDrillRowInput(DRILL)).toEqual({
            kind: "drill", playId: DRILL.playId, clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "Hard",
        });
        expect(toDrillRowInput({ ...DRILL, stays: true, rotateEveryMinutes: null })).toMatchObject({ stays: true, rotateEveryMinutes: null });
    });

    it("sends a block with no drill fields, and an empty label as null", () => {
        expect(toSessionRowInputs([DRILL, BLOCK])[1]).toEqual({ kind: "break", clientKey: "k2", sequence: 1, duration: 2, instructions: "", label: null });
        expect(toSessionRowInputs([{ ...BLOCK, label: " Fill bottles " }])[0]).toMatchObject({ label: "Fill bottles" });
    });
});

describe("withStoredTiming", () => {
    const stored = [{ playId: "cowned", stays: true, rotateEveryMinutes: 5 }];

    it("keeps a stored drill's timing when the save omits it, and takes what is sent", () => {
        const rows = [
            { kind: "drill" as const, playId: "cowned" },
            { kind: "drill" as const, playId: "cowned", stays: false, rotateEveryMinutes: null },
            { kind: "drill" as const, playId: "clibrary" },
        ];
        expect(needsStoredTiming(rows)).toBe(true);
        expect(needsStoredTiming([rows[1]])).toBe(false);
        const [kept, sent, fresh] = withStoredTiming(rows, stored);
        expect([kept.stays, kept.rotateEveryMinutes]).toEqual([true, 5]);
        expect([sent.stays, sent.rotateEveryMinutes]).toEqual([false, null]);
        expect([fresh.stays, fresh.rotateEveryMinutes]).toEqual([false, null]);
    });

    it("gives a block row no timing and never asks for stored rows for it", () => {
        const rows = [{ kind: "warmup" as const }];
        expect(needsStoredTiming(rows)).toBe(false);
        const [block] = withStoredTiming(rows, stored);
        expect([block.stays, block.rotateEveryMinutes]).toEqual([false, null]);
    });

    it("keys stored timing by play id, which is unique per stored row (accepted invariant, Global Constraints)", () => {
        // 3a: a save gives every drill row its own copy (materializeSessionDrills and the static
        // materialize clone a repeated play), so a session never stores two rows on one play id.
        // Should two ever share one, the first stored row wins for both: key by row id then.
        const shared = [
            { playId: "cowned", stays: true, rotateEveryMinutes: 5 },
            { playId: "cowned", stays: false, rotateEveryMinutes: null },
        ];
        const [first, second] = withStoredTiming([{ kind: "drill" as const, playId: "cowned" }, { kind: "drill" as const, playId: "cowned" }], shared);
        expect([first.stays, first.rotateEveryMinutes, second.stays, second.rotateEveryMinutes]).toEqual([true, 5, true, 5]);
    });
});
