"use client";

/**
 * SegmentationEditor — the drawn zone editor for one surface (feature 006,
 * US1 scenarios 2-5).
 *
 * Renders the surface as a fixed 2:1 SVG schematic (viewBox 0 0 200 100);
 * every segment's normalized geometry appears as a rounded rect with its
 * name. Staff can:
 *
 * - draw a new custom zone (click/touch-drag on the canvas), then review the
 *   geometry-suggested coexistence relationships before saving — "geometry
 *   proposes, declarations decide": only staff-confirmed pairs are persisted
 *   and unchecked pairs conflict (FR-005);
 * - move (drag) or resize (corner handles) any zone — geometry edits always
 *   re-run `suggestCoexistence` and re-open the review checklist seeded from
 *   the CURRENT stored pairs, saved via `updateSegment` with the
 *   `details.newlyConflicting` → "Save anyway" (confirm: true) flow (FR-007);
 * - rename, deactivate (FR-007 refusal list surfaced verbatim), and
 *   reactivate zones.
 *
 * Rotation note: the geometry model supports rotation and existing rotated
 * geometry is rendered faithfully, but the v1 editor intentionally exposes no
 * rotation controls — zones are authored axis-aligned.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  createSegment,
  setSegmentActive,
  suggestCoexistence,
  updateSegment,
} from "@/lib/actions/venue-surfaces";
import { MIN_SEGMENT_DIMENSION } from "@/lib/utils/segment-geometry";
import { formatDateTime } from "@/lib/utils/date";
import type { CoexistencePair, SegmentGeometry, SegmentView } from "@/types/segments";

// ---------------------------------------------------------------------------
// Shared FR-007 booking-list helpers (also used by SurfaceManager)
// ---------------------------------------------------------------------------

/** Flattened, display-ready row parsed from an action's failure `details`. */
export interface BookingSummary {
  key: string;
  title: string;
  sourceLabel: string;
  timeLabel: string;
}

const SOURCE_LABELS: Record<string, string> = {
  event: "Team event",
  seasonGame: "Season game",
  eventGame: "Event game",
  scheduleBlock: "Schedule block",
  practice: "Practice",
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Defensively parses `details.futureBookings` / `details.newlyConflicting`
 * (`VenueBookingView[]` server-side, `unknown` across the ActionResult wire)
 * into display rows.
 */
export function parseBookingDetails(
  details: unknown,
  field: "futureBookings" | "newlyConflicting"
): BookingSummary[] {
  if (!details || typeof details !== "object") return [];
  const list = (details as Record<string, unknown>)[field];
  if (!Array.isArray(list)) return [];

  return list.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title : "Booking";
    const source = typeof row.source === "string" ? row.source : "";
    const startAt = toDate(row.startAt);
    const endAt = toDate(row.endAt);
    const timeLabel = startAt
      ? endAt
        ? `${formatDateTime(startAt)} – ${formatDateTime(endAt)}`
        : formatDateTime(startAt)
      : "";
    return [
      {
        key: `${source}:${typeof row.id === "string" ? row.id : index}`,
        title,
        sourceLabel: SOURCE_LABELS[source] ?? source,
        timeLabel,
      },
    ];
  });
}

