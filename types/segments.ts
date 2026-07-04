import type { SegmentKind } from "@prisma/client";

/** Normalized (0-1) rectangle on a surface or venue schematic. */
export interface SegmentGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
}

export interface SegmentView {
  id: string;
  name: string;
  kind: SegmentKind;
  presetRole: string | null;
  isActive: boolean;
  geometry: SegmentGeometry;
}

/** Canonical coexistence pair (segmentAId < segmentBId). */
export interface CoexistencePair {
  segmentAId: string;
  segmentBId: string;
}

/** Suggested relationship produced from drawn geometry for staff review. */
export interface CoexistenceSuggestion {
  otherSegmentId: string;
  otherSegmentName: string;
  /** true = geometry suggests the pair can operate simultaneously. */
  suggestedCoexist: boolean;
}

export interface SurfaceSegmentation {
  surfaceId: string;
  surfaceName: string;
  surfaceType: string;
  /** Display name for the implicit whole-surface segment. */
  wholeLabel: string;
  segments: SegmentView[];
  coexistence: CoexistencePair[];
}

export type BookingConflictSource =
  | "event"
  | "seasonGame"
  | "eventGame"
  | "scheduleBlock"
  | "practice";

export interface BookingConflict {
  source: BookingConflictSource;
  title: string;
  startAt: Date;
  endAt: Date | null;
  surfaceId: string | null;
  /** null = whole surface (or venue-wide when surfaceId is also null). */
  segmentId: string | null;
  segmentName: string | null;
}

/** A row on the venue schedule board (FR-021). */
export interface VenueBookingView extends BookingConflict {
  id: string;
}

export interface VenueLayoutSurface {
  surfaceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface VenueLayoutLabel {
  text: string;
  x: number;
  y: number;
}

/** Stored in Venue.layout (Json). Schematic only — never drives availability. */
export interface VenueLayoutData {
  surfaces: VenueLayoutSurface[];
  labels: VenueLayoutLabel[];
}
