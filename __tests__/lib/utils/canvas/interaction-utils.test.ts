/**
 * Unit tests for canvas interaction utilities
 *
 * Tests coverage:
 * - HistoryManager undo/redo
 * - Hit detection for players, drawings, annotations
 * - Bounds checking and clamping
 */

import { describe, it, expect } from "vitest";
import {
  HistoryManager,
  hitTestPlayer,
  hitTestDrawing,
  hitTestAnnotation,
  hitTest,
  isWithinRinkBounds,
  clampToRinkBounds,
  clampToRect,
  dragTarget,
} from "@/lib/utils/canvas/interaction-utils";
import { strokeFromV1Type, createEmptyPlayData } from "@/lib/utils/play-data";
import { areaRect } from "@/lib/utils/ice-area";
import { FULL_RINK } from "@/lib/utils/canvas/rink-renderer";
import type { PlayData, PlayerIcon, DrawingElement, TextAnnotation } from "@/types/practice-planner";

const emptyPlayData: PlayData = { version: 2, players: [], drawings: [], equipment: [], annotations: [] };

describe("HistoryManager", () => {
  it("starts empty with no undo/redo available", () => {
    const history = new HistoryManager();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getCurrentState()).toBeNull();
  });

  it("can push and retrieve state", () => {
    const history = new HistoryManager();
    const state: PlayData = {
      version: 2,
      equipment: [],
      players: [{ id: "p1", position: { x: 50, y: 50 }, role: "X", label: "C", color: "#FF0000" }],
      drawings: [],
      annotations: [],
    };

    history.push(state);
    expect(history.getCurrentState()).toEqual(state);
  });

  it("supports undo", () => {
    const history = new HistoryManager();
    const state1: PlayData = { ...emptyPlayData, players: [{ id: "p1", position: { x: 10, y: 10 }, role: "X", label: "A", color: "#F00" }] };
    const state2: PlayData = { ...emptyPlayData, players: [{ id: "p2", position: { x: 20, y: 20 }, role: "X", label: "B", color: "#0F0" }] };

    history.push(state1);
    history.push(state2);

    expect(history.canUndo()).toBe(true);
    const undone = history.undo();
    expect(undone).toEqual(state1);
  });

  it("supports redo after undo", () => {
    const history = new HistoryManager();
    const state1: PlayData = { ...emptyPlayData };
    const state2: PlayData = { ...emptyPlayData, players: [{ id: "p1", position: { x: 0, y: 0 }, role: "X", label: "X", color: "#000" }] };

    history.push(state1);
    history.push(state2);
    history.undo();

    expect(history.canRedo()).toBe(true);
    const redone = history.redo();
    expect(redone).toEqual(state2);
  });

  it("clears redo stack when new state is pushed after undo", () => {
    const history = new HistoryManager();
    const state1: PlayData = { ...emptyPlayData };
    const state2: PlayData = { ...emptyPlayData, players: [{ id: "p1", position: { x: 0, y: 0 }, role: "X", label: "A", color: "#000" }] };
    const state3: PlayData = { ...emptyPlayData, players: [{ id: "p2", position: { x: 5, y: 5 }, role: "X", label: "B", color: "#FFF" }] };

    history.push(state1);
    history.push(state2);
    history.undo();
    history.push(state3);

    expect(history.canRedo()).toBe(false);
    expect(history.getCurrentState()).toEqual(state3);
  });

  it("clear resets the history", () => {
    const history = new HistoryManager();
    history.push(emptyPlayData);
    history.push(emptyPlayData);
    history.clear();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getCurrentState()).toBeNull();
  });

  it("undo returns null when at beginning of history", () => {
    const history = new HistoryManager();
    history.push(emptyPlayData);
    expect(history.undo()).toBeNull();
  });

  it("redo returns null when at end of history", () => {
    const history = new HistoryManager();
    history.push(emptyPlayData);
    expect(history.redo()).toBeNull();
  });
});

describe("hitTestPlayer", () => {
  const player: PlayerIcon = {
    id: "p1",
    position: { x: 100, y: 50 },
    role: "X",
    label: "C",
    color: "#FF0000",
  };

  it("returns true when point is on the player", () => {
    expect(hitTestPlayer({ x: 100, y: 50 }, player)).toBe(true);
  });

  it("returns true when point is within hit radius", () => {
    expect(hitTestPlayer({ x: 105, y: 50 }, player)).toBe(true);
  });

  it("uses the 6 ft player radius", () => {
    expect(hitTestPlayer({ x: 105.9, y: 50 }, player)).toBe(true);
    expect(hitTestPlayer({ x: 106.5, y: 50 }, player)).toBe(false);
  });

  it("returns false when point is far from player", () => {
    expect(hitTestPlayer({ x: 200, y: 200 }, player)).toBe(false);
  });
});

describe("hitTestDrawing", () => {
  const drawing: DrawingElement = {
    id: "d1",
    ...strokeFromV1Type("line"),
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    color: "#0000FF",
    strokeWidth: 2,
  };

  it("returns true when point is on the line", () => {
    expect(hitTestDrawing({ x: 50, y: 0 }, drawing)).toBe(true);
  });

  it("returns true when point is close to the line", () => {
    expect(hitTestDrawing({ x: 50, y: 3 }, drawing)).toBe(true);
  });

  it("returns false when point is far from the line", () => {
    expect(hitTestDrawing({ x: 50, y: 50 }, drawing)).toBe(false);
  });
});

