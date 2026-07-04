import { describe, expect, it } from "vitest";
import { SurfaceType } from "@prisma/client";
import {
  getSegmentationPreset,
  getWholeSurfaceDefaultLabel,
} from "@/lib/utils/segment-presets";
import type { SegmentGeometry } from "@/types/segments";

const ALL_SURFACE_TYPES = Object.values(SurfaceType);
const PRESETLESS_SURFACE_TYPES = ALL_SURFACE_TYPES.filter(
  (surfaceType) => surfaceType !== "ICE" && surfaceType !== "COURT"
);

/** Canonical key for an unordered role pair. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

function toPairKeySet(pairs: [string, string][]): Set<string> {
  return new Set(pairs.map(([a, b]) => pairKey(a, b)));
}

function rectContains(outer: SegmentGeometry, inner: SegmentGeometry): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

describe("segment-presets", () => {
  describe("ICE preset", () => {
    const preset = getSegmentationPreset("ICE");
    if (!preset) throw new Error("ICE preset must exist");
    const byRole = new Map(preset.segments.map((segment) => [segment.role, segment]));

    it("has exactly six segments with unique roles", () => {
      expect(preset.segments).toHaveLength(6);
      expect(byRole.size).toBe(6);
      expect([...byRole.keys()].sort()).toEqual([
        "CROSS_1",
        "CROSS_2",
        "CROSS_3",
        "CROSS_4",
        "HALF_A",
        "HALF_B",
      ]);
    });

    it("uses HALF kind for halves and CROSS kind for cross zones", () => {
      expect(byRole.get("HALF_A")?.kind).toBe("HALF");
      expect(byRole.get("HALF_B")?.kind).toBe("HALF");
      for (const role of ["CROSS_1", "CROSS_2", "CROSS_3", "CROSS_4"]) {
        expect(byRole.get(role)?.kind).toBe("CROSS");
      }
    });

    it("assigns the documented default names", () => {
      expect(byRole.get("HALF_A")?.defaultName).toBe("North half");
      expect(byRole.get("HALF_B")?.defaultName).toBe("South half");
      expect(byRole.get("CROSS_1")?.defaultName).toBe("Cross-ice zone 1");
      expect(byRole.get("CROSS_4")?.defaultName).toBe("Cross-ice zone 4");
    });

    it.each(["HALF_A", "HALF_B", "CROSS_1", "CROSS_2", "CROSS_3", "CROSS_4"])(
      "%s geometry stays within normalized [0,1] bounds",
      (role) => {
        const geometry = byRole.get(role)?.geometry;
        if (!geometry) throw new Error(`missing geometry for ${role}`);
        expect(geometry.x).toBeGreaterThanOrEqual(0);
        expect(geometry.y).toBeGreaterThanOrEqual(0);
        expect(geometry.w).toBeGreaterThan(0);
        expect(geometry.h).toBeGreaterThan(0);
        expect(geometry.x + geometry.w).toBeLessThanOrEqual(1);
        expect(geometry.y + geometry.h).toBeLessThanOrEqual(1);
        expect(geometry.rotation).toBeGreaterThanOrEqual(0);
        expect(geometry.rotation).toBeLessThan(360);
      }
    );

    it("places cross zones 1-2 inside HALF_A and 3-4 inside HALF_B", () => {
      const halfA = byRole.get("HALF_A")!.geometry;
      const halfB = byRole.get("HALF_B")!.geometry;
      expect(rectContains(halfA, byRole.get("CROSS_1")!.geometry)).toBe(true);
      expect(rectContains(halfA, byRole.get("CROSS_2")!.geometry)).toBe(true);
      expect(rectContains(halfB, byRole.get("CROSS_3")!.geometry)).toBe(true);
      expect(rectContains(halfB, byRole.get("CROSS_4")!.geometry)).toBe(true);
      // Geometry agrees with the declarations: zones 1-2 are NOT inside the
      // south half, zones 3-4 are NOT inside the north half.
      expect(rectContains(halfB, byRole.get("CROSS_1")!.geometry)).toBe(false);
      expect(rectContains(halfB, byRole.get("CROSS_2")!.geometry)).toBe(false);
      expect(rectContains(halfA, byRole.get("CROSS_3")!.geometry)).toBe(false);
      expect(rectContains(halfA, byRole.get("CROSS_4")!.geometry)).toBe(false);
    });

    it("lists each unordered coexistence pair exactly once", () => {
      const keys = toPairKeySet(preset.coexistingRolePairs);
      expect(keys.size).toBe(preset.coexistingRolePairs.length);
    });

    it("declares exactly the FR-006 coexistence matrix", () => {
      const expected = new Set([
        pairKey("HALF_A", "HALF_B"),
        pairKey("CROSS_1", "CROSS_2"),
        pairKey("CROSS_1", "CROSS_3"),
        pairKey("CROSS_1", "CROSS_4"),
        pairKey("CROSS_2", "CROSS_3"),
        pairKey("CROSS_2", "CROSS_4"),
        pairKey("CROSS_3", "CROSS_4"),
        pairKey("CROSS_1", "HALF_B"),
        pairKey("CROSS_2", "HALF_B"),
        pairKey("CROSS_3", "HALF_A"),
        pairKey("CROSS_4", "HALF_A"),
      ]);
      expect(toPairKeySet(preset.coexistingRolePairs)).toEqual(expected);
    });

    it("coexists halves with each other and cross zones across halves", () => {
      const keys = toPairKeySet(preset.coexistingRolePairs);
      expect(keys.has(pairKey("HALF_A", "HALF_B"))).toBe(true);
      expect(keys.has(pairKey("CROSS_1", "CROSS_3"))).toBe(true);
      expect(keys.has(pairKey("CROSS_1", "HALF_B"))).toBe(true);
    });

    it("does NOT coexist a cross zone with its containing half", () => {
      const keys = toPairKeySet(preset.coexistingRolePairs);
      expect(keys.has(pairKey("CROSS_1", "HALF_A"))).toBe(false);
      expect(keys.has(pairKey("CROSS_2", "HALF_A"))).toBe(false);
      expect(keys.has(pairKey("CROSS_3", "HALF_B"))).toBe(false);
      expect(keys.has(pairKey("CROSS_4", "HALF_B"))).toBe(false);
    });
  });

  describe("COURT preset", () => {
    const preset = getSegmentationPreset("COURT");
    if (!preset) throw new Error("COURT preset must exist");

    it("has exactly two half-court segments", () => {
      expect(preset.segments).toHaveLength(2);
      const roles = preset.segments.map((segment) => segment.role).sort();
      expect(roles).toEqual(["HALF_A", "HALF_B"]);
      for (const segment of preset.segments) {
        expect(segment.kind).toBe("HALF");
      }
      const names = preset.segments.map((segment) => segment.defaultName).sort();
      expect(names).toEqual(["Half court A", "Half court B"]);
    });

    it("declares exactly one coexistence pair: the two halves", () => {
      expect(preset.coexistingRolePairs).toHaveLength(1);
      expect(toPairKeySet(preset.coexistingRolePairs)).toEqual(
        new Set([pairKey("HALF_A", "HALF_B")])
      );
    });
  });

  describe("surface types without presets", () => {
    it.each(PRESETLESS_SURFACE_TYPES)("%s returns null (whole surface only)", (surfaceType) => {
      expect(getSegmentationPreset(surfaceType)).toBeNull();
    });
  });

  describe("getWholeSurfaceDefaultLabel", () => {
    it("labels ICE as Full ice", () => {
      expect(getWholeSurfaceDefaultLabel("ICE")).toBe("Full ice");
    });

    it("labels COURT as Full court", () => {
      expect(getWholeSurfaceDefaultLabel("COURT")).toBe("Full court");
    });

    it("labels OTHER as Whole surface", () => {
      expect(getWholeSurfaceDefaultLabel("OTHER")).toBe("Whole surface");
    });

    it.each(PRESETLESS_SURFACE_TYPES)("%s falls back to Whole surface", (surfaceType) => {
      expect(getWholeSurfaceDefaultLabel(surfaceType)).toBe("Whole surface");
    });
  });
});
