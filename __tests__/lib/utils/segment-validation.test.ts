import { describe, it, expect } from "vitest";
import {
  segmentGeometrySchema,
  createSegmentSchema,
  updateSegmentSchema,
  applySegmentationPresetSchema,
  setSegmentActiveSchema,
  setWholeSurfaceLabelSchema,
  suggestCoexistenceSchema,
  saveVenueLayoutSchema,
  createPracticeSessionSchema,
  updatePracticeSessionSchema,
  practiceVenueAttachmentSchema,
} from "@/lib/utils/validation";

// Valid cuid fixtures (start with "c", no whitespace/hyphens, 8+ chars after).
const SURFACE_ID = "clsurface000000000000001";
const SEGMENT_A = "clsegmenta00000000000001";
const SEGMENT_B = "clsegmentb00000000000001";
const VENUE_ID = "clvenue00000000000000001";
const TEAM_ID = "clteam000000000000000001";
const SESSION_ID = "clsession000000000000001";

const geometry = { x: 0, y: 0, w: 0.5, h: 1, rotation: 0 };

describe("segmentGeometrySchema", () => {
  it("accepts a normalized rect", () => {
    const result = segmentGeometrySchema.safeParse(geometry);
    expect(result.success).toBe(true);
  });

  it("accepts boundary values (coordinates at 1, dimensions at the 0.05 minimum, rotation just below 360)", () => {
    const result = segmentGeometrySchema.safeParse({
      x: 1,
      y: 1,
      w: 0.05,
      h: 0.05,
      rotation: 359.99,
    });
    expect(result.success).toBe(true);
  });

  it("coerces numeric strings", () => {
    const result = segmentGeometrySchema.safeParse({
      x: "0.25",
      y: "0.5",
      w: "0.5",
      h: "0.5",
      rotation: "90",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.5, rotation: 90 });
    }
  });

  it.each([
    ["x below 0", { ...geometry, x: -0.01 }],
    ["y above 1", { ...geometry, y: 1.01 }],
    ["w above 1", { ...geometry, w: 1.5 }],
    ["h below 0", { ...geometry, h: -1 }],
    ["w of 0 (zero-size rects are invalid)", { ...geometry, w: 0 }],
    ["h of 0 (zero-size rects are invalid)", { ...geometry, h: 0 }],
    ["w below the 0.05 minimum", { ...geometry, w: 0.04 }],
    ["h below the 0.05 minimum", { ...geometry, h: 0.04 }],
  ])("rejects %s", (_label, input) => {
    expect(segmentGeometrySchema.safeParse(input).success).toBe(false);
  });

  it("rejects a rotation of 360 (upper bound is exclusive)", () => {
    expect(segmentGeometrySchema.safeParse({ ...geometry, rotation: 360 }).success).toBe(false);
  });

  it("rejects a negative rotation", () => {
    expect(segmentGeometrySchema.safeParse({ ...geometry, rotation: -1 }).success).toBe(false);
  });

  it("rejects a missing dimension", () => {
    expect(
      segmentGeometrySchema.safeParse({ x: 0, y: 0, h: 1, rotation: 0 }).success
    ).toBe(false);
  });
});

