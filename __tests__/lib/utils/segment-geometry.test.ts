import { describe, it, expect } from "vitest";
import {
  rectsOverlap,
  suggestCoexistence,
  normalizeGeometry,
  DEFAULT_OVERLAP_EPSILON,
  MIN_SEGMENT_DIMENSION,
} from "@/lib/utils/segment-geometry";
import type { SegmentGeometry } from "@/types/segments";

function rect(x: number, y: number, w: number, h: number, rotation = 0): SegmentGeometry {
  return { x, y, w, h, rotation };
}

describe("rectsOverlap", () => {
  it("returns false for disjoint rects", () => {
    const a = rect(0, 0, 0.3, 0.3);
    const b = rect(0.6, 0.6, 0.3, 0.3);
    expect(rectsOverlap(a, b)).toBe(false);
    expect(rectsOverlap(b, a)).toBe(false);
  });

  it("returns true for clearly overlapping rects", () => {
    const a = rect(0, 0, 0.5, 0.5);
    const b = rect(0.25, 0.25, 0.5, 0.5);
    expect(rectsOverlap(a, b)).toBe(true);
    expect(rectsOverlap(b, a)).toBe(true);
  });

  it("treats exactly touching edges as non-overlapping (x adjacency)", () => {
    const left = rect(0, 0, 0.5, 1);
    const right = rect(0.5, 0, 0.5, 1);
    expect(rectsOverlap(left, right)).toBe(false);
  });

  it("treats exactly touching edges as non-overlapping (y adjacency)", () => {
    const top = rect(0, 0, 1, 0.5);
    const bottom = rect(0, 0.5, 1, 0.5);
    expect(rectsOverlap(top, bottom)).toBe(false);
  });

  it("treats a tiny sliver overlap under epsilon as non-overlapping", () => {
    // Overlaps by 0.005 in x — under the default epsilon of 0.01.
    const a = rect(0, 0, 0.5, 1);
    const b = rect(0.495, 0, 0.5, 1);
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it("treats an overlap just over epsilon as overlapping", () => {
    // Overlaps by 0.02 in x — over the default epsilon of 0.01.
    const a = rect(0, 0, 0.5, 1);
    const b = rect(0.48, 0, 0.5, 1);
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it("respects a custom epsilon", () => {
    const a = rect(0, 0, 0.5, 1);
    const b = rect(0.48, 0, 0.5, 1); // 0.02 overlap in x
    expect(rectsOverlap(a, b, 0.05)).toBe(false);
    expect(rectsOverlap(a, b, 0.001)).toBe(true);
  });

  it("detects containment (small rect inside big rect)", () => {
    const big = rect(0, 0, 1, 1);
    const small = rect(0.4, 0.4, 0.2, 0.2);
    expect(rectsOverlap(big, small)).toBe(true);
    expect(rectsOverlap(small, big)).toBe(true);
  });

  it("swaps dimensions for 90-degree rotation (1x0.5 behaves as 0.5x1)", () => {
    // Horizontal band across the middle: x 0-1, y 0.25-0.75.
    const band = rect(0, 0.25, 1, 0.5);
    // Probe near the left edge, vertically inside the band.
    const probe = rect(0.05, 0.3, 0.1, 0.1);

    // Unrotated, the band spans the full width and hits the probe.
    expect(rectsOverlap(band, probe)).toBe(true);

    // Rotated 90 around its center it becomes x 0.25-0.75, y 0-1
    // and no longer reaches the probe at x 0.05-0.15.
    const rotated = { ...band, rotation: 90 };
    expect(rectsOverlap(rotated, probe)).toBe(false);
    expect(rectsOverlap(probe, rotated)).toBe(false);
  });

  it("treats 270-degree rotation like 90 and 180 like 0", () => {
    const band = rect(0, 0.25, 1, 0.5);
    const probe = rect(0.05, 0.3, 0.1, 0.1);
    expect(rectsOverlap({ ...band, rotation: 270 }, probe)).toBe(false);
    expect(rectsOverlap({ ...band, rotation: 180 }, probe)).toBe(true);
  });

  it("snaps rotation to the nearest 90 degrees", () => {
    const band = rect(0, 0.25, 1, 0.5);
    const probe = rect(0.05, 0.3, 0.1, 0.1);
    // 85 degrees snaps to 90 (swapped); 5 degrees snaps to 0 (unswapped).
    expect(rectsOverlap({ ...band, rotation: 85 }, probe)).toBe(false);
    expect(rectsOverlap({ ...band, rotation: 5 }, probe)).toBe(true);
  });
});

describe("suggestCoexistence", () => {
  const candidate = rect(0, 0, 0.4, 0.4);
  const existing = [
    { id: "seg-far", name: "Far Zone", geometry: rect(0.6, 0.6, 0.4, 0.4) },
    { id: "seg-overlap", name: "Overlapping Zone", geometry: rect(0.2, 0.2, 0.4, 0.4) },
    { id: "seg-touching", name: "Touching Zone", geometry: rect(0.4, 0, 0.4, 0.4) },
  ];

  it("suggests coexist for non-overlapping and not for overlapping segments", () => {
    const suggestions = suggestCoexistence(candidate, existing);
    expect(suggestions).toEqual([
      { otherSegmentId: "seg-far", otherSegmentName: "Far Zone", suggestedCoexist: true },
      { otherSegmentId: "seg-overlap", otherSegmentName: "Overlapping Zone", suggestedCoexist: false },
      { otherSegmentId: "seg-touching", otherSegmentName: "Touching Zone", suggestedCoexist: true },
    ]);
  });

  it("maps ids and names through in stable input order", () => {
    const suggestions = suggestCoexistence(candidate, existing);
    expect(suggestions.map((s) => s.otherSegmentId)).toEqual([
      "seg-far",
      "seg-overlap",
      "seg-touching",
    ]);

    const reversed = suggestCoexistence(candidate, [...existing].reverse());
    expect(reversed.map((s) => s.otherSegmentId)).toEqual([
      "seg-touching",
      "seg-overlap",
      "seg-far",
    ]);
  });

  it("returns an empty array when there are no existing segments", () => {
    expect(suggestCoexistence(candidate, [])).toEqual([]);
  });

  it("marks contained segments as not coexisting", () => {
    const whole = rect(0, 0, 1, 1);
    const suggestions = suggestCoexistence(whole, [
      { id: "seg-inner", name: "Inner", geometry: rect(0.4, 0.4, 0.2, 0.2) },
    ]);
    expect(suggestions[0].suggestedCoexist).toBe(false);
  });
});

describe("normalizeGeometry", () => {
  it("clamps out-of-range coordinates into [0,1]", () => {
    const result = normalizeGeometry(rect(-0.5, 1.5, 0.5, 0.5));
    expect(result.x).toBe(0);
    expect(result.y).toBe(1);
  });

  it("enforces the minimum width/height and caps at 1", () => {
    const result = normalizeGeometry(rect(0, 0, 0.01, 2));
    expect(result.w).toBe(MIN_SEGMENT_DIMENSION);
    expect(result.h).toBe(1);
  });

  it("wraps rotation into [0,360)", () => {
    expect(normalizeGeometry(rect(0, 0, 0.5, 0.5, 450)).rotation).toBe(90);
    expect(normalizeGeometry(rect(0, 0, 0.5, 0.5, -90)).rotation).toBe(270);
    expect(normalizeGeometry(rect(0, 0, 0.5, 0.5, 360)).rotation).toBe(0);
  });

  it("leaves an already-valid geometry unchanged", () => {
    const valid = rect(0.1, 0.2, 0.3, 0.4, 90);
    expect(normalizeGeometry(valid)).toEqual(valid);
  });

  it("sanitizes non-finite values deterministically", () => {
    const result = normalizeGeometry({ x: NaN, y: Infinity, w: NaN, h: -Infinity, rotation: NaN });
    expect(result).toEqual({
      x: 0,
      y: 1,
      w: MIN_SEGMENT_DIMENSION,
      h: MIN_SEGMENT_DIMENSION,
      rotation: 0,
    });
  });

  it("does not mutate the input", () => {
    const input = rect(-1, -1, 0.001, 5, 720);
    const copy = { ...input };
    normalizeGeometry(input);
    expect(input).toEqual(copy);
  });
});

describe("exported defaults", () => {
  it("exposes the documented epsilon and minimum dimension", () => {
    expect(DEFAULT_OVERLAP_EPSILON).toBe(0.01);
    expect(MIN_SEGMENT_DIMENSION).toBe(0.05);
  });
});
