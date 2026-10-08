import { describe, expect, it } from "vitest";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import {
    DRILL_EQUIPMENT_LIMIT_MESSAGE,
    EQUIPMENT_COUNT_MESSAGE,
    EQUIPMENT_NAME_LENGTH_MESSAGE,
    EQUIPMENT_NAME_REQUIRED_MESSAGE,
    EQUIPMENT_NAME_TAKEN_MESSAGE,
    PRACTICE_EQUIPMENT_LIMIT_MESSAGE,
    addEquipmentItem,
    cleanEquipmentName,
    derivedEquipmentCounts,
    drillEquipment,
    equipmentKindFor,
    equipmentLabel,
    equipmentLine,
    equipmentNeedsSchema,
    normalizeEquipmentNeeds,
    practiceEquipmentError,
    readEquipmentNeeds,
    removeEquipmentItem,
    removedEquipmentKinds,
    restoreEquipmentKind,
    setEquipmentCount,
    withEquipmentNeeds,
    type DrillEquipmentItem,
} from "@/lib/utils/equipment-needs";
import type { EquipmentKind, EquipmentNeeds, PlayData } from "@/types/practice-planner";

function board(kinds: EquipmentKind[], needs?: EquipmentNeeds): PlayData {
    return {
        ...createEmptyPlayData(),
        equipment: kinds.map((kind, i) => ({ id: `e${i}`, kind, position: { x: 10 + i, y: 10 }, rotation: 0 })),
        ...(needs ? { equipmentNeeds: needs } : {}),
    };
}

const counts = (items: DrillEquipmentItem[]) => items.map((item) => [item.name, item.count]);

describe("equipment vocabulary", () => {
    it("resolves a kind's singular or plural label, ignoring case and spacing", () => {
        expect(equipmentKindFor("cone")).toBe("cone");
        expect(equipmentKindFor("  CONES ")).toBe("cone");
        expect(equipmentKindFor("Puck piles")).toBe("puckPile");
        expect(equipmentKindFor("puck   pile")).toBe("puckPile");
        expect(equipmentKindFor("Pucks")).toBe("puck");
        expect(equipmentKindFor("pylon")).toBe("pylon");
        expect(equipmentKindFor("Tires")).toBe("tire");
        expect(equipmentKindFor("Nets")).toBe("net");
        expect(equipmentKindFor("Tennis balls")).toBeNull();
        expect(equipmentKindFor("")).toBeNull();
    });

    it("cleans a typed name onto one line", () => {
        expect(cleanEquipmentName("  Water\tbottles\n")).toBe("Water bottles");
        expect(cleanEquipmentName("Mark​er")).toBe("Marker");
    });

    it("labels a kind singular at 1 and plural otherwise; a typed item as typed", () => {
        expect(equipmentLabel({ kind: "net", name: "Nets" }, 1)).toBe("Net ×1");
        expect(equipmentLabel({ kind: "net", name: "Nets" }, 2)).toBe("Nets ×2");
        expect(equipmentLabel({ kind: "puckPile", name: "Puck piles" }, 1)).toBe("Puck pile ×1");
        expect(equipmentLabel({ kind: null, name: "Water bottles" }, 20)).toBe("Water bottles ×20");
    });

    it("joins a list into one line, or null when empty", () => {
        const items = drillEquipment(board(["cone", "cone", "net"]));
        expect(equipmentLine(items)).toBe("Cones ×2 · Net ×1");
        expect(equipmentLine([])).toBeNull();
    });
});

describe("derived counts", () => {
    it("counts the diagram's equipment by kind", () => {
        const derived = derivedEquipmentCounts(board(["cone", "cone", "net", "puck", "cone"]));
        expect(derived).toEqual({ puck: 1, puckPile: 0, cone: 3, net: 1, tire: 0, pylon: 0 });
    });

    it("lists a drill's items in kind order, with nothing to change", () => {
        const items = drillEquipment(board(["net", "cone", "cone", "puckPile"]));
        expect(counts(items)).toEqual([["Puck piles", 1], ["Cones", 2], ["Nets", 1]]);
        expect(items.every((item) => !item.changed)).toBe(true);
        expect(items[1]).toMatchObject({ key: "kind:cone", kind: "cone", derived: 2 });
    });

    it("lists nothing for an empty board or an unreadable diagram", () => {
        expect(drillEquipment(createEmptyPlayData())).toEqual([]);
        expect(drillEquipment(null)).toEqual([]);
    });
});