describe("createSegmentSchema", () => {
  const base = { surfaceId: SURFACE_ID, name: "North half", geometry };

  it("accepts a valid segment and defaults confirmedCoexistence to []", () => {
    const result = createSegmentSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirmedCoexistence).toEqual([]);
    }
  });

  it("accepts confirmed coexistence pairs", () => {
    const result = createSegmentSchema.safeParse({
      ...base,
      confirmedCoexistence: [{ segmentAId: SEGMENT_A, segmentBId: SEGMENT_B }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a pair with a malformed segment id", () => {
    const result = createSegmentSchema.safeParse({
      ...base,
      confirmedCoexistence: [{ segmentAId: "nope", segmentBId: SEGMENT_B }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pair missing one side", () => {
    const result = createSegmentSchema.safeParse({
      ...base,
      confirmedCoexistence: [{ segmentAId: SEGMENT_A }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(createSegmentSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });

  it("accepts an 80-character name and rejects an 81-character name", () => {
    expect(createSegmentSchema.safeParse({ ...base, name: "n".repeat(80) }).success).toBe(true);
    expect(createSegmentSchema.safeParse({ ...base, name: "n".repeat(81) }).success).toBe(false);
  });

  it("strips control characters from the name (sanitization)", () => {
    const result = createSegmentSchema.safeParse({ ...base, name: "North\x00 half" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("North half");
    }
  });

  it("rejects out-of-bounds geometry", () => {
    const result = createSegmentSchema.safeParse({
      ...base,
      geometry: { ...geometry, x: 2 },
    });
    expect(result.success).toBe(false);
  });
});

describe("updateSegmentSchema", () => {
  it("accepts a bare rename and defaults confirm to false", () => {
    const result = updateSegmentSchema.safeParse({ segmentId: SEGMENT_A, name: "South half" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(false);
      expect(result.data.geometry).toBeUndefined();
      expect(result.data.confirmedCoexistence).toBeUndefined();
    }
  });

  it("accepts a full update with confirm", () => {
    const result = updateSegmentSchema.safeParse({
      segmentId: SEGMENT_A,
      name: "South half",
      geometry,
      confirmedCoexistence: [{ segmentAId: SEGMENT_A, segmentBId: SEGMENT_B }],
      confirm: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(true);
    }
  });

  it("rejects a malformed segmentId", () => {
    expect(updateSegmentSchema.safeParse({ segmentId: "half-a" }).success).toBe(false);
  });
});

describe("applySegmentationPresetSchema", () => {
  it("accepts a surface reference", () => {
    expect(applySegmentationPresetSchema.safeParse({ surfaceId: SURFACE_ID }).success).toBe(true);
  });

  it("rejects a malformed surface reference", () => {
    expect(applySegmentationPresetSchema.safeParse({ surfaceId: "rink-1" }).success).toBe(false);
  });
});

describe("setSegmentActiveSchema", () => {
  it("accepts activation and deactivation", () => {
    expect(setSegmentActiveSchema.safeParse({ segmentId: SEGMENT_A, isActive: true }).success).toBe(true);
    expect(setSegmentActiveSchema.safeParse({ segmentId: SEGMENT_A, isActive: false }).success).toBe(true);
  });

  it("requires isActive to be a boolean", () => {
    expect(setSegmentActiveSchema.safeParse({ segmentId: SEGMENT_A, isActive: "yes" }).success).toBe(false);
  });
});

describe("setWholeSurfaceLabelSchema", () => {
  it("accepts a label", () => {
    const result = setWholeSurfaceLabelSchema.safeParse({
      surfaceId: SURFACE_ID,
      wholeLabel: "Full ice",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an omitted label (reset to type default)", () => {
    expect(setWholeSurfaceLabelSchema.safeParse({ surfaceId: SURFACE_ID }).success).toBe(true);
  });

  it("accepts a 60-character label and rejects a 61-character label", () => {
    expect(
      setWholeSurfaceLabelSchema.safeParse({ surfaceId: SURFACE_ID, wholeLabel: "l".repeat(60) })
        .success
    ).toBe(true);
    expect(
      setWholeSurfaceLabelSchema.safeParse({ surfaceId: SURFACE_ID, wholeLabel: "l".repeat(61) })
        .success
    ).toBe(false);
  });
});

describe("suggestCoexistenceSchema", () => {
  it("accepts drawn geometry without an exclusion", () => {
    expect(suggestCoexistenceSchema.safeParse({ surfaceId: SURFACE_ID, geometry }).success).toBe(true);
  });

  it("accepts an excluded segment (editing an existing zone)", () => {
    const result = suggestCoexistenceSchema.safeParse({
      surfaceId: SURFACE_ID,
      geometry,
      excludeSegmentId: SEGMENT_A,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed exclusion", () => {
    const result = suggestCoexistenceSchema.safeParse({
      surfaceId: SURFACE_ID,
      geometry,
      excludeSegmentId: "zone-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("saveVenueLayoutSchema", () => {
  const surfaceEntry = { surfaceId: SURFACE_ID, ...geometry };
  const label = { text: "Entrance", x: 0.1, y: 0.9 };
  const base = { venueId: VENUE_ID, layout: { surfaces: [surfaceEntry], labels: [label] } };

  it("accepts a valid layout", () => {
    expect(saveVenueLayoutSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an empty layout", () => {
    expect(
      saveVenueLayoutSchema.safeParse({ venueId: VENUE_ID, layout: { surfaces: [], labels: [] } })
        .success
    ).toBe(true);
  });

  it("accepts exactly 20 labels and rejects 21", () => {
    const labels = (count: number) => Array.from({ length: count }, () => ({ ...label }));
    expect(
      saveVenueLayoutSchema.safeParse({
        venueId: VENUE_ID,
        layout: { surfaces: [], labels: labels(20) },
      }).success
    ).toBe(true);
    expect(
      saveVenueLayoutSchema.safeParse({
        venueId: VENUE_ID,
        layout: { surfaces: [], labels: labels(21) },
      }).success
    ).toBe(false);
  });

  it("accepts a 40-character label and rejects a 41-character label", () => {
    const withText = (text: string) => ({
      venueId: VENUE_ID,
      layout: { surfaces: [], labels: [{ ...label, text }] },
    });
    expect(saveVenueLayoutSchema.safeParse(withText("t".repeat(40))).success).toBe(true);
    expect(saveVenueLayoutSchema.safeParse(withText("t".repeat(41))).success).toBe(false);
  });

  it("rejects an empty label text", () => {
    const result = saveVenueLayoutSchema.safeParse({
      venueId: VENUE_ID,
      layout: { surfaces: [], labels: [{ ...label, text: " " }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects label coordinates outside [0,1]", () => {
    const result = saveVenueLayoutSchema.safeParse({
      venueId: VENUE_ID,
      layout: { surfaces: [], labels: [{ ...label, x: 1.2 }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a surface entry with a malformed surface reference", () => {
    const result = saveVenueLayoutSchema.safeParse({
      venueId: VENUE_ID,
      layout: { surfaces: [{ ...surfaceEntry, surfaceId: "pad-b" }], labels: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a surface entry with out-of-range rotation", () => {
    const result = saveVenueLayoutSchema.safeParse({
      venueId: VENUE_ID,
      layout: { surfaces: [{ ...surfaceEntry, rotation: 360 }], labels: [] },
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["a zero width", { w: 0 }],
    ["a height below the 0.05 minimum", { h: 0.04 }],
  ])("rejects a surface entry with %s", (_label, override) => {
    const result = saveVenueLayoutSchema.safeParse({
      venueId: VENUE_ID,
      layout: { surfaces: [{ ...surfaceEntry, ...override }], labels: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe("practice venue attachment (FR-019)", () => {
  const startAt = "2026-09-05T18:00:00.000Z";

  describe("practiceVenueAttachmentSchema", () => {
    it("requires startAt when a venue is attached", () => {
      const result = practiceVenueAttachmentSchema.safeParse({ venueId: VENUE_ID });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("startAt"))).toBe(true);
      }
    });

    it("accepts a venue with a start time and defaults overrideConflicts to false", () => {
      const result = practiceVenueAttachmentSchema.safeParse({ venueId: VENUE_ID, startAt });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.overrideConflicts).toBe(false);
        expect(result.data.startAt).toBeInstanceOf(Date);
      }
    });

    it("accepts a fully unattached practice (no venue, no startAt)", () => {
      expect(practiceVenueAttachmentSchema.safeParse({}).success).toBe(true);
    });

    it("rejects a malformed segment reference", () => {
      const result = practiceVenueAttachmentSchema.safeParse({
        venueId: VENUE_ID,
        startAt,
        segmentId: "north-half",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createPracticeSessionSchema with attachment fields", () => {
    const base = {
      title: "Tuesday skills",
      date: "2026-09-05",
      duration: 60,
      teamId: TEAM_ID,
    };

    it("still accepts an unattached practice", () => {
      const result = createPracticeSessionSchema.safeParse(base);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.overrideConflicts).toBe(false);
        expect(result.data.venueId).toBeUndefined();
      }
    });

    it("rejects a venue attachment without a start time", () => {
      const result = createPracticeSessionSchema.safeParse({ ...base, venueId: VENUE_ID });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("startAt"))).toBe(true);
      }
    });

    it("accepts a full venue/surface/segment attachment with a start time", () => {
      const result = createPracticeSessionSchema.safeParse({
        ...base,
        venueId: VENUE_ID,
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_A,
        startAt,
      });
      expect(result.success).toBe(true);
    });

    it("accepts startAt alone (no venue) — the refine only binds venue → startAt", () => {
      expect(createPracticeSessionSchema.safeParse({ ...base, startAt }).success).toBe(true);
    });
  });

  describe("updatePracticeSessionSchema with attachment fields", () => {
    const base = {
      id: SESSION_ID,
      title: "Tuesday skills",
      date: "2026-09-05",
      duration: 60,
      teamId: TEAM_ID,
    };

    it("rejects a venue attachment without a start time", () => {
      const result = updatePracticeSessionSchema.safeParse({ ...base, venueId: VENUE_ID });
      expect(result.success).toBe(false);
    });

    it("accepts a venue attachment with a start time", () => {
      const result = updatePracticeSessionSchema.safeParse({
        ...base,
        venueId: VENUE_ID,
        startAt,
      });
      expect(result.success).toBe(true);
    });
  });
});
