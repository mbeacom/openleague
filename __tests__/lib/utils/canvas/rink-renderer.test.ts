/**
 * Unit tests for rink renderer coordinate transformations
 *
 * Tests coverage:
 * - createTransformContext calculations
 * - rinkToCanvas coordinate conversion
 * - canvasToRink coordinate conversion
 * - Round-trip conversion accuracy
 * - RINK_DIMENSIONS constants
 */

import { describe, it, expect } from "vitest";
import {
  createTransformContext,
  rinkToCanvas,
  canvasToRink,
  RINK_DIMENSIONS,
} from "@/lib/utils/canvas/rink-renderer";

describe("RINK_DIMENSIONS", () => {
  it("has standard NHL rink dimensions", () => {
    expect(RINK_DIMENSIONS.width).toBe(200);
    expect(RINK_DIMENSIONS.height).toBe(85);
  });
});

describe("createTransformContext", () => {
  it("creates a transform context for given canvas dimensions", () => {
    const transform = createTransformContext(800, 400);
    expect(transform).toBeDefined();
    expect(transform.canvasWidth).toBe(800);
    expect(transform.canvasHeight).toBe(400);
  });

  it("includes scale factors", () => {
    const transform = createTransformContext(800, 400);
    expect(transform.scaleX).toBeGreaterThan(0);
    expect(transform.scaleY).toBeGreaterThan(0);
  });

  it("handles different aspect ratios", () => {
    const wide = createTransformContext(1200, 400);
    const narrow = createTransformContext(600, 400);
    expect(wide.scaleX).not.toBe(narrow.scaleX);
  });

  it("applies padding", () => {
    const withPadding = createTransformContext(800, 400, 20);
    const noPadding = createTransformContext(800, 400, 0);
    expect(withPadding.offsetX).toBeGreaterThanOrEqual(noPadding.offsetX);
  });
});

describe("rinkToCanvas", () => {
  const transform = createTransformContext(800, 400);

  it("converts rink origin to canvas coordinates", () => {
    const result = rinkToCanvas({ x: 0, y: 0 }, transform);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it("converts rink center to approximately canvas center", () => {
    const result = rinkToCanvas({ x: 100, y: 42.5 }, transform);
    // Should be roughly in the center area of the canvas
    expect(result.x).toBeGreaterThan(300);
    expect(result.x).toBeLessThan(500);
    expect(result.y).toBeGreaterThan(100);
    expect(result.y).toBeLessThan(300);
  });

  it("converts rink far corner", () => {
    const result = rinkToCanvas({ x: 200, y: 85 }, transform);
    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBeGreaterThan(0);
    expect(result.x).toBeLessThanOrEqual(800);
    expect(result.y).toBeLessThanOrEqual(400);
  });
});

describe("canvasToRink", () => {
  const transform = createTransformContext(800, 400);

  it("converts canvas coordinates back to rink coordinates", () => {
    // First convert rink to canvas, then back
    const rinkPos = { x: 100, y: 42.5 };
    const canvasPos = rinkToCanvas(rinkPos, transform);
    const roundTrip = canvasToRink(canvasPos, transform);

    expect(roundTrip.x).toBeCloseTo(rinkPos.x, 1);
    expect(roundTrip.y).toBeCloseTo(rinkPos.y, 1);
  });

  it("round-trips origin correctly", () => {
    const rinkPos = { x: 0, y: 0 };
    const canvasPos = rinkToCanvas(rinkPos, transform);
    const roundTrip = canvasToRink(canvasPos, transform);

    expect(roundTrip.x).toBeCloseTo(0, 1);
    expect(roundTrip.y).toBeCloseTo(0, 1);
  });

  it("round-trips far corner correctly", () => {
    const rinkPos = { x: 200, y: 85 };
    const canvasPos = rinkToCanvas(rinkPos, transform);
    const roundTrip = canvasToRink(canvasPos, transform);

    expect(roundTrip.x).toBeCloseTo(200, 1);
    expect(roundTrip.y).toBeCloseTo(85, 1);
  });

  it("round-trips arbitrary points correctly", () => {
    const points = [
      { x: 50, y: 20 },
      { x: 150, y: 60 },
      { x: 25, y: 75 },
    ];

    for (const rinkPos of points) {
      const canvasPos = rinkToCanvas(rinkPos, transform);
      const roundTrip = canvasToRink(canvasPos, transform);
      expect(roundTrip.x).toBeCloseTo(rinkPos.x, 1);
      expect(roundTrip.y).toBeCloseTo(rinkPos.y, 1);
    }
  });
});