/** Compact list of affected bookings, rendered inside refusal/warning Alerts. */
export function FutureBookingList({ bookings }: { bookings: BookingSummary[] }) {
  if (bookings.length === 0) return null;
  return (
    <List dense disablePadding sx={{ mt: 1 }}>
      {bookings.map((booking) => (
        <ListItem key={booking.key} disableGutters sx={{ py: 0.25 }}>
          <ListItemText
            primary={booking.title}
            secondary={[booking.sourceLabel, booking.timeLabel].filter(Boolean).join(" · ")}
          />
        </ListItem>
      ))}
    </List>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const VIEW_W = 200;
const VIEW_H = 100;

type Corner = "nw" | "ne" | "sw" | "se";

type DragState =
  | { type: "draw"; startX: number; startY: number }
  | {
      type: "move";
      segmentId: string;
      startX: number;
      startY: number;
      origin: SegmentGeometry;
      moved: boolean;
    }
  | { type: "resize"; segmentId: string; corner: Corner; origin: SegmentGeometry; moved: boolean };

interface ReviewTarget {
  mode: "create" | "edit";
  segment: SegmentView | null;
  geometry: SegmentGeometry;
  /** Edit only: the zone was dragged/redrawn, so geometry is part of the save. */
  geometryChanged: boolean;
}

const KIND_LABELS: Record<string, string> = {
  HALF: "Half",
  CROSS: "Cross zone",
  CUSTOM: "Custom zone",
};

interface SegmentationEditorProps {
  surfaceId: string;
  /** Effective whole-surface label ("Full ice", custom rename, …). */
  wholeLabel: string;
  segments: SegmentView[];
  coexistence: CoexistencePair[];
}

export function SegmentationEditor({
  surfaceId,
  wholeLabel,
  segments,
  coexistence,
}: SegmentationEditorProps) {
  const theme = useTheme();
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [drawMode, setDrawMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftRect, setDraftRect] = useState<SegmentGeometry | null>(null);
  /** Optimistic geometry while dragging / awaiting a save confirmation. */
  const [localGeometry, setLocalGeometry] = useState<Record<string, SegmentGeometry>>({});
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<{
    message: string;
    bookings: BookingSummary[];
  } | null>(null);
  const [statusPending, startStatusTransition] = useTransition();

  const kindColor = (kind: string): string => {
    switch (kind) {
      case "HALF":
        return theme.palette.primary.main;
      case "CROSS":
        return theme.palette.info.main;
      default:
        return theme.palette.secondary.main;
    }
  };

  const geometryOf = (segment: SegmentView): SegmentGeometry =>
    localGeometry[segment.id] ?? segment.geometry;

  const partnerNamesOf = useMemo(() => {
    const nameById = new Map(segments.map((segment) => [segment.id, segment.name]));
    return (segmentId: string): string[] => {
      const names: string[] = [];
      for (const pair of coexistence) {
        if (pair.segmentAId === segmentId) {
          const name = nameById.get(pair.segmentBId);
          if (name) names.push(name);
        } else if (pair.segmentBId === segmentId) {
          const name = nameById.get(pair.segmentAId);
          if (name) names.push(name);
        }
      }
      return names;
    };
  }, [segments, coexistence]);

  // --- pointer helpers -----------------------------------------------------

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

  const toPoint = (event: ReactPointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const capturePointer = (event: ReactPointerEvent) => {
    try {
      svgRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nice-to-have; dragging still works within the SVG.
    }
  };

  const rectFromCorners = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): SegmentGeometry => ({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    rotation: 0,
  });

  // --- pointer handlers ----------------------------------------------------

  const handleCanvasPointerDown = (event: ReactPointerEvent) => {
    if (drawMode) {
      const point = toPoint(event);
      if (!point) return;
      event.preventDefault();
      capturePointer(event);
      dragRef.current = { type: "draw", startX: point.x, startY: point.y };
      setDraftRect({ x: point.x, y: point.y, w: 0, h: 0, rotation: 0 });
      return;
    }
    // Background click clears the selection (segment handlers stop propagation).
    setSelectedId(null);
  };

  const handleSegmentPointerDown = (event: ReactPointerEvent, segment: SegmentView) => {
    if (drawMode) return;
    event.stopPropagation();
    const point = toPoint(event);
    if (!point) return;
    event.preventDefault();
    capturePointer(event);
    setSelectedId(segment.id);
    dragRef.current = {
      type: "move",
      segmentId: segment.id,
      startX: point.x,
      startY: point.y,
      origin: geometryOf(segment),
      moved: false,
    };
  };

  const handleHandlePointerDown = (
    event: ReactPointerEvent,
    segment: SegmentView,
    corner: Corner
  ) => {
    event.stopPropagation();
    event.preventDefault();
    capturePointer(event);
    dragRef.current = {
      type: "resize",
      segmentId: segment.id,
      corner,
      origin: geometryOf(segment),
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toPoint(event);
    if (!point) return;

    if (drag.type === "draw") {
      setDraftRect(rectFromCorners(drag.startX, drag.startY, point.x, point.y));
      return;
    }

    if (drag.type === "move") {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 0.004) drag.moved = true;
      const origin = drag.origin;
      const next: SegmentGeometry = {
        ...origin,
        x: Math.min(Math.max(0, origin.x + dx), Math.max(0, 1 - origin.w)),
        y: Math.min(Math.max(0, origin.y + dy), Math.max(0, 1 - origin.h)),
      };
      setLocalGeometry((prev) => ({ ...prev, [drag.segmentId]: next }));
      return;
    }

    // Resize: the corner opposite the dragged handle stays fixed.
    drag.moved = true;
    const origin = drag.origin;
    const fixed = {
      nw: { x: origin.x + origin.w, y: origin.y + origin.h },
      ne: { x: origin.x, y: origin.y + origin.h },
      sw: { x: origin.x + origin.w, y: origin.y },
      se: { x: origin.x, y: origin.y },
    }[drag.corner];
    let w = Math.max(MIN_SEGMENT_DIMENSION, Math.abs(point.x - fixed.x));
    let h = Math.max(MIN_SEGMENT_DIMENSION, Math.abs(point.y - fixed.y));
    let x = point.x < fixed.x ? fixed.x - w : fixed.x;
    let y = point.y < fixed.y ? fixed.y - h : fixed.y;
    x = Math.min(Math.max(0, x), 1 - MIN_SEGMENT_DIMENSION);
    y = Math.min(Math.max(0, y), 1 - MIN_SEGMENT_DIMENSION);
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    setLocalGeometry((prev) => ({
      ...prev,
      [drag.segmentId]: { ...origin, x, y, w, h },
    }));
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.type === "draw") {
      const rect = draftRect;
      setDraftRect(null);
      if (!rect || rect.w < MIN_SEGMENT_DIMENSION || rect.h < MIN_SEGMENT_DIMENSION) {
        setHint("That zone was too small — drag a larger rectangle on the diagram.");
        return;
      }
      setDrawMode(false);
      setHint(null);
      setReview({ mode: "create", segment: null, geometry: rect, geometryChanged: false });
      return;
    }

    if (!drag.moved) return;
    const segment = segments.find((candidate) => candidate.id === drag.segmentId);
    const geometry = localGeometry[drag.segmentId];
    if (segment && geometry) {
      // Dragging or redrawing always re-runs the coexistence review (US1 #4).
      setReview({ mode: "edit", segment, geometry, geometryChanged: true });
    }
  };

  const handlePointerCancel = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraftRect(null);
    if (drag && drag.type !== "draw") {
      setLocalGeometry((prev) => {
        const next = { ...prev };
        delete next[drag.segmentId];
        return next;
      });
    }
  };

  // --- action handlers -----------------------------------------------------

  const closeReview = (saved: boolean) => {
    if (review && !saved && review.segment && review.geometryChanged) {
      // Revert the optimistic drag/resize preview.
      const revertedId = review.segment.id;
      setLocalGeometry((prev) => {
        const next = { ...prev };
        delete next[revertedId];
        return next;
      });
    }
    setReview(null);
    if (saved) router.refresh();
  };

  const openEdit = (segment: SegmentView) => {
    setSelectedId(segment.id);
    setStatusError(null);
    setReview({ mode: "edit", segment, geometry: geometryOf(segment), geometryChanged: false });
  };

  const handleSetActive = (segment: SegmentView, isActive: boolean) => {
    startStatusTransition(async () => {
      setStatusError(null);
      const result = await setSegmentActive({ segmentId: segment.id, isActive });
      if (!result.success) {
        setStatusError({
          message: result.error,
          bookings: parseBookingDetails(result.details, "futureBookings"),
        });
        return;
      }
      router.refresh();
    });
  };

  // --- render ----------------------------------------------------------------

  const selectedSegment = segments.find((segment) => segment.id === selectedId) ?? null;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button
          variant={drawMode ? "outlined" : "contained"}
          onClick={() => {
            setDrawMode((active) => !active);
            setHint(null);
            setDraftRect(null);
            dragRef.current = null;
          }}
          sx={{ minHeight: 44 }}
        >
          {drawMode ? "Cancel drawing" : "Add zone"}
        </Button>
        <Typography variant="body2" color="text.secondary">
          {drawMode
            ? "Drag on the diagram to draw the new zone."
            : "Tap a zone to select it, drag to move, or use the corner handles to resize — geometry changes always re-run the coexistence review."}
        </Typography>
      </Stack>

      {hint ? (
        <Alert severity="info" onClose={() => setHint(null)}>
          {hint}
        </Alert>
      ) : null}

      {statusError ? (
        <Alert severity="warning" onClose={() => setStatusError(null)}>
          {statusError.message}
          <FutureBookingList bookings={statusError.bookings} />
        </Alert>
      ) : null}

      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: 320, maxWidth: 720 }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width="100%"
            role="img"
            aria-label={`Segmentation diagram: ${wholeLabel}`}
            style={{
              display: "block",
              touchAction: "none",
              userSelect: "none",
              cursor: drawMode ? "crosshair" : "default",
            }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {/* Surface outline (the implicit whole-surface segment). */}
            <rect
              x={1}
              y={1}
              width={VIEW_W - 2}
              height={VIEW_H - 2}
              rx={12}
              fill={theme.palette.action.hover}
              stroke={theme.palette.divider}
              strokeWidth={1}
            />
            <text
              x={VIEW_W / 2}
              y={VIEW_H - 5}
              textAnchor="middle"
              fontSize={5}
              fill={theme.palette.text.secondary}
              pointerEvents="none"
            >
              {wholeLabel} (whole surface)
            </text>

            {segments.map((segment) => {
              const geometry = geometryOf(segment);
              const x = geometry.x * VIEW_W;
              const y = geometry.y * VIEW_H;
              const w = geometry.w * VIEW_W;
              const h = geometry.h * VIEW_H;
              const cx = x + w / 2;
              const cy = y + h / 2;
              const selected = segment.id === selectedId;
              const color = kindColor(segment.kind);
              return (
                <g
                  key={segment.id}
                  transform={
                    geometry.rotation ? `rotate(${geometry.rotation} ${cx} ${cy})` : undefined
                  }
                  pointerEvents={drawMode ? "none" : "auto"}
                  style={{ cursor: drawMode ? "crosshair" : "grab" }}
                  onPointerDown={(event) => handleSegmentPointerDown(event, segment)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={3}
                    fill={color}
                    fillOpacity={segment.isActive ? (selected ? 0.28 : 0.14) : 0.05}
                    stroke={color}
                    strokeWidth={selected ? 1.8 : 1}
                    strokeDasharray={segment.isActive ? undefined : "4 3"}
                    strokeOpacity={segment.isActive ? 1 : 0.6}
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={6}
                    fill={theme.palette.text.primary}
                    opacity={segment.isActive ? 0.9 : 0.5}
                    pointerEvents="none"
                  >
                    {segment.isActive ? segment.name : `${segment.name} (inactive)`}
                  </text>
                </g>
              );
            })}

            {draftRect ? (
              <rect
                x={draftRect.x * VIEW_W}
                y={draftRect.y * VIEW_H}
                width={draftRect.w * VIEW_W}
                height={draftRect.h * VIEW_H}
                rx={3}
                fill={theme.palette.secondary.main}
                fillOpacity={0.15}
                stroke={theme.palette.secondary.main}
                strokeWidth={1.2}
                strokeDasharray="3 2"
                pointerEvents="none"
              />
            ) : null}

            {selectedSegment && !drawMode
              ? (() => {
                  const geometry = geometryOf(selectedSegment);
                  const x = geometry.x * VIEW_W;
                  const y = geometry.y * VIEW_H;
                  const w = geometry.w * VIEW_W;
                  const h = geometry.h * VIEW_H;
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const corners: Array<[Corner, number, number]> = [
                    ["nw", x, y],
                    ["ne", x + w, y],
                    ["sw", x, y + h],
                    ["se", x + w, y + h],
                  ];
                  return (
                    <g
                      transform={
                        geometry.rotation
                          ? `rotate(${geometry.rotation} ${cx} ${cy})`
                          : undefined
                      }
                    >
                      {corners.map(([corner, hx, hy]) => (
                        <g
                          key={corner}
                          style={{
                            cursor:
                              corner === "nw" || corner === "se"
                                ? "nwse-resize"
                                : "nesw-resize",
                          }}
                          onPointerDown={(event) =>
                            handleHandlePointerDown(event, selectedSegment, corner)
                          }
                        >
                          {/* Oversized invisible hit area for touch. */}
                          <circle cx={hx} cy={hy} r={7} fill="transparent" />
                          <circle
                            cx={hx}
                            cy={hy}
                            r={2.6}
                            fill={theme.palette.background.paper}
                            stroke={theme.palette.primary.main}
                            strokeWidth={1.2}
                            pointerEvents="none"
                          />
                        </g>
                      ))}
                    </g>
                  );
                })()
              : null}
          </svg>
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary">
        {wholeLabel} — the whole surface — is always bookable, conflicts with every zone, and
        can never be deactivated.
      </Typography>

      {segments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No zones yet — apply the segmentation preset or draw a custom zone.
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}>
          {segments.map((segment) => {
            const partners = partnerNamesOf(segment.id);
            return (
              <Stack
                key={segment.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  py: 1,
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography fontWeight={600}>{segment.name}</Typography>
                    <Chip size="small" label={KIND_LABELS[segment.kind] ?? segment.kind} />
                    {!segment.isActive ? <Chip size="small" label="Inactive" /> : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {partners.length > 0
                      ? `Can operate alongside: ${partners.join(", ")}`
                      : "Conflicts with every other zone"}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button onClick={() => openEdit(segment)} sx={{ minHeight: 44 }}>
                    Edit
                  </Button>
                  <Button
                    color={segment.isActive ? "warning" : "success"}
                    disabled={statusPending}
                    onClick={() => handleSetActive(segment, !segment.isActive)}
                    sx={{ minHeight: 44 }}
                  >
                    {segment.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      )}

      {review ? (
        <ZoneReviewDialog
          key={`${review.mode}:${review.segment?.id ?? "new"}`}
          surfaceId={surfaceId}
          target={review}
          allSegments={segments}
          coexistence={coexistence}
          onClose={closeReview}
        />
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Review dialog (create + edit)
// ---------------------------------------------------------------------------

interface ZoneReviewDialogProps {
  surfaceId: string;
  target: ReviewTarget;
  allSegments: SegmentView[];
  coexistence: CoexistencePair[];
  onClose: (saved: boolean) => void;
}

function ZoneReviewDialog({
  surfaceId,
  target,
  allSegments,
  coexistence,
  onClose,
}: ZoneReviewDialogProps) {
  const isEdit = target.mode === "edit";
  const editedId = target.segment?.id ?? null;

  // Create: pair against active segments (suggestCoexistence covers exactly
  // those). Edit: list every other segment — updateSegment treats the pair
  // set as COMPLETE, so omitting an inactive partner would drop its pair.
  const partners = useMemo(
    () =>
      allSegments.filter(
        (segment) => segment.id !== editedId && (isEdit || segment.isActive)
      ),
    [allSegments, editedId, isEdit]
  );

  const currentPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!editedId) return ids;
    for (const pair of coexistence) {
      if (pair.segmentAId === editedId) ids.add(pair.segmentBId);
      else if (pair.segmentBId === editedId) ids.add(pair.segmentAId);
    }
    return ids;
  }, [coexistence, editedId]);

  const [name, setName] = useState(target.segment?.name ?? "");
  // Edit: seeded from the CURRENT stored pairs (suggestions are hints only).
  // Create: seeded from the geometry suggestions once they load.
  const [checked, setChecked] = useState<Set<string>>(() => new Set(currentPartnerIds));
  const [suggestions, setSuggestions] = useState<Record<string, boolean> | null>(null);
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    message: string;
    bookings: BookingSummary[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await suggestCoexistence({
        surfaceId,
        geometry: target.geometry,
        excludeSegmentId: editedId ?? undefined,
      });
      if (cancelled) return;
      if (!result.success) {
        setSuggestionsFailed(true);
        setSuggestions({});
        return;
      }
      const map: Record<string, boolean> = {};
      for (const suggestion of result.data.suggestions) {
        map[suggestion.otherSegmentId] = suggestion.suggestedCoexist;
      }
      setSuggestions(map);
      if (!isEdit) {
        setChecked(
          new Set(
            result.data.suggestions
              .filter((suggestion) => suggestion.suggestedCoexist)
              .map((suggestion) => suggestion.otherSegmentId)
          )
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surfaceId, editedId, isEdit, target.geometry]);

  const togglePartner = (partnerId: string) => {
    setConflict(null);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(partnerId)) {
        next.delete(partnerId);
      } else {
        next.add(partnerId);
      }
      return next;
    });
  };

  const handleSave = (confirm: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Zone name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    void (async () => {
      // The action's convention: a pair slot holding the SURFACE id means
      // "the zone being created" (it has no id yet).
      const confirmedCoexistence = [...checked].map((partnerId) =>
        isEdit && editedId
          ? { segmentAId: editedId, segmentBId: partnerId }
          : { segmentAId: surfaceId, segmentBId: partnerId }
      );

      const result =
        isEdit && editedId
          ? await updateSegment({
              segmentId: editedId,
              name: trimmed !== target.segment?.name ? trimmed : undefined,
              geometry: target.geometryChanged ? target.geometry : undefined,
              confirmedCoexistence,
              confirm,
            })
          : await createSegment({
              surfaceId,
              name: trimmed,
              geometry: target.geometry,
              confirmedCoexistence,
            });

      setSaving(false);
      if (!result.success) {
        const bookings = parseBookingDetails(result.details, "newlyConflicting");
        if (bookings.length > 0) {
          setConflict({ message: result.error, bookings });
          return;
        }
        setError(result.error);
        return;
      }
      onClose(true);
    })();
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={saving ? undefined : () => onClose(false)}>
      <DialogTitle>{isEdit ? `Edit ${target.segment?.name}` : "New zone"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {isEdit && target.geometryChanged ? (
            <Alert severity="info">
              You moved or resized this zone — review its relationships below before saving.
            </Alert>
          ) : null}

          <TextField
            label="Zone name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus={!isEdit}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />

          <Box>
            <Typography variant="subtitle2">Can operate alongside:</Typography>
            <Typography variant="body2" color="text.secondary">
              Geometry proposes — you decide. Unchecked pairs conflict.
            </Typography>
          </Box>

          {suggestionsFailed ? (
            <Alert severity="warning">
              Couldn&apos;t load geometry suggestions — review the pairs yourself; unchecked
              pairs conflict.
            </Alert>
          ) : null}

          {suggestions === null ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Checking the drawn geometry…
              </Typography>
            </Stack>
          ) : partners.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No other zones on this surface yet — nothing to pair with.
            </Typography>
          ) : (
            <List dense disablePadding>
              {partners.map((partner) => {
                const suggestion = suggestions[partner.id];
                return (
                  <ListItem key={partner.id} disableGutters sx={{ minHeight: 44 }}>
                    <Checkbox
                      checked={checked.has(partner.id)}
                      onChange={() => togglePartner(partner.id)}
                      slotProps={{
                        input: { "aria-label": `Can operate alongside ${partner.name}` },
                      }}
                    />
                    <ListItemText
                      primary={partner.isActive ? partner.name : `${partner.name} (inactive)`}
                      secondary={
                        suggestion === undefined
                          ? undefined
                          : suggestion
                            ? "Geometry suggests: no overlap — can coexist"
                            : "Geometry suggests: overlap — conflict"
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {conflict ? (
            <Alert severity="warning">
              {conflict.message}
              <FutureBookingList bookings={conflict.bookings} />
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={saving} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        {conflict ? (
          <Button
            variant="contained"
            color="warning"
            disabled={saving}
            onClick={() => handleSave(true)}
            sx={{ minHeight: 44 }}
          >
            {saving ? "Saving…" : "Save anyway"}
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={saving || suggestions === null}
            onClick={() => handleSave(false)}
            sx={{ minHeight: 44 }}
          >
            {saving ? "Saving…" : isEdit ? "Save zone" : "Create zone"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
