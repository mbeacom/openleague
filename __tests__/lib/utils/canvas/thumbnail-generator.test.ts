/**
 * Unit tests for thumbnail generator utilities
 *
 * Tests pure functions that don't require canvas rendering:
 * - isValidPngBase64
 * - getBase64Size
 * - THUMBNAIL_DIMENSIONS constant
 */

import { describe, it, expect } from "vitest";
import { createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import {
  drawThumbnailScene,
  thumbnailPadding,
  isValidPngBase64,
  getBase64Size,
  THUMBNAIL_DIMENSIONS,
} from "@/lib/utils/canvas/thumbnail-generator";

describe("THUMBNAIL_DIMENSIONS", () => {
  it("has expected thumbnail dimensions", () => {
    expect(THUMBNAIL_DIMENSIONS.width).toBe(300);
    expect(THUMBNAIL_DIMENSIONS.height).toBe(128);
  });
});

describe("isValidPngBase64", () => {
  it("validates a correct PNG base64 string", () => {
    const valid = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    expect(isValidPngBase64(valid)).toBe(true);
  });

  it("rejects non-PNG base64 strings", () => {
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(isValidPngBase64(jpeg)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPngBase64("")).toBe(false);
  });

  it("rejects non-base64 strings", () => {
    expect(isValidPngBase64("not-base64-data")).toBe(false);
  });

  it("rejects strings without data URI prefix", () => {
    expect(isValidPngBase64("iVBORw0KGgoAAAANSUhEUgAAAAE=")).toBe(false);
  });
});

describe("getBase64Size", () => {
  it("calculates size of a base64 string", () => {
    const small = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=";
    const size = getBase64Size(small);
    expect(size).toBeGreaterThan(0);
  });

  it("returns 0 for empty string", () => {
    expect(getBase64Size("")).toBe(0);
  });

  it("larger data produces larger size", () => {
    const small = "data:image/png;base64,AAAA";
    const large = "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(getBase64Size(large)).toBeGreaterThan(getBase64Size(small));
  });
});

describe("thumbnail glyph size (scale model)", () => {
    it("draws a thumbnail's puck at its real size, not the board's 8 px minimum", () => {
        const calls: Array<{ name: string; args: unknown[] }> = [];
        const ctx = new Proxy({} as Record<string, unknown>, {
            get: (t, prop) => (typeof prop === "string" && prop in t ? t[prop] : (...args: unknown[]) => { calls.push({ name: String(prop), args }); return { width: 10 }; }),
            set: (t, prop, value) => { if (typeof prop === "string") t[prop] = value; return true; },
        }) as unknown as CanvasRenderingContext2D;
        // Away from every rink dot, so the only arc at this point is the puck's.
        const data = { ...createEmptyPlayData(), equipment: [{ id: "p", kind: "puck" as const, position: { x: 60, y: 30 }, rotation: 0 }] };
        drawThumbnailScene(ctx, data, 300, 128);
        const at = rinkToCanvas({ x: 60, y: 30 }, createTransformContext(300, 128, 10));
        const puckArcs = calls.filter((c) => c.name === "arc" && Math.abs((c.args[0] as number) - at.x) < 0.01 && Math.abs((c.args[1] as number) - at.y) < 0.01);
        expect(puckArcs.length).toBeGreaterThan(0);
        expect(Math.max(...puckArcs.map((c) => c.args[2] as number))).toBeLessThan(2); // 0.6 · 1.5 px minimum, not 0.6 · 8
    });
});

describe("thumbnailPadding", () => {
    it("keeps 10 px from the stored 300 px width up, so stored and printed thumbnails don't change", () => {
        expect(thumbnailPadding(300)).toBe(10);
        expect(thumbnailPadding(720)).toBe(10);
    });

    it("shrinks in proportion below 300 px, so a 48 px sidebar card isn't mostly padding", () => {
        expect(thumbnailPadding(48)).toBeCloseTo(1.6);
        expect(thumbnailPadding(120)).toBe(4);
    });
});