describe("overrides", () => {
    it("applies a delta relative to the diagram, so a diagram change still counts", () => {
        const needs: EquipmentNeeds = { kinds: [{ kind: "cone", delta: 2, removed: false }], custom: [] };
        expect(counts(drillEquipment(board(["cone", "cone", "cone", "cone"], needs)))).toEqual([["Cones", 6]]);
        // Two more cones drawn later: the coach's +2 still applies.
        expect(counts(drillEquipment(board(Array(6).fill("cone"), needs)))).toEqual([["Cones", 8]]);
        expect(drillEquipment(board(["cone"], needs))[0]).toMatchObject({ derived: 1, count: 3, changed: true });
    });

    it("keeps a removed kind removed however many the diagram gains", () => {
        const needs: EquipmentNeeds = { kinds: [{ kind: "net", delta: 0, removed: true }], custom: [] };
        expect(counts(drillEquipment(board(["net", "net", "cone"], needs)))).toEqual([["Cones", 1]]);
        expect(removedEquipmentKinds(board(["net", "net"], needs))).toEqual(["net"]);
        // Removed but no longer on the diagram: nothing to restore.
        expect(removedEquipmentKinds(board([], needs))).toEqual([]);
    });

    it("adds a kind the diagram lacks from 0, and clamps to 0–999", () => {
        const needs: EquipmentNeeds = {
            kinds: [
                { kind: "puck", delta: 30, removed: false },
                { kind: "cone", delta: -5, removed: false },
                { kind: "tire", delta: 999, removed: false },
            ],
            custom: [],
        };
        const items = drillEquipment(board(["cone", "cone", "tire"], needs));
        expect(counts(items)).toEqual([["Pucks", 30], ["Tires", 999]]);
    });

    it("lists typed items after the kinds, in their order", () => {
        const needs: EquipmentNeeds = { kinds: [], custom: [{ name: "Tennis balls", count: 12 }, { name: "Boards", count: 2 }] };
        const items = drillEquipment(board(["net"], needs));
        expect(counts(items)).toEqual([["Nets", 1], ["Tennis balls", 12], ["Boards", 2]]);
        expect(items[1]).toMatchObject({ key: "item:tennis balls", kind: null, derived: 0 });
    });
});

describe("normalizeEquipmentNeeds", () => {
    it("drops no-op entries and an empty result", () => {
        expect(normalizeEquipmentNeeds({ kinds: [{ kind: "cone", delta: 0, removed: false }], custom: [] })).toBeUndefined();
        expect(normalizeEquipmentNeeds(undefined)).toBeUndefined();
    });

    it("cleans typed names and folds a kind's name into that kind", () => {
        const needs = normalizeEquipmentNeeds({
            kinds: [{ kind: "cone", delta: 1, removed: false }],
            custom: [{ name: "  Cones ", count: 2 }, { name: " Tennis\nballs", count: 3 }],
        });
        expect(needs).toEqual({
            kinds: [{ kind: "cone", delta: 3, removed: false }],
            custom: [{ name: "Tennis balls", count: 3 }],
        });
    });

    it("merges repeated typed names ignoring case and orders kinds", () => {
        const needs = normalizeEquipmentNeeds({
            kinds: [{ kind: "net", delta: 0, removed: true }, { kind: "puck", delta: 5, removed: false }],
            custom: [{ name: "Marker", count: 1 }, { name: "marker", count: 2 }],
        });
        expect(needs).toEqual({
            kinds: [{ kind: "puck", delta: 5, removed: false }, { kind: "net", delta: 0, removed: true }],
            custom: [{ name: "Marker", count: 3 }],
        });
    });
});

