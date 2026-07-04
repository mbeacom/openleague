import type { SegmentKind, SurfaceType } from "@prisma/client";
import type { SegmentGeometry } from "@/types/segments";

/**
 * Segmentation presets by surface type (FR-004).
 *
 * - ICE: two halves (HALF_A "North half", HALF_B "South half") plus four
 *   cross-ice zones (CROSS_1..CROSS_4, one quarter each). The preset's
 *   "full ice" is the implicit whole-surface segment (`segmentId: null`) —
 *   it is never materialized as a row, so no preset entry exists for it.
 * - COURT: two halves.
 * - All other surface types: no preset (whole surface only).
 *
 * Coexistence relationships follow FR-006: the two halves coexist with each
 * other; all four cross zones coexist with one another and with the opposite
 * half; every cross zone conflicts with its containing half (the pair is
 * simply absent — undeclared pairs conflict); and the whole-surface segment
 * conflicts with everything implicitly, so it needs no pairs here.
 *
 * Geometry is authoring/display input only ("geometry proposes, declarations
 * decide") — the coexistence pairs below are the sole source of conflict
 * truth when the preset is applied.
 */
export type PresetSegmentDef = {
  /** Stable preset role: "HALF_A" | "HALF_B" | "CROSS_1".."CROSS_4". */
  role: string;
  /** Default display name; individually renameable after application. */
  defaultName: string;
  /** HALF or CROSS. */
  kind: SegmentKind;
  /** Normalized standard position on the surface schematic. */
  geometry: SegmentGeometry;
};

export type SegmentationPreset = {
  segments: PresetSegmentDef[];
  /**
   * Role pairs that coexist (bookable at overlapping times without
   * conflict). Each unordered pair is listed exactly once; any pair not
   * listed conflicts (FR-006).
   */
  coexistingRolePairs: [string, string][];
};

const ICE_PRESET: SegmentationPreset = {
  segments: [
    {
      role: "HALF_A",
      defaultName: "North half",
      kind: "HALF",
      geometry: { x: 0, y: 0, w: 1, h: 0.5, rotation: 0 },
    },
    {
      role: "HALF_B",
      defaultName: "South half",
      kind: "HALF",
      geometry: { x: 0, y: 0.5, w: 1, h: 0.5, rotation: 0 },
    },
    {
      role: "CROSS_1",
      defaultName: "Cross-ice zone 1",
      kind: "CROSS",
      geometry: { x: 0, y: 0, w: 0.5, h: 0.5, rotation: 0 },
    },
    {
      role: "CROSS_2",
      defaultName: "Cross-ice zone 2",
      kind: "CROSS",
      geometry: { x: 0.5, y: 0, w: 0.5, h: 0.5, rotation: 0 },
    },
    {
      role: "CROSS_3",
      defaultName: "Cross-ice zone 3",
      kind: "CROSS",
      geometry: { x: 0, y: 0.5, w: 0.5, h: 0.5, rotation: 0 },
    },
    {
      role: "CROSS_4",
      defaultName: "Cross-ice zone 4",
      kind: "CROSS",
      geometry: { x: 0.5, y: 0.5, w: 0.5, h: 0.5, rotation: 0 },
    },
  ],
  coexistingRolePairs: [
    // The two halves coexist with each other.
    ["HALF_A", "HALF_B"],
    // All four cross zones coexist with one another.
    ["CROSS_1", "CROSS_2"],
    ["CROSS_1", "CROSS_3"],
    ["CROSS_1", "CROSS_4"],
    ["CROSS_2", "CROSS_3"],
    ["CROSS_2", "CROSS_4"],
    ["CROSS_3", "CROSS_4"],
    // Each cross zone coexists with the opposite half only; the pair with
    // its containing half is intentionally absent (conflict).
    ["CROSS_1", "HALF_B"],
    ["CROSS_2", "HALF_B"],
    ["CROSS_3", "HALF_A"],
    ["CROSS_4", "HALF_A"],
  ],
};

const COURT_PRESET: SegmentationPreset = {
  segments: [
    {
      role: "HALF_A",
      defaultName: "Half court A",
      kind: "HALF",
      geometry: { x: 0, y: 0, w: 0.5, h: 1, rotation: 0 },
    },
    {
      role: "HALF_B",
      defaultName: "Half court B",
      kind: "HALF",
      geometry: { x: 0.5, y: 0, w: 0.5, h: 1, rotation: 0 },
    },
  ],
  coexistingRolePairs: [["HALF_A", "HALF_B"]],
};

/**
 * Returns the segmentation preset for a surface type (FR-004), or null when
 * the type has no preset (whole surface only).
 */
export function getSegmentationPreset(
  surfaceType: SurfaceType
): SegmentationPreset | null {
  switch (surfaceType) {
    case "ICE":
      return ICE_PRESET;
    case "COURT":
      return COURT_PRESET;
    default:
      return null;
  }
}

/**
 * Default display label for the implicit whole-surface segment
 * (overridable via `IceSurface.wholeLabel`).
 */
export function getWholeSurfaceDefaultLabel(surfaceType: SurfaceType): string {
  switch (surfaceType) {
    case "ICE":
      return "Full ice";
    case "COURT":
      return "Full court";
    default:
      return "Whole surface";
  }
}