describe("hitTestAnnotation", () => {
  const annotation: TextAnnotation = {
    id: "t1",
    text: "Test",
    position: { x: 100, y: 50 },
    fontSize: 14,
    color: "#000000",
  };

  it("returns true when point is on the annotation", () => {
    expect(hitTestAnnotation({ x: 100, y: 50 }, annotation)).toBe(true);
  });

  it("returns false when point is far from annotation", () => {
    expect(hitTestAnnotation({ x: 300, y: 300 }, annotation)).toBe(false);
  });
});

describe("hitTest", () => {
  it("returns no hit when nothing is hit", () => {
    const result = hitTest({ x: 500, y: 500 }, emptyPlayData);
    expect(result.hit).toBe(false);
    expect(result.elementId).toBeUndefined();
  });

  it("detects player hits", () => {
    const playData: PlayData = {
      version: 2,
      equipment: [],
      players: [{ id: "p1", position: { x: 50, y: 50 }, role: "X", label: "C", color: "#F00" }],
      drawings: [],
      annotations: [],
    };
    const result = hitTest({ x: 50, y: 50 }, playData);
    expect(result.hit).toBe(true);
    expect(result.elementType).toBe("player");
    expect(result.elementId).toBe("p1");
  });
});

describe("isWithinRinkBounds", () => {
  it("returns true for position inside rink", () => {
    expect(isWithinRinkBounds({ x: 100, y: 42.5 })).toBe(true);
  });

  it("returns false for position outside rink (x)", () => {
    expect(isWithinRinkBounds({ x: 250, y: 42.5 })).toBe(false);
  });

  it("returns false for position outside rink (y)", () => {
    expect(isWithinRinkBounds({ x: 100, y: 100 })).toBe(false);
  });

  it("returns false for negative coordinates", () => {
    expect(isWithinRinkBounds({ x: -5, y: 42.5 })).toBe(false);
  });

  it("returns true for position at rink boundary", () => {
    expect(isWithinRinkBounds({ x: 0, y: 0 })).toBe(true);
    expect(isWithinRinkBounds({ x: 200, y: 85 })).toBe(true);
  });
});

describe("clampToRinkBounds", () => {
  it("returns same position when inside bounds", () => {
    const pos = { x: 100, y: 42.5 };
    expect(clampToRinkBounds(pos)).toEqual(pos);
  });

  it("clamps x to upper bound", () => {
    const result = clampToRinkBounds({ x: 250, y: 42.5 });
    expect(result.x).toBe(200);
    expect(result.y).toBe(42.5);
  });

  it("clamps y to upper bound", () => {
    const result = clampToRinkBounds({ x: 100, y: 100 });
    expect(result.x).toBe(100);
    expect(result.y).toBe(85);
  });

  it("clamps negative coordinates to zero", () => {
    const result = clampToRinkBounds({ x: -10, y: -5 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe("hitTest equipment", () => {
    const withCone = {
        ...createEmptyPlayData(),
        equipment: [{ id: "cone", kind: "cone" as const, position: { x: 100, y: 40 }, rotation: 0 }],
    };

    it("hits equipment within its radius", () => {
        expect(hitTest({ x: 100.5, y: 40 }, withCone)).toMatchObject({ hit: true, elementType: "equipment", elementId: "cone" });
    });

    it("misses a tiny glyph without a minimum hit radius", () => {
        expect(hitTest({ x: 104, y: 40 }, withCone).hit).toBe(false);
    });

    it("honors minHitRadiusFt so small glyphs stay tappable when zoomed out", () => {
        expect(hitTest({ x: 104, y: 40 }, withCone, 5).hit).toBe(true);
    });
});

describe("clampToRect", () => {
  const zoneLeft = areaRect({ kind: "zone-left" });

  it("keeps a point inside, including on the edge", () => {
    expect(clampToRect({ x: 75, y: 85 }, zoneLeft)).toEqual({ x: 75, y: 85 });
    expect(clampToRect({ x: 30, y: 40 }, zoneLeft)).toEqual({ x: 30, y: 40 });
  });

  it("clamps each axis to the rectangle", () => {
    expect(clampToRect({ x: 150, y: 40 }, zoneLeft)).toEqual({ x: 75, y: 40 });
    expect(clampToRect({ x: -3, y: 99 }, { x: 100, y: 30, w: 20, h: 20 })).toEqual({ x: 100, y: 50 });
  });

  it("is what clampToRinkBounds does for the whole rink", () => {
    const p = { x: 250, y: -4 };
    expect(clampToRinkBounds(p)).toEqual(clampToRect(p, FULL_RINK));
  });
});

describe("dragTarget", () => {
  const zoneLeft = areaRect({ kind: "zone-left" });

  it("moves the element with the pointer, keeping the grab offset", () => {
    expect(dragTarget({ x: 50, y: 40 }, { x: 2, y: -1 }, zoneLeft)).toEqual({ x: 48, y: 41 });
  });

  it("lets an element grabbed off-center reach the area edge exactly", () => {
    // Clamping the pointer to the area first would stop the element at 73.
    expect(dragTarget({ x: 77, y: 40 }, { x: 2, y: 0 }, zoneLeft)).toEqual({ x: 75, y: 40 });
  });

  it("clamps an element dragged far past the edge", () => {
    expect(dragTarget({ x: 160, y: 90 }, { x: -3, y: 0 }, zoneLeft)).toEqual({ x: 75, y: 85 });
  });
});