describe("equipmentNeedsSchema and readEquipmentNeeds", () => {
    it("accepts a normalized value", () => {
        const needs: EquipmentNeeds = { kinds: [{ kind: "cone", delta: -1, removed: false }], custom: [{ name: "Boards", count: 2 }] };
        expect(equipmentNeedsSchema.safeParse(needs).success).toBe(true);
    });

    it("rejects out-of-range values, repeats and kind names among typed items", () => {
        const bad: unknown[] = [
            { kinds: [{ kind: "cone", delta: 1000, removed: false }], custom: [] },
            { kinds: [{ kind: "cone", delta: 1.5, removed: false }], custom: [] },
            { kinds: [{ kind: "bucket", delta: 1, removed: false }], custom: [] },
            { kinds: [{ kind: "cone", delta: 1, removed: false }, { kind: "cone", delta: 2, removed: false }], custom: [] },
            { kinds: [], custom: [{ name: "Boards", count: 0 }] },
            { kinds: [], custom: [{ name: "x".repeat(41), count: 1 }] },
            { kinds: [], custom: [{ name: "Boards", count: 1 }, { name: "boards", count: 1 }] },
            { kinds: [], custom: [{ name: "Cones", count: 1 }] },
            { kinds: [], custom: Array.from({ length: 13 }, (_, i) => ({ name: `Item ${i}`, count: 1 })) },
        ];
        for (const value of bad) expect(equipmentNeedsSchema.safeParse(value).success).toBe(false);
    });

    it("reads leniently: anything unreadable is no overrides", () => {
        expect(readEquipmentNeeds(undefined)).toBeUndefined();
        expect(readEquipmentNeeds("cones")).toBeUndefined();
        expect(readEquipmentNeeds({ kinds: [{ kind: "cone", delta: 2, removed: false }], custom: [] })).toEqual({
            kinds: [{ kind: "cone", delta: 2, removed: false }],
            custom: [],
        });
    });

    it("sets or removes the key on a diagram", () => {
        const data = board(["cone"]);
        const needs: EquipmentNeeds = { kinds: [], custom: [{ name: "Boards", count: 1 }] };
        expect(withEquipmentNeeds(data, needs).equipmentNeeds).toEqual(needs);
        const cleared = withEquipmentNeeds({ ...data, equipmentNeeds: needs }, { kinds: [], custom: [] });
        expect("equipmentNeeds" in cleared).toBe(false);
    });
});

