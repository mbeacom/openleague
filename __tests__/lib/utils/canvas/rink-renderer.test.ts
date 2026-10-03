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
  FULL_RINK,
  rinkToScreen,
  screenToRink,
} from "@/lib/utils/canvas/rink-renderer";
import { editViewport } from "@/lib/utils/ice-area";

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

describe("createTransformContext with a viewport", () => {
  it("defaults to the whole rink", () => {
    expect(createTransformContext(800, 400, 20, FULL_RINK)).toEqual(createTransformContext(800, 400));
  });

  it("fits a tall viewport to the height and centers it", () => {
    const vp = editViewport({ kind: "zone-left" }); // { x: 0, y: 0, w: 80, h: 85 }
    const t = createTransformContext(800, 400, 20, vp);
    expect(t.scaleX).toBeCloseTo(360 / 85, 10);
    const center = rinkToCanvas({ x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 }, t);
    expect(center.x).toBeCloseTo(400, 9);
    expect(center.y).toBeCloseTo(200, 9);
    expect(rinkToCanvas({ x: 0, y: 0 }, t).y).toBeCloseTo(20, 9);
    expect(rinkToCanvas({ x: 0, y: 85 }, t).y).toBeCloseTo(380, 9);
  });

  it("fits a wide viewport to the width", () => {
    const vp = editViewport({ kind: "custom", rect: { x: 20, y: 30, w: 160, h: 20 } }); // { 15, 25, 170, 30 }
    const t = createTransformContext(800, 400, 20, vp);
    expect(t.scaleX).toBeCloseTo(760 / 170, 10);
    expect(rinkToCanvas({ x: 15, y: 25 }, t).x).toBeCloseTo(20, 9);
    expect(rinkToCanvas({ x: 185, y: 25 }, t).x).toBeCloseTo(780, 9);
  });

  it.each([
    [{ x: 100, y: 40 }],
    [{ x: 150, y: 40 }], // outside a zone-neutral viewport
    [{ x: 0, y: 85 }],
  ])("round-trips %o through a cropped viewport", (p) => {
    const t = createTransformContext(800, 400, 20, editViewport({ kind: "zone-neutral" }));
    const back = canvasToRink(rinkToCanvas(p, t), t);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
});

describe("screen mapping under zoom and pan", () => {
  const t = createTransformContext(800, 400, 20, editViewport({ kind: "zone-neutral" }));
  const zoom = 2.3;
  const pan = { x: -137.5, y: 41.25 };

  it("matches ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y) applied to rinkToCanvas", () => {
    const p = { x: 90, y: 20 };
    const c = rinkToCanvas(p, t);
    expect(rinkToScreen(p, t, zoom, pan)).toEqual({ x: c.x * zoom + pan.x, y: c.y * zoom + pan.y });
  });

  it.each([
    [{ x: 90, y: 20 }],
    [{ x: 150, y: 40 }], // outside the viewport, visible only after zooming out
    [{ x: 75, y: 0 }],
  ])("round-trips %o", (p) => {
    const back = screenToRink(rinkToScreen(p, t, zoom, pan), t, zoom, pan);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("is the plain canvas mapping at zoom 1 and no pan", () => {
    const p = { x: 110, y: 60 };
    expect(screenToRink(rinkToCanvas(p, t), t, 1, { x: 0, y: 0 }).x).toBeCloseTo(110, 9);
  });
});
