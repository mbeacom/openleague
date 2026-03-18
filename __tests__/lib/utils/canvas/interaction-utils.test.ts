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
} from "@/lib/utils/canvas/interaction-utils";
import type { PlayData, PlayerIcon, DrawingElement, TextAnnotation } from "@/types/practice-planner";

const emptyPlayData: PlayData = { players: [], drawings: [], annotations: [] };

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
      players: [{ id: "p1", position: { x: 50, y: 50 }, label: "C", color: "#FF0000" }],
      drawings: [],
      annotations: [],
    };

    history.push(state);
    expect(history.getCurrentState()).toEqual(state);
  });

  it("supports undo", () => {
    const history = new HistoryManager();
    const state1: PlayData = { ...emptyPlayData, players: [{ id: "p1", position: { x: 10, y: 10 }, label: "A", color: "#F00" }] };
    const state2: PlayData = { ...emptyPlayData, players: [{ id: "p2", position: { x: 20, y: 20 }, label: "B", color: "#0F0" }] };

    history.push(state1);
    history.push(state2);

    expect(history.canUndo()).toBe(true);
    const undone = history.undo();
    expect(undone).toEqual(state1);
  });

  it("supports redo after undo", () => {
    const history = new HistoryManager();
    const state1: PlayData = { ...emptyPlayData };
    const state2: PlayData = { ...emptyPlayData, players: [{ id: "p1", position: { x: 0, y: 0 }, label: "X", color: "#000" }] };

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
    const state2: PlayData = { ...emptyPlayData, players: [{ id: "p1", position: { x: 0, y: 0 }, label: "A", color: "#000" }] };
    const state3: PlayData = { ...emptyPlayData, players: [{ id: "p2", position: { x: 5, y: 5 }, label: "B", color: "#FFF" }] };

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
    label: "C",
    color: "#FF0000",
  };

  it("returns true when point is on the player", () => {
    expect(hitTestPlayer({ x: 100, y: 50 }, player)).toBe(true);
  });

  it("returns true when point is within hit radius", () => {
    expect(hitTestPlayer({ x: 105, y: 50 }, player)).toBe(true);
  });

  it("returns false when point is far from player", () => {
    expect(hitTestPlayer({ x: 200, y: 200 }, player)).toBe(false);
  });
});

describe("hitTestDrawing", () => {
  const drawing: DrawingElement = {
    id: "d1",
    type: "line",
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
      players: [{ id: "p1", position: { x: 50, y: 50 }, label: "C", color: "#F00" }],
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