describe("editor edits", () => {
    const four = board(["cone", "cone", "cone", "cone", "net"]);
    const derived = derivedEquipmentCounts(four);

    it("sets a kind's count as a change from the diagram", () => {
        const needs = setEquipmentCount(undefined, derived, "kind:cone", 6);
        expect(needs).toEqual({ kinds: [{ kind: "cone", delta: 2, removed: false }], custom: [] });
        // Back to the diagram's count: nothing stored.
        expect(setEquipmentCount(needs, derived, "kind:cone", 4)).toBeUndefined();
    });

    it("sets a typed item's count", () => {
        const start: EquipmentNeeds = { kinds: [], custom: [{ name: "Boards", count: 1 }] };
        expect(setEquipmentCount(start, derived, "item:boards", 3)).toEqual({ kinds: [], custom: [{ name: "Boards", count: 3 }] });
    });

    it("removes a diagram kind with a flag, and restores it", () => {
        const removed = removeEquipmentItem(undefined, derived, "kind:net");
        expect(removed).toEqual({ kinds: [{ kind: "net", delta: 0, removed: true }], custom: [] });
        expect(drillEquipment(withEquipmentNeeds(four, removed)).map((item) => item.name)).toEqual(["Cones"]);
        expect(restoreEquipmentKind(removed, "net")).toBeUndefined();
    });

    it("removes an added kind the diagram doesn't show by dropping its change", () => {
        const added = setEquipmentCount(undefined, derived, "kind:puck", 20);
        expect(removeEquipmentItem(added, derived, "kind:puck")).toBeUndefined();
    });

    it("removes a typed item", () => {
        const start: EquipmentNeeds = { kinds: [], custom: [{ name: "Boards", count: 1 }] };
        expect(removeEquipmentItem(start, derived, "item:boards")).toBeUndefined();
    });

    it("adds a typed item, or adds to a kind when the name is a kind's", () => {
        const typed = addEquipmentItem(undefined, derived, "Tennis balls", 12);
        expect(typed).toEqual({ ok: true, needs: { kinds: [], custom: [{ name: "Tennis balls", count: 12 }] } });
        const cones = addEquipmentItem(undefined, derived, "cones", 2);
        expect(cones).toEqual({ ok: true, needs: { kinds: [{ kind: "cone", delta: 2, removed: false }], custom: [] } });
        // Adding to a removed kind brings it back at the added count.
        const removed = removeEquipmentItem(undefined, derived, "kind:net");
        expect(addEquipmentItem(removed, derived, "Net", 2)).toEqual({ ok: true, needs: { kinds: [{ kind: "net", delta: 1, removed: false }], custom: [] } });
        // The same typed name again adds to it.
        const again = addEquipmentItem({ kinds: [], custom: [{ name: "Boards", count: 1 }] }, derived, "boards", 2);
        expect(again).toEqual({ ok: true, needs: { kinds: [], custom: [{ name: "Boards", count: 3 }] } });
    });

    it("refuses a bad name, count or a 13th typed item", () => {
        expect(addEquipmentItem(undefined, derived, "  ", 1)).toEqual({ ok: false, error: EQUIPMENT_NAME_REQUIRED_MESSAGE });
        expect(addEquipmentItem(undefined, derived, "x".repeat(41), 1)).toEqual({ ok: false, error: EQUIPMENT_NAME_LENGTH_MESSAGE });
        expect(addEquipmentItem(undefined, derived, "Boards", 0)).toEqual({ ok: false, error: EQUIPMENT_COUNT_MESSAGE });
        expect(addEquipmentItem(undefined, derived, "Boards", 1000)).toEqual({ ok: false, error: EQUIPMENT_COUNT_MESSAGE });
        const full: EquipmentNeeds = { kinds: [], custom: Array.from({ length: 12 }, (_, i) => ({ name: `Item ${i}`, count: 1 })) };
        expect(addEquipmentItem(full, derived, "One more", 1)).toEqual({ ok: false, error: DRILL_EQUIPMENT_LIMIT_MESSAGE });
    });
});

describe("practiceEquipmentError", () => {
    it("accepts a valid list, kind names included", () => {
        expect(practiceEquipmentError([{ name: "Water bottles", count: 20 }, { name: "Pucks", count: 30 }])).toBeNull();
        expect(practiceEquipmentError([])).toBeNull();
    });

    it("reports the first problem", () => {
        expect(practiceEquipmentError([{ name: " ", count: 1 }])).toBe(EQUIPMENT_NAME_REQUIRED_MESSAGE);
        expect(practiceEquipmentError([{ name: "x".repeat(41), count: 1 }])).toBe(EQUIPMENT_NAME_LENGTH_MESSAGE);
        expect(practiceEquipmentError([{ name: "Marker", count: 1.5 }])).toBe(EQUIPMENT_COUNT_MESSAGE);
        expect(practiceEquipmentError([{ name: "Marker", count: 1 }, { name: "MARKER", count: 2 }])).toBe(EQUIPMENT_NAME_TAKEN_MESSAGE);
        expect(practiceEquipmentError([{ name: "Cone", count: 1 }, { name: "cones", count: 2 }])).toBe(EQUIPMENT_NAME_TAKEN_MESSAGE);
        expect(practiceEquipmentError(Array.from({ length: 21 }, (_, i) => ({ name: `Item ${i}`, count: 1 })))).toBe(PRACTICE_EQUIPMENT_LIMIT_MESSAGE);
    });
});
