"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Rotate90DegreesCwOutlinedIcon from "@mui/icons-material/Rotate90DegreesCwOutlined";
import { saveVenueLayout, clearVenueLayout } from "@/lib/actions/venue-layout";
import {
  VenueLayoutCanvas,
  rotatedBoundingBox,
} from "@/components/features/venues/VenueLayoutCanvas";
import type { VenueLayoutData, VenueLayoutLabel, VenueLayoutSurface } from "@/types/segments";

const MIN_SURFACE_SIZE = 0.06;
const MAX_LABELS = 20;
const MAX_LABEL_LENGTH = 40;

interface SurfaceOption {
  id: string;
  name: string;
  isActive: boolean;
  displayOrder: number;
}

interface VenueLayoutEditorProps {
  organizationId: string;
  venueId: string;
  initialLayout: VenueLayoutData | null;
  surfaces: SurfaceOption[];
}

type Selection = { kind: "surface"; surfaceId: string } | { kind: "label"; index: number } | null;

type DragState =
  | { kind: "surface"; surfaceId: string; dx: number; dy: number }
  | { kind: "resize"; surfaceId: string; originX: number; originY: number }
  | { kind: "label"; index: number; dx: number; dy: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Map a client pointer position to normalized (0-1) layout coordinates. */
function toNormalized(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
}

export function VenueLayoutEditor({
  organizationId,
  venueId,
  initialLayout,
  surfaces,
}: VenueLayoutEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [placed, setPlaced] = useState<VenueLayoutSurface[]>(() => {
    const knownIds = new Set(surfaces.map((surface) => surface.id));
    return (initialLayout?.surfaces ?? []).filter((surface) => knownIds.has(surface.surfaceId));
  });
  const [labels, setLabels] = useState<VenueLayoutLabel[]>(() => initialLayout?.labels ?? []);
  const [selection, setSelection] = useState<Selection>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [placingLabel, setPlacingLabel] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [hasSavedLayout, setHasSavedLayout] = useState(Boolean(initialLayout));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const surfacesById = useMemo(
    () => new Map(surfaces.map((surface) => [surface.id, surface])),
    [surfaces]
  );
  const surfaceNames = useMemo(
    () => Object.fromEntries(surfaces.map((surface) => [surface.id, surface.name])),
    [surfaces]
  );
  const archivedSurfaceIds = useMemo(
    () => surfaces.filter((surface) => !surface.isActive).map((surface) => surface.id),
    [surfaces]
  );
  const orderedSurfaces = useMemo(
    () =>
      [...surfaces].sort((a, b) =>
        a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1
      ),
    [surfaces]
  );
  const placedIds = useMemo(
    () => new Set(placed.map((surface) => surface.surfaceId)),
    [placed]
  );

  /**
   * Visual-overlap warning (pure client check on bounding boxes). The layout
   * is schematic only — overlap never affects availability (FR-016).
   */
  const hasVisualOverlap = useMemo(() => {
    const boxes = placed.map((surface) => rotatedBoundingBox(surface));
    const epsilon = 0.005;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > epsilon && overlapY > epsilon) {
          return true;
        }
      }
    }
    return false;
  }, [placed]);

  const selectedSurface =
    selection?.kind === "surface"
      ? placed.find((surface) => surface.surfaceId === selection.surfaceId) ?? null
      : null;
  const selectedLabel =
    selection?.kind === "label" ? labels[selection.index] ?? null : null;

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  function placeSurface(surfaceId: string) {
    clearFeedback();
    setPlaced((current) => {
      if (current.some((surface) => surface.surfaceId === surfaceId)) {
        return current;
      }
      const offset = (current.length % 4) * 0.06;
      return [
        ...current,
        {
          surfaceId,
          x: round4(0.08 + offset),
          y: round4(0.1 + offset),
          w: 0.35,
          h: 0.4,
          rotation: 0,
        },
      ];
    });
    setSelection({ kind: "surface", surfaceId });
  }

  function removeSurface(surfaceId: string) {
    clearFeedback();
    setPlaced((current) => current.filter((surface) => surface.surfaceId !== surfaceId));
    setSelection((current) =>
      current?.kind === "surface" && current.surfaceId === surfaceId ? null : current
    );
  }

  function rotateSelectedSurface() {
    if (selection?.kind !== "surface") return;
    clearFeedback();
    setPlaced((current) =>
      current.map((surface) =>
        surface.surfaceId === selection.surfaceId
          ? { ...surface, rotation: (surface.rotation + 90) % 360 }
          : surface
      )
    );
  }

  function deleteLabel(index: number) {
    clearFeedback();
    setLabels((current) => current.filter((_, i) => i !== index));
    setSelection((current) => {
      if (current?.kind !== "label") return current;
      if (current.index === index) return null;
      return current.index > index ? { kind: "label", index: current.index - 1 } : current;
    });
  }

  function startLabelPlacement() {
    const text = labelDraft.trim();
    if (!text || labels.length >= MAX_LABELS) return;
    clearFeedback();
    setPlacingLabel(text);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    if (placingLabel) {
      const point = toNormalized(svg, event.clientX, event.clientY);
      const newIndex = labels.length;
      setLabels((current) => [
        ...current,
        { text: placingLabel, x: round4(point.x), y: round4(point.y) },
      ]);
      setSelection({ kind: "label", index: newIndex });
      setPlacingLabel(null);
      setLabelDraft("");
      return;
    }
    // A pointer-down that reached the canvas without starting a drag means
    // the background was pressed: clear the selection.
    if (!dragRef.current) {
      setSelection(null);
    }
  }

  function handleSurfacePointerDown(surfaceId: string, event: ReactPointerEvent<SVGElement>) {
    if (placingLabel) return; // let the canvas handler place the label
    const svg = svgRef.current;
    if (!svg) return;
    const surface = placed.find((candidate) => candidate.surfaceId === surfaceId);
    if (!surface) return;
    event.preventDefault();
    const point = toNormalized(svg, event.clientX, event.clientY);
    dragRef.current = {
      kind: "surface",
      surfaceId,
      dx: point.x - surface.x,
      dy: point.y - surface.y,
    };
    setSelection({ kind: "surface", surfaceId });
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture unsupported; drag still works while over the canvas.
    }
  }

  function handleResizePointerDown(surfaceId: string, event: ReactPointerEvent<SVGElement>) {
    if (placingLabel) return;
    const svg = svgRef.current;
    if (!svg) return;
    const surface = placed.find((candidate) => candidate.surfaceId === surfaceId);
    if (!surface) return;
    event.preventDefault();
    const box = rotatedBoundingBox(surface);
    dragRef.current = { kind: "resize", surfaceId, originX: box.x, originY: box.y };
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture unsupported.
    }
  }

  function handleLabelPointerDown(index: number, event: ReactPointerEvent<SVGElement>) {
    if (placingLabel) return;
    const svg = svgRef.current;
    if (!svg) return;
    const label = labels[index];
    if (!label) return;
    event.preventDefault();
    const point = toNormalized(svg, event.clientX, event.clientY);
    dragRef.current = { kind: "label", index, dx: point.x - label.x, dy: point.y - label.y };
    setSelection({ kind: "label", index });
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture unsupported.
    }
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg) return;
    const point = toNormalized(svg, event.clientX, event.clientY);
    if (drag.kind === "surface") {
      setPlaced((current) =>
        current.map((surface) =>
          surface.surfaceId === drag.surfaceId
            ? {
                ...surface,
                x: round4(clamp(point.x - drag.dx, 0, Math.max(0, 1 - surface.w))),
                y: round4(clamp(point.y - drag.dy, 0, Math.max(0, 1 - surface.h))),
              }
            : surface
        )
      );
    } else if (drag.kind === "resize") {
      setPlaced((current) =>
        current.map((surface) => {
          if (surface.surfaceId !== drag.surfaceId) return surface;
          // Resize via the rotation-aware bounding box: its top-left corner
          // stays fixed while the dragged corner follows the pointer.
          const swapAxes = Math.round(surface.rotation / 90) % 2 !== 0;
          const boxW = clamp(point.x - drag.originX, MIN_SURFACE_SIZE, 1);
          const boxH = clamp(point.y - drag.originY, MIN_SURFACE_SIZE, 1);
          const w = swapAxes ? boxH : boxW;
          const h = swapAxes ? boxW : boxH;
          const cx = drag.originX + boxW / 2;
          const cy = drag.originY + boxH / 2;
          return {
            ...surface,
            w: round4(w),
            h: round4(h),
            x: round4(clamp(cx - w / 2, 0, 1)),
            y: round4(clamp(cy - h / 2, 0, 1)),
          };
        })
      );
    } else {
      setLabels((current) =>
        current.map((label, index) =>
          index === drag.index
            ? {
                ...label,
                x: round4(clamp(point.x - drag.dx, 0, 1)),
                y: round4(clamp(point.y - drag.dy, 0, 1)),
              }
            : label
        )
      );
    }
  }

  function handleCanvasPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    const svg = svgRef.current;
    if (svg?.hasPointerCapture?.(event.pointerId)) {
      try {
        svg.releasePointerCapture(event.pointerId);
      } catch {
        // Already released.
      }
    }
  }

  function handleSave() {
    clearFeedback();
    startTransition(async () => {
      const result = await saveVenueLayout({
        venueId,
        layout: {
          surfaces: placed.map((surface) => ({
            surfaceId: surface.surfaceId,
            x: surface.x,
            y: surface.y,
            w: surface.w,
            h: surface.h,
            rotation: surface.rotation,
          })),
          labels: labels.map((label) => ({ text: label.text, x: label.x, y: label.y })),
        },
      });
      if (result.success) {
        setHasSavedLayout(true);
        setMessage("Layout saved.");
      } else {
        setError(result.error);
      }
    });
  }

  function handleClearLayout() {
    setConfirmClearOpen(false);
    clearFeedback();
    startTransition(async () => {
      const result = await clearVenueLayout(venueId);
      if (result.success) {
        setPlaced([]);
        setLabels([]);
        setSelection(null);
        setPlacingLabel(null);
        setHasSavedLayout(false);
        setMessage("Layout cleared. The public profile now uses the standard list view.");
      } else {
        setError(result.error);
      }
    });
  }

  const selectedSurfaceName = selectedSurface
    ? surfacesById.get(selectedSurface.surfaceId)?.name ?? "Surface"
    : null;

  return (
    <Stack spacing={2} data-organization-id={organizationId}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      {hasVisualOverlap && (
        <Alert severity="warning">
          Some placed surfaces overlap visually. This is a drawing warning only — the layout is
          schematic and never affects scheduling or availability.
        </Alert>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
        <Stack spacing={2} sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
          <Box>
            <Typography variant="h6" component="h2" gutterBottom>
              Surfaces
            </Typography>
            {orderedSurfaces.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No surfaces have been added to this venue yet. Add surfaces first, then arrange
                them here.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {orderedSurfaces.map((surface) => {
                  const isPlaced = placedIds.has(surface.id);
                  return (
                    <Stack
                      key={surface.id}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                        <Typography fontWeight={600} noWrap>
                          {surface.name}
                        </Typography>
                        {!surface.isActive && (
                          <Chip
                            size="small"
                            color="default"
                            label="Archived — hidden from public map"
                            sx={{ alignSelf: "flex-start" }}
                          />
                        )}
                      </Stack>
                      {isPlaced ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color="inherit"
                          onClick={() => removeSurface(surface.id)}
                          disabled={isPending}
                        >
                          Remove
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => placeSurface(surface.id)}
                          disabled={isPending || !surface.isActive}
                        >
                          Place
                        </Button>
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Box>

          <Divider />

          <Box>
            <Typography variant="h6" component="h2" gutterBottom>
              Landmark labels
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="Label text"
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                slotProps={{ htmlInput: { maxLength: MAX_LABEL_LENGTH } }}
                helperText={`Entrances, lobby, parking… (max ${MAX_LABEL_LENGTH} characters, ${MAX_LABELS} labels)`}
                disabled={isPending || placingLabel !== null}
                fullWidth
              />
              <Button
                variant="outlined"
                onClick={startLabelPlacement}
                disabled={
                  isPending ||
                  placingLabel !== null ||
                  !labelDraft.trim() ||
                  labels.length >= MAX_LABELS
                }
                sx={{ alignSelf: "flex-start", whiteSpace: "nowrap" }}
              >
                Add label
              </Button>
            </Stack>
            {placingLabel !== null && (
              <Alert
                severity="info"
                sx={{ mt: 1 }}
                action={
                  <Button color="inherit" size="small" onClick={() => setPlacingLabel(null)}>
                    Cancel
                  </Button>
                }
              >
                Click the map to place “{placingLabel}”.
              </Alert>
            )}
            {labels.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {labels.map((label, index) => (
                  <Stack
                    key={`${label.text}-${index}`}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        cursor: "pointer",
                        fontWeight: selection?.kind === "label" && selection.index === index ? 700 : 400,
                      }}
                      onClick={() => setSelection({ kind: "label", index })}
                    >
                      {label.text}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`Delete label ${label.text}`}
                      onClick={() => deleteLabel(index)}
                      disabled={isPending}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>

        <Stack spacing={1.5} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ minHeight: 40 }}
          >
            {selectedSurface && (
              <>
                <Typography variant="body2" fontWeight={600}>
                  {selectedSurfaceName}
                </Typography>
                <Chip size="small" label={`${selectedSurface.rotation}°`} />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Rotate90DegreesCwOutlinedIcon />}
                  onClick={rotateSelectedSurface}
                  disabled={isPending}
                >
                  Rotate 90°
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => removeSurface(selectedSurface.surfaceId)}
                  disabled={isPending}
                >
                  Remove from map
                </Button>
              </>
            )}
            {selection?.kind === "label" && selectedLabel && (
              <>
                <Typography variant="body2" fontWeight={600} noWrap>
                  Label: {selectedLabel.text}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => deleteLabel(selection.index)}
                  disabled={isPending}
                >
                  Delete label
                </Button>
              </>
            )}
            {!selectedSurface && selection?.kind !== "label" && (
              <Typography variant="body2" color="text.secondary">
                Select a surface or label on the map to move, resize, or rotate it.
              </Typography>
            )}
          </Stack>

          <Box
            sx={{
              borderRadius: 2,
              overflow: "hidden",
              cursor: placingLabel !== null ? "crosshair" : "default",
            }}
          >
            <VenueLayoutCanvas
              layout={{ surfaces: placed, labels }}
              surfaceNames={surfaceNames}
              archivedSurfaceIds={archivedSurfaceIds}
              selectedSurfaceId={selection?.kind === "surface" ? selection.surfaceId : null}
              selectedLabelIndex={selection?.kind === "label" ? selection.index : null}
              onSurfacePointerDown={handleSurfacePointerDown}
              onLabelPointerDown={handleLabelPointerDown}
              onResizeHandlePointerDown={handleResizePointerDown}
              onCanvasPointerDown={handleCanvasPointerDown}
              onCanvasPointerMove={handleCanvasPointerMove}
              onCanvasPointerUp={handleCanvasPointerUp}
              svgRef={svgRef}
              style={{ touchAction: "none" }}
              ariaLabel="Venue layout editor canvas"
            />
          </Box>

          <Typography variant="body2" color="text.secondary">
            The map is schematic only — placement, size, and overlap never affect scheduling or
            availability. Drag a surface to move it, drag the corner handle to resize, and use
            Rotate 90° to turn it.
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="contained" onClick={handleSave} disabled={isPending}>
              Save layout
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setConfirmClearOpen(true)}
              disabled={isPending || !hasSavedLayout}
            >
              Clear layout
            </Button>
          </Stack>
        </Stack>
      </Stack>

      <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)}>
        <DialogTitle>Clear venue layout?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This removes the saved facility map. The public rink profile will fall back to the
            standard surface list. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleClearLayout} disabled={isPending}>
            Clear layout
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
