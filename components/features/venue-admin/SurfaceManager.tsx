"use client";

/**
 * SurfaceManager — editable per-venue surface administration (feature 006,
 * US1 / T013), replacing the read-only IceSurfaceManager on the venue-admin
 * surfaces page.
 *
 * - Lists every surface (including archived) with type, status, and the
 *   effective whole-surface label.
 * - Create/edit dialog (name, type, capacity, notes, display order,
 *   whole-surface label) via createIceSurface / updateIceSurface /
 *   setWholeSurfaceLabel.
 * - Archive with the FR-007 refusal: the server's error and
 *   `details.futureBookings` are surfaced verbatim in an Alert; Restore
 *   re-activates an archived surface.
 * - "Apply segmentation preset" (FR-004) — surface types without a preset
 *   show the server's friendly no-preset message.
 * - Per-surface and venue-wide operating hours (FR-002) via
 *   setOperatingHours / deleteOperatingHours.
 * - Each surface expands into the drawn SegmentationEditor.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  archiveIceSurface,
  createIceSurface,
  deleteOperatingHours,
  setOperatingHours,
  updateIceSurface,
} from "@/lib/actions/venue-schedules";
import {
  applySegmentationPreset,
  setWholeSurfaceLabel,
} from "@/lib/actions/venue-surfaces";
import { getWholeSurfaceDefaultLabel } from "@/lib/utils/segment-presets";
import { SURFACE_TYPES } from "@/lib/utils/validation";
import {
  FutureBookingList,
  parseBookingDetails,
  SegmentationEditor,
  type BookingSummary,
} from "@/components/features/venue-admin/SegmentationEditor";
import type { CoexistencePair, SegmentView } from "@/types/segments";

type SurfaceTypeValue = (typeof SURFACE_TYPES)[number];

const SURFACE_TYPE_LABELS: Record<SurfaceTypeValue, string> = {
  ICE: "Ice",
  STUDIO: "Studio",
  ROOM: "Room",
  DRYLAND: "Dryland",
  TURF: "Turf",
  COURT: "Court",
  FIELD: "Field",
  OTHER: "Other",
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type FormMessage = { severity: "success" | "info" | "error"; text: string };

export interface SurfaceAdminView {
  id: string;
  name: string;
  surfaceType: SurfaceTypeValue;
  capacity: number | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  displayOrder: number;
  /** The stored custom label; null when the surface-type default applies. */
  customWholeLabel: string | null;
  /** Effective whole-surface display label. */
  wholeLabel: string;
  segments: SegmentView[];
  coexistence: CoexistencePair[];
}

export interface OperatingHourView {
  id: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  status: string;
  label: string | null;
  surfaceId: string | null;
}

interface SurfaceManagerProps {
  organizationId: string;
  venueId: string;
  surfaces: SurfaceAdminView[];
  operatingHours: OperatingHourView[];
}

