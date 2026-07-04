import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from "react";
import type { VenueLayoutData, VenueLayoutSurface } from "@/types/segments";

/**
 * Shared presentational SVG renderer for a venue's schematic layout
 * (feature 006, FR-016..018). Used by the venue-admin layout editor and the
 * public rink profile map. Purely visual — layout geometry never affects
 * availability.
 *
 * No "use client" directive: rendered on the server for the public map (no
 * event handler props passed) and bundled into the client for the editor.
 */

/** ViewBox dimensions; normalized (0-1) layout coordinates scale to these. */
export const LAYOUT_VIEWBOX_WIDTH = 200;
export const LAYOUT_VIEWBOX_HEIGHT = 120;

/**
 * Axis-aligned bounding box (normalized 0-1) of a placed surface after
 * rotation about its center. Exact for the 0/90/180/270 rotations the editor
 * produces, and a conservative bound for any other stored angle.
 */
export function rotatedBoundingBox(surface: VenueLayoutSurface): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const radians = (surface.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = surface.w * cos + surface.h * sin;
  const h = surface.w * sin + surface.h * cos;
  const cx = surface.x + surface.w / 2;
  const cy = surface.y + surface.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const COLORS = {
  canvasFill: "#FAFBFD",
  canvasStroke: "#CFD8DC",
  surfaceFill: "#E3F2FD", // Fresh Ice
  surfaceStroke: "#1976D2", // Action Blue
  surfaceText: "#0D47A1", // League Blue
  selectedStroke: "#0D47A1",
  archivedFill: "#ECEFF1",
  archivedStroke: "#90A4AE",
  archivedText: "#78909C",
  labelText: "#37474F",
  labelHalo: "#BBDEFB",
  handleFill: "#0D47A1",
} as const;

export interface VenueLayoutCanvasProps {
  layout: VenueLayoutData;
  /** surfaceId → display name. */
  surfaceNames: Record<string, string>;
  /** Rendered dashed/greyed in editor mode; excluded when publicView is set. */
  archivedSurfaceIds?: string[];
  /**
   * Public rendering (FR-018): archived surfaces — and any surface without a
   * known name — are excluded entirely.
   */
  publicView?: boolean;
  ariaLabel?: string;
  /* --- editor-only props (leave unset for server rendering) --- */
  selectedSurfaceId?: string | null;
  selectedLabelIndex?: number | null;
  onSurfacePointerDown?: (surfaceId: string, event: ReactPointerEvent<SVGElement>) => void;
  onLabelPointerDown?: (index: number, event: ReactPointerEvent<SVGElement>) => void;
  onResizeHandlePointerDown?: (surfaceId: string, event: ReactPointerEvent<SVGElement>) => void;
  onCanvasPointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onCanvasPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onCanvasPointerUp?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  svgRef?: Ref<SVGSVGElement>;
  style?: CSSProperties;
}

/** Fit the surface name inside its rect without measuring text. */
function surfaceFontSize(name: string, rectWidth: number, rectHeight: number): number {
  const byWidth = (rectWidth * 1.7) / Math.max(name.length, 1);
  return Math.max(3.2, Math.min(6, byWidth, rectHeight * 0.35));
}

export function VenueLayoutCanvas({
  layout,
  surfaceNames,
  archivedSurfaceIds,
  publicView = false,
  ariaLabel = "Venue layout map",
  selectedSurfaceId = null,
  selectedLabelIndex = null,
  onSurfacePointerDown,
  onLabelPointerDown,
  onResizeHandlePointerDown,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  svgRef,
  style,
}: VenueLayoutCanvasProps) {
  const W = LAYOUT_VIEWBOX_WIDTH;
  const H = LAYOUT_VIEWBOX_HEIGHT;
  const archived = new Set(archivedSurfaceIds ?? []);

  // Defensive: layout comes from a JSON column.
  const allSurfaces = layout.surfaces ?? [];
  const labels = layout.labels ?? [];

  const surfaces = publicView
    ? allSurfaces.filter(
        (surface) =>
          !archived.has(surface.surfaceId) && surfaceNames[surface.surfaceId] !== undefined
      )
    : allSurfaces;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height: "auto", display: "block", ...style }}
      {...(onCanvasPointerDown ? { onPointerDown: onCanvasPointerDown } : {})}
      {...(onCanvasPointerMove ? { onPointerMove: onCanvasPointerMove } : {})}
      {...(onCanvasPointerUp
        ? { onPointerUp: onCanvasPointerUp, onPointerCancel: onCanvasPointerUp }
        : {})}
    >
      <rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={4}
        fill={COLORS.canvasFill}
        stroke={COLORS.canvasStroke}
        strokeWidth={1}
      />
      {surfaces.map((surface) => {
        const px = surface.x * W;
        const py = surface.y * H;
        const pw = surface.w * W;
        const ph = surface.h * H;
        const cx = px + pw / 2;
        const cy = py + ph / 2;
        const isArchived = archived.has(surface.surfaceId);
        const isSelected = !publicView && selectedSurfaceId === surface.surfaceId;
        const name = surfaceNames[surface.surfaceId] ?? "Unknown surface";
        const boundingBox = rotatedBoundingBox(surface);
        return (
          <g key={surface.surfaceId}>
            <rect
              x={px}
              y={py}
              width={pw}
              height={ph}
              rx={3}
              transform={`rotate(${surface.rotation} ${cx} ${cy})`}
              fill={isArchived ? COLORS.archivedFill : COLORS.surfaceFill}
              stroke={
                isSelected
                  ? COLORS.selectedStroke
                  : isArchived
                    ? COLORS.archivedStroke
                    : COLORS.surfaceStroke
              }
              strokeWidth={isSelected ? 1.6 : 0.9}
              strokeDasharray={isArchived ? "3 2" : undefined}
              {...(onSurfacePointerDown
                ? {
                    onPointerDown: (event: ReactPointerEvent<SVGElement>) =>
                      onSurfacePointerDown(surface.surfaceId, event),
                    style: { cursor: "move" },
                  }
                : {})}
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={surfaceFontSize(name, pw, ph)}
              fontWeight={700}
              fill={isArchived ? COLORS.archivedText : COLORS.surfaceText}
              pointerEvents="none"
            >
              {name}
            </text>
            {isSelected && onResizeHandlePointerDown ? (
              <circle
                cx={(boundingBox.x + boundingBox.w) * W}
                cy={(boundingBox.y + boundingBox.h) * H}
                r={2.8}
                fill={COLORS.handleFill}
                stroke="#FFFFFF"
                strokeWidth={0.8}
                style={{ cursor: "nwse-resize" }}
                onPointerDown={(event: ReactPointerEvent<SVGElement>) =>
                  onResizeHandlePointerDown(surface.surfaceId, event)
                }
              />
            ) : null}
          </g>
        );
      })}
      {labels.map((label, index) => {
        const isSelected = !publicView && selectedLabelIndex === index;
        return (
          <text
            key={`label-${index}`}
            x={label.x * W}
            y={label.y * H}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={4.5}
            fontWeight={600}
            fill={isSelected ? COLORS.surfaceText : COLORS.labelText}
            {...(isSelected
              ? { stroke: COLORS.labelHalo, strokeWidth: 1.1, paintOrder: "stroke" }
              : {})}
            {...(onLabelPointerDown
              ? {
                  onPointerDown: (event: ReactPointerEvent<SVGElement>) =>
                    onLabelPointerDown(index, event),
                  style: { cursor: "move" },
                }
              : {})}
          >
            {label.text}
          </text>
        );
      })}
    </svg>
  );
}