export function SurfaceManager({
  organizationId,
  venueId,
  surfaces,
  operatingHours,
}: SurfaceManagerProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ surface: SurfaceAdminView | null } | null>(null);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [archiveErrors, setArchiveErrors] = useState<
    Record<string, { message: string; bookings: BookingSummary[] }>
  >({});
  const [presetMessages, setPresetMessages] = useState<Record<string, FormMessage>>({});
  const [pending, startTransition] = useTransition();

  const venueHours = operatingHours.filter((hour) => hour.surfaceId === null);

  const clearArchiveError = (surfaceId: string) => {
    setArchiveErrors((prev) => {
      const next = { ...prev };
      delete next[surfaceId];
      return next;
    });
  };

  const clearPresetMessage = (surfaceId: string) => {
    setPresetMessages((prev) => {
      const next = { ...prev };
      delete next[surfaceId];
      return next;
    });
  };

  const handleArchive = (surface: SurfaceAdminView) => {
    startTransition(async () => {
      clearArchiveError(surface.id);
      const result = await archiveIceSurface({
        organizationId,
        venueId,
        surfaceId: surface.id,
      });
      if (!result.success) {
        // FR-007: surface the refusal and the affected bookings verbatim.
        setArchiveErrors((prev) => ({
          ...prev,
          [surface.id]: {
            message: result.error,
            bookings: parseBookingDetails(result.details, "futureBookings"),
          },
        }));
        return;
      }
      setMessage({ severity: "success", text: `Archived ${surface.name}.` });
      router.refresh();
    });
  };

  const handleRestore = (surface: SurfaceAdminView) => {
    startTransition(async () => {
      const result = await updateIceSurface({
        organizationId,
        venueId,
        surfaceId: surface.id,
        name: surface.name,
        surfaceType: surface.surfaceType,
        capacity: surface.capacity ?? undefined,
        isDefault: surface.isDefault,
        isActive: true,
        displayOrder: surface.displayOrder,
        notes: surface.notes ?? undefined,
      });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      setMessage({ severity: "success", text: `Restored ${surface.name}.` });
      router.refresh();
    });
  };

  const handleApplyPreset = (surface: SurfaceAdminView) => {
    startTransition(async () => {
      clearPresetMessage(surface.id);
      const result = await applySegmentationPreset({ surfaceId: surface.id });
      if (!result.success) {
        setPresetMessages((prev) => ({
          ...prev,
          [surface.id]: { severity: "error", text: result.error },
        }));
        return;
      }
      if (!result.data.applied) {
        // Friendly no-preset message for surface types without one.
        setPresetMessages((prev) => ({
          ...prev,
          [surface.id]: {
            severity: "info",
            text:
              result.data.message ??
              "This surface type has no segmentation preset — the whole surface stays bookable as-is.",
          },
        }));
        return;
      }
      const created = result.data.createdSegmentCount;
      setPresetMessages((prev) => ({
        ...prev,
        [surface.id]: {
          severity: "success",
          text:
            created === 0
              ? "Preset already applied — every preset zone is in place."
              : `Preset applied — ${created} zone${created === 1 ? "" : "s"} created.`,
        },
      }));
      router.refresh();
    });
  };

  return (
    <Stack spacing={4}>
      <Card aria-labelledby="surfaces-heading">
        <CardContent>
          <Stack spacing={2}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
              flexWrap="wrap"
              useFlexGap
            >
              <Typography id="surfaces-heading" variant="h6" component="h2">
                Surfaces
              </Typography>
              <Button
                variant="contained"
                onClick={() => setDialog({ surface: null })}
                sx={{ minHeight: 44 }}
              >
                Add surface
              </Button>
            </Stack>

            {message ? (
              <Alert severity={message.severity} onClose={() => setMessage(null)}>
                {message.text}
              </Alert>
            ) : null}

            {surfaces.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No surfaces yet — add your first sheet, court, or room.
              </Typography>
            ) : (
              <Box>
                {surfaces.map((surface) => {
                  const archiveError = archiveErrors[surface.id];
                  const presetMessage = presetMessages[surface.id];
                  return (
                    <Accordion key={surface.id} disableGutters>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          flexWrap="wrap"
                          useFlexGap
                          sx={{ pr: 1 }}
                        >
                          <Typography fontWeight={700}>{surface.name}</Typography>
                          <Chip
                            size="small"
                            label={SURFACE_TYPE_LABELS[surface.surfaceType] ?? surface.surfaceType}
                          />
                          <Chip
                            size="small"
                            color={surface.isActive ? "success" : "default"}
                            label={surface.isActive ? "Active" : "Archived"}
                          />
                          <Typography variant="body2" color="text.secondary">
                            Whole surface: {surface.wholeLabel}
                          </Typography>
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Stack spacing={2}>
                          {surface.capacity || surface.notes ? (
                            <Typography variant="body2" color="text.secondary">
                              {[
                                surface.capacity ? `Capacity ${surface.capacity}` : null,
                                surface.notes,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </Typography>
                          ) : null}

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button
                              variant="outlined"
                              onClick={() => setDialog({ surface })}
                              sx={{ minHeight: 44 }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outlined"
                              onClick={() => handleApplyPreset(surface)}
                              disabled={pending}
                              sx={{ minHeight: 44 }}
                            >
                              Apply segmentation preset
                            </Button>
                            {surface.isActive ? (
                              <Button
                                variant="outlined"
                                color="warning"
                                onClick={() => handleArchive(surface)}
                                disabled={pending}
                                sx={{ minHeight: 44 }}
                              >
                                Archive
                              </Button>
                            ) : (
                              <Button
                                variant="outlined"
                                color="success"
                                onClick={() => handleRestore(surface)}
                                disabled={pending}
                                sx={{ minHeight: 44 }}
                              >
                                Restore
                              </Button>
                            )}
                          </Stack>

                          {presetMessage ? (
                            <Alert
                              severity={presetMessage.severity}
                              onClose={() => clearPresetMessage(surface.id)}
                            >
                              {presetMessage.text}
                            </Alert>
                          ) : null}

                          {archiveError ? (
                            <Alert
                              severity="error"
                              onClose={() => clearArchiveError(surface.id)}
                            >
                              {archiveError.message}
                              <FutureBookingList bookings={archiveError.bookings} />
                            </Alert>
                          ) : null}

                          <Divider />
                          <Typography variant="subtitle1" fontWeight={600}>
                            Zones
                          </Typography>
                          <SegmentationEditor
                            surfaceId={surface.id}
                            wholeLabel={surface.wholeLabel}
                            segments={surface.segments}
                            coexistence={surface.coexistence}
                          />

                          <Divider />
                          <Typography variant="subtitle1" fontWeight={600}>
                            Surface hours
                          </Typography>
                          <HoursSection
                            organizationId={organizationId}
                            venueId={venueId}
                            surfaceId={surface.id}
                            rows={operatingHours.filter(
                              (hour) => hour.surfaceId === surface.id
                            )}
                          />
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card aria-labelledby="venue-hours-heading">
        <CardContent>
          <Stack spacing={2}>
            <Typography id="venue-hours-heading" variant="h6" component="h2">
              Venue-wide operating hours
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Bookings outside these hours warn at scheduling time — they are never hard-blocked.
            </Typography>
            <HoursSection
              organizationId={organizationId}
              venueId={venueId}
              surfaceId={null}
              rows={venueHours}
            />
          </Stack>
        </CardContent>
      </Card>

      {dialog ? (
        <SurfaceDialog
          organizationId={organizationId}
          venueId={venueId}
          surface={dialog.surface}
          onClose={(saved) => {
            const wasEdit = dialog.surface !== null;
            setDialog(null);
            if (saved) {
              setMessage({
                severity: "success",
                text: wasEdit ? "Surface updated." : "Surface created.",
              });
              router.refresh();
            }
          }}
        />
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

interface SurfaceDialogProps {
  organizationId: string;
  venueId: string;
  /** null = create. */
  surface: SurfaceAdminView | null;
  onClose: (saved: boolean) => void;
}

function SurfaceDialog({ organizationId, venueId, surface, onClose }: SurfaceDialogProps) {
  const [surfaceType, setSurfaceType] = useState<SurfaceTypeValue>(
    surface?.surfaceType ?? "ICE"
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const capacityRaw = String(formData.get("capacity") ?? "").trim();
    const displayOrderRaw = String(formData.get("displayOrder") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const wholeLabel = String(formData.get("wholeLabel") ?? "").trim();

    setSaving(true);
    setError(null);
    void (async () => {
      const base = {
        organizationId,
        venueId,
        name,
        surfaceType,
        capacity: capacityRaw ? Number(capacityRaw) : undefined,
        displayOrder: displayOrderRaw ? Number(displayOrderRaw) : 0,
        notes: notes || undefined,
        // Pass current flags through so an edit never clobbers them with
        // the schema defaults.
        isDefault: surface?.isDefault ?? false,
        isActive: surface?.isActive ?? true,
      };
      const result = surface
        ? await updateIceSurface({ ...base, surfaceId: surface.id })
        : await createIceSurface(base);
      if (!result.success) {
        setSaving(false);
        setError(result.error);
        return;
      }

      // Whole-surface label lives on its own action (research R2); an empty
      // value resets to the surface-type default.
      const currentLabel = surface?.customWholeLabel ?? "";
      if (wholeLabel !== currentLabel) {
        const labelResult = await setWholeSurfaceLabel({
          surfaceId: result.data.surfaceId,
          wholeLabel,
        });
        if (!labelResult.success) {
          setSaving(false);
          setError(labelResult.error);
          return;
        }
      }

      setSaving(false);
      onClose(true);
    })();
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={saving ? undefined : () => onClose(false)}>
      <DialogTitle>{surface ? `Edit ${surface.name}` : "Add surface"}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              name="name"
              label="Surface name"
              required
              autoFocus={!surface}
              defaultValue={surface?.name ?? ""}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <TextField
              name="surfaceType"
              label="Surface type"
              select
              value={surfaceType}
              onChange={(event) => setSurfaceType(event.target.value as SurfaceTypeValue)}
            >
              {SURFACE_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {SURFACE_TYPE_LABELS[type]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              name="capacity"
              label="Capacity (optional)"
              type="number"
              defaultValue={surface?.capacity ?? ""}
              slotProps={{ htmlInput: { min: 1, max: 100000 } }}
            />
            <TextField
              name="displayOrder"
              label="Display order"
              type="number"
              defaultValue={surface?.displayOrder ?? 0}
              slotProps={{ htmlInput: { min: 0, max: 1000 } }}
              helperText="Lower numbers list first."
            />
            <TextField
              name="wholeLabel"
              label="Whole-surface label (optional)"
              defaultValue={surface?.customWholeLabel ?? ""}
              placeholder={getWholeSurfaceDefaultLabel(surfaceType)}
              helperText={`How the full surface appears in booking pickers. Leave empty for the default ("${getWholeSurfaceDefaultLabel(surfaceType)}").`}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <TextField
              name="notes"
              label="Notes (optional)"
              multiline
              minRows={2}
              defaultValue={surface?.notes ?? ""}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose(false)} disabled={saving} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving} sx={{ minHeight: 44 }}>
            {saving ? "Saving…" : surface ? "Save surface" : "Create surface"}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Operating hours (venue-wide and per-surface)
// ---------------------------------------------------------------------------

interface HoursSectionProps {
  organizationId: string;
  venueId: string;
  /** null = venue-wide hours. */
  surfaceId: string | null;
  rows: OperatingHourView[];
}

function HoursSection({ organizationId, venueId, surfaceId, rows }: HoursSectionProps) {
  const router = useRouter();
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [pending, startTransition] = useTransition();

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const dayOfWeek = Number(formData.get("dayOfWeek") ?? 0);
    const opensAt = String(formData.get("opensAt") ?? "");
    const closesAt = String(formData.get("closesAt") ?? "");

    if (!opensAt || !closesAt) {
      setMessage({ severity: "error", text: "Choose opening and closing times." });
      return;
    }
    // "HH:MM" strings compare lexicographically in time order.
    if (closesAt <= opensAt) {
      setMessage({ severity: "error", text: "Closing time must be after opening time." });
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const result = await setOperatingHours({
        organizationId,
        venueId,
        surfaceId: surfaceId ?? undefined,
        dayOfWeek,
        opensAt,
        closesAt,
        effectiveStartDate: new Date(),
      });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      form.reset();
      setMessage({ severity: "success", text: "Hours added." });
      router.refresh();
    });
  };

  const handleDelete = (operatingHourId: string) => {
    startTransition(async () => {
      setMessage(null);
      const result = await deleteOperatingHours({ organizationId, venueId, operatingHourId });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={1.5}>
      {message ? (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {surfaceId
            ? "No hours set for this surface — venue-wide hours apply."
            : "No venue-wide hours configured yet."}
        </Typography>
      ) : (
        <Stack>
          {rows.map((hour) => (
            <Stack
              key={hour.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ minHeight: 44 }}
            >
              <Typography sx={{ flexGrow: 1 }}>
                {DAY_NAMES[hour.dayOfWeek] ?? "Day"} · {hour.opensAt}–{hour.closesAt}
                {hour.label ? ` · ${hour.label}` : ""}
              </Typography>
              {hour.status !== "OPEN" ? <Chip size="small" label={hour.status} /> : null}
              <IconButton
                aria-label={`Delete ${DAY_NAMES[hour.dayOfWeek] ?? "day"} hours`}
                onClick={() => handleDelete(hour.id)}
                disabled={pending}
                sx={{ width: 44, height: 44 }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}

      <Stack
        component="form"
        onSubmit={handleAdd}
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        useFlexGap
        sx={{ alignItems: { xs: "stretch", sm: "center" }, flexWrap: "wrap" }}
      >
        <TextField
          name="dayOfWeek"
          label="Day"
          select
          defaultValue={1}
          size="small"
          sx={{ minWidth: 140 }}
        >
          {DAY_NAMES.map((day, index) => (
            <MenuItem key={day} value={index}>
              {day}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          name="opensAt"
          label="Opens"
          type="time"
          required
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          name="closesAt"
          label="Closes"
          type="time"
          required
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button type="submit" variant="outlined" disabled={pending} sx={{ minHeight: 44 }}>
          Add hours
        </Button>
      </Stack>
    </Stack>
  );
}
