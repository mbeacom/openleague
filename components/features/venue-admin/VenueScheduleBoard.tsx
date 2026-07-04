"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { TZDate } from "@date-fns/tz";
import {
  createScheduleBlock,
  getVenueScheduleBoard,
  updateScheduleBlock,
} from "@/lib/actions/venue-schedules";
import {
  REGISTRATION_MODES,
  VENUE_SCHEDULE_ACTIVITY_TYPES,
  type VenueScheduleBlockInput,
} from "@/lib/utils/validation";
import { formatDateTimeLocalInput, parseDateTimeLocalToUtc } from "@/lib/utils/date";
import type { BookingConflict, VenueBookingView } from "@/types/segments";

/** Surface option (with its active segments) for the block dialogs. */
export interface ScheduleBoardSurface {
  id: string;
  name: string;
  isActive: boolean;
  segments: Array<{ id: string; name: string }>;
}

/** Full editable fields of a non-archived schedule block (edit dialog source). */
export interface ScheduleBoardBlock {
  id: string;
  title: string;
  description: string | null;
  activityType: string;
  audience: string;
  visibility: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  recurrenceRule: string | null;
  recurrenceStartDate: Date | null;
  recurrenceEndDate: Date | null;
  capacity: number | null;
  priceAmount: number | null;
  priceCurrency: string;
  priceLabel: string | null;
  registrationMode: string;
  externalRegistrationUrl: string | null;
  surfaceId: string | null;
  segmentId: string | null;
  segmentName: string | null;
}

interface VenueScheduleBoardProps {
  organizationId: string;
  venueId: string;
  /** IANA zone all board days and times render in (the venue's timezone). */
  timeZone: string;
  /** Venue-timezone Sunday-midnight start of the initially displayed week (server-computed). */
  initialFrom: Date;
  initialBookings: VenueBookingView[];
  initialSurfaces: ScheduleBoardSurface[];
  initialBlocks: ScheduleBoardBlock[];
}

type ActivityType = (typeof VENUE_SCHEDULE_ACTIVITY_TYPES)[number];
type RegistrationMode = (typeof REGISTRATION_MODES)[number];

/** Source-type chip per booking origin (FR-021) — one distinct color each. */
const SOURCE_CHIPS: Record<
  VenueBookingView["source"],
  { label: string; color: "primary" | "secondary" | "info" | "warning" | "success" }
> = {
  scheduleBlock: { label: "Block", color: "primary" },
  seasonGame: { label: "Season game", color: "secondary" },
  eventGame: { label: "Event game", color: "info" },
  event: { label: "Team event", color: "warning" },
  practice: { label: "Practice", color: "success" },
};

/**
 * Add whole days in the venue's timezone, preserving the midnight anchor
 * across DST transitions (a fixed-milliseconds step would drift by an hour).
 */
function addDaysInZone(date: Date, days: number, timeZone: string): Date {
  const zoned = new TZDate(date.getTime(), timeZone);
  return new Date(
    new TZDate(
      zoned.getFullYear(),
      zoned.getMonth(),
      zoned.getDate() + days,
      zoned.getHours(),
      zoned.getMinutes(),
      zoned.getSeconds(),
      timeZone
    ).getTime()
  );
}

/** YYYY-MM-DD calendar-day key of an instant in the venue's timezone. */
function dateKeyInZone(date: Date, timeZone: string): string {
  const zoned = new TZDate(date.getTime(), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`;
}

function formatTime(date: Date, timeZone: string): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone });
}

function formatTimeRange(startAt: Date, endAt: Date | null, timeZone: string): string {
  return endAt
    ? `${formatTime(startAt, timeZone)} – ${formatTime(endAt, timeZone)}`
    : formatTime(startAt, timeZone);
}

/** "OPEN_SKATE" -> "Open skate" for enum selects and conflict lines. */
function enumLabel(value: string): string {
  const words = value.split("_").join(" ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function extractConflicts(details: unknown): BookingConflict[] | null {
  if (details && typeof details === "object" && "conflicts" in details) {
    const conflicts = (details as { conflicts: unknown }).conflicts;
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      return conflicts as BookingConflict[];
    }
  }
  return null;
}

/**
 * Venue schedule board (FR-021/SC-006): a week view of every booking at the
 * venue from all five sources — schedule blocks, season games, signup-event
 * games, team calendar events, and venue-attached practices — grouped by day
 * and labeled by source, with block create/edit dialogs (segment-aware).
 *
 * Recurring block occurrences share the block's id, so rows are keyed by
 * id + startAt.
 */
export function VenueScheduleBoard({
  organizationId,
  venueId,
  timeZone,
  initialFrom,
  initialBookings,
  initialSurfaces,
  initialBlocks,
}: VenueScheduleBoardProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => new Date(initialFrom));
  const [bookings, setBookings] = useState(initialBookings);
  const [surfaces, setSurfaces] = useState(initialSurfaces);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; block: ScheduleBoardBlock | null }>({
    open: false,
    block: null,
  });

  const surfaceNames = useMemo(
    () => new Map(surfaces.map((surface) => [surface.id, surface.name])),
    [surfaces]
  );
  const blocksById = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);

  // Bucket by the booking's YYYY-MM-DD calendar day in the VENUE timezone,
  // so viewers in other zones see rows filed under the rink's wall-clock day
  // (and DST shifts can't mis-file rows). Rows arrive sorted by startAt, and
  // stable pushes keep each day chronological. Bookings that started before
  // the window (overlapping in from last week) clamp into the first day.
  const days = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, index) => ({
      date: addDaysInZone(weekStart, index, timeZone),
      bookings: [] as VenueBookingView[],
    }));
    const bucketsByKey = new Map(
      buckets.map((bucket) => [dateKeyInZone(bucket.date, timeZone), bucket])
    );
    for (const booking of bookings) {
      const bucket = bucketsByKey.get(dateKeyInZone(booking.startAt, timeZone)) ?? buckets[0];
      bucket.bookings.push(booking);
    }
    return buckets;
  }, [weekStart, bookings, timeZone]);

  const loadWeek = (nextStart: Date) => {
    startTransition(async () => {
      setLoadError(null);
      const result = await getVenueScheduleBoard({
        organizationId,
        venueId,
        from: nextStart,
        to: addDaysInZone(nextStart, 7, timeZone),
      });
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      setWeekStart(nextStart);
      setBookings(result.data.bookings);
      setSurfaces(result.data.surfaces);
      setBlocks(result.data.blocks);
    });
  };

  const weekLabel = `${weekStart.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    timeZone,
  })} – ${addDaysInZone(weekStart, 6, timeZone).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  })}`;

  return (
    <Card aria-labelledby="venue-schedule-board-heading">
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
            justifyContent="space-between"
            useFlexGap
          >
            <Typography id="venue-schedule-board-heading" variant="h6" component="h2">
              Schedule board
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <IconButton
                aria-label="Previous week"
                onClick={() => loadWeek(addDaysInZone(weekStart, -7, timeZone))}
                disabled={isLoading}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Typography variant="body2" fontWeight={600} sx={{ textAlign: "center", minWidth: 140 }}>
                {weekLabel}
              </Typography>
              <IconButton
                aria-label="Next week"
                onClick={() => loadWeek(addDaysInZone(weekStart, 7, timeZone))}
                disabled={isLoading}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <ChevronRightIcon />
              </IconButton>
              {isLoading ? <CircularProgress size={18} aria-label="Loading week" /> : null}
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setDialog({ open: true, block: null })}
                sx={{ minHeight: 44 }}
              >
                New block
              </Button>
            </Stack>
          </Stack>

          {loadError ? <Alert severity="error">{loadError}</Alert> : null}

          <Stack spacing={2} sx={{ opacity: isLoading ? 0.6 : 1 }}>
            {days.map((day) => (
              <Box key={day.date.toISOString()}>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  {day.date.toLocaleDateString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone,
                  })}
                </Typography>
                {day.bookings.length > 0 ? (
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {day.bookings.map((booking) => {
                      const chip = SOURCE_CHIPS[booking.source];
                      const block =
                        booking.source === "scheduleBlock" ? blocksById.get(booking.id) : undefined;
                      const surfaceLabel = booking.surfaceId
                        ? surfaceNames.get(booking.surfaceId) ?? "Surface"
                        : "Venue-wide";
                      return (
                        <Stack
                          key={`${booking.id}-${booking.startAt.getTime()}`}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          flexWrap="wrap"
                          useFlexGap
                          sx={{ borderLeft: 3, borderColor: `${chip.color}.main`, pl: 1.5, py: 0.5 }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontVariantNumeric: "tabular-nums", minWidth: { sm: 148 } }}
                          >
                            {formatTimeRange(booking.startAt, booking.endAt, timeZone)}
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {booking.title}
                          </Typography>
                          <Chip size="small" variant="outlined" label={surfaceLabel} />
                          {booking.segmentName ? (
                            <Chip size="small" variant="outlined" label={booking.segmentName} />
                          ) : null}
                          <Chip size="small" color={chip.color} label={chip.label} />
                          {block && block.status !== "PUBLISHED" ? (
                            <Chip size="small" variant="outlined" label={enumLabel(block.status)} />
                          ) : null}
                          {block ? (
                            <Button
                              size="small"
                              onClick={() => setDialog({ open: true, block })}
                              sx={{ ml: "auto" }}
                            >
                              Edit
                            </Button>
                          ) : null}
                        </Stack>
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
                    No bookings
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Stack>
      </CardContent>

      <BlockDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, block: null })}
        organizationId={organizationId}
        venueId={venueId}
        timeZone={timeZone}
        surfaces={surfaces}
        block={dialog.block}
        onSaved={() => loadWeek(weekStart)}
      />
    </Card>
  );
}

interface BlockDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  venueId: string;
  /** IANA zone the dialog's wall-clock times are entered/displayed in. */
  timeZone: string;
  surfaces: ScheduleBoardSurface[];
  /** null = create a new block. */
  block: ScheduleBoardBlock | null;
  onSaved: () => void;
}

/**
 * Stateless Dialog wrapper (matching GameForm): the body owns all form state
 * and is mounted as Dialog children, so it unmounts on close and every open
 * starts fresh for the current target block.
 */
function BlockDialog({ open, onClose, ...bodyProps }: BlockDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <BlockDialogBody key={bodyProps.block?.id ?? "new"} onClose={onClose} {...bodyProps} />
    </Dialog>
  );
}

function BlockDialogBody({
  onClose,
  organizationId,
  venueId,
  timeZone,
  surfaces,
  block,
  onSaved,
}: Omit<BlockDialogProps, "open">) {
  const isEdit = Boolean(block);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<BookingConflict[] | null>(null);
  const [surfaceId, setSurfaceId] = useState(block?.surfaceId ?? "");
  const [segmentId, setSegmentId] = useState(block?.segmentId ?? "");
  const [activityType, setActivityType] = useState<ActivityType>(
    (block?.activityType as ActivityType) ?? "OPEN_SKATE"
  );
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">(
    block?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"
  );
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>(
    (block?.registrationMode as RegistrationMode) ?? "INFO_ONLY"
  );

  // Keep an inactive surface selectable while editing a block that still
  // references it (archiving is refused only with future bookings).
  const surfaceOptions = surfaces.filter(
    (surface) => surface.isActive || surface.id === block?.surfaceId
  );
  const activeSegments = surfaces.find((surface) => surface.id === surfaceId)?.segments ?? [];
  // Same for a deactivated segment the block already points at.
  const segmentOptions =
    segmentId && block?.segmentId === segmentId && !activeSegments.some((s) => s.id === segmentId)
      ? [{ id: segmentId, name: block.segmentName ?? "Current segment" }, ...activeSegments]
      : activeSegments;

  const handleSurfaceChange = (nextSurfaceId: string) => {
    setSurfaceId(nextSurfaceId);
    // Segments belong to a surface — a stale selection would be rejected server-side.
    setSegmentId("");
  };

  const handleSubmit = (formData: FormData) => {
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    // Wall-clock inputs are interpreted in the VENUE's timezone, matching how
    // the board renders every booking.
    const startsAt = parseDateTimeLocalToUtc(text("startsAt"), timeZone);
    const endsAt = parseDateTimeLocalToUtc(text("endsAt"), timeZone);
    if (!startsAt || !endsAt) {
      setError("Enter a valid start and end time.");
      return;
    }
    if (endsAt <= startsAt) {
      setError("End time must be after the start time.");
      return;
    }
    const capacityText = text("capacity");
    const priceText = text("priceAmount");

    const payload: VenueScheduleBlockInput & { segmentId?: string | null } = {
      organizationId,
      venueId,
      surfaceId: surfaceId || undefined,
      segmentId: segmentId || null,
      title: text("title"),
      description: text("description") || undefined,
      activityType,
      status,
      startsAt,
      endsAt,
      capacity: capacityText ? Number(capacityText) : undefined,
      priceAmount: priceText ? Number(priceText) : undefined,
      priceLabel: text("priceLabel") || undefined,
      registrationMode,
      externalRegistrationUrl:
        registrationMode === "EXTERNAL_REGISTRATION"
          ? text("externalRegistrationUrl")
          : undefined,
      // Preserve fields the dialog doesn't edit so updates never clobber them.
      ...(block
        ? {
            audience: block.audience as VenueScheduleBlockInput["audience"],
            visibility: block.visibility as VenueScheduleBlockInput["visibility"],
            recurrenceRule: block.recurrenceRule ?? undefined,
            recurrenceStartDate: block.recurrenceStartDate ?? undefined,
            recurrenceEndDate: block.recurrenceEndDate ?? undefined,
            priceCurrency: block.priceCurrency,
          }
        : {}),
    };

    startTransition(async () => {
      setError(null);
      setConflicts(null);
      const result = block
        ? await updateScheduleBlock({ ...payload, scheduleBlockId: block.id })
        : await createScheduleBlock(payload);

      if (!result.success) {
        const detected = extractConflicts(result.details);
        if (detected) {
          // Publishing over a conflict is a hard block (no override, unlike
          // game scheduling) — list the conflicts so staff can adjust.
          setConflicts(detected);
          return;
        }
        setError(result.error);
        return;
      }

      onSaved();
      onClose();
    });
  };

  return (
    <>
      <DialogTitle>{isEdit ? "Edit schedule block" : "New schedule block"}</DialogTitle>
      <Stack component="form" action={(formData: FormData) => handleSubmit(formData)}>
        <DialogContent>
          <Stack spacing={2}>
            {conflicts ? (
              <Alert severity="error">
                <AlertTitle>
                  This time conflicts with {conflicts.length} existing booking
                  {conflicts.length === 1 ? "" : "s"} at the venue
                </AlertTitle>
                {conflicts.map((conflict, index) => (
                  <Typography key={`${conflict.title}-${index}`} variant="body2">
                    {SOURCE_CHIPS[conflict.source].label}: {conflict.title}
                    {conflict.segmentName ? ` (${conflict.segmentName})` : ""} —{" "}
                    {conflict.startAt.toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone,
                    })}
                    {conflict.endAt ? ` – ${formatTime(conflict.endAt, timeZone)}` : ""}
                  </Typography>
                ))}
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Published blocks cannot overlap existing bookings. Adjust the time, surface, or
                  segment — or save as a draft.
                </Typography>
              </Alert>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            {block?.recurrenceRule ? (
              <Alert severity="info">
                This block repeats ({block.recurrenceRule}). Changes apply to the whole series.
              </Alert>
            ) : null}

            <TextField
              name="title"
              label="Title"
              required
              fullWidth
              defaultValue={block?.title ?? ""}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              select
              label="Activity type"
              required
              fullWidth
              value={activityType}
              onChange={(event) => setActivityType(event.target.value as ActivityType)}
            >
              {VENUE_SCHEDULE_ACTIVITY_TYPES.map((value) => (
                <MenuItem key={value} value={value}>
                  {enumLabel(value)}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Surface"
                fullWidth
                value={surfaceId}
                onChange={(event) => handleSurfaceChange(event.target.value)}
              >
                <MenuItem value="">Venue-wide</MenuItem>
                {surfaceOptions.map((surface) => (
                  <MenuItem key={surface.id} value={surface.id}>
                    {surface.name}
                  </MenuItem>
                ))}
              </TextField>
              {segmentOptions.length > 0 ? (
                <TextField
                  select
                  label="Segment"
                  fullWidth
                  value={segmentId}
                  onChange={(event) => setSegmentId(event.target.value)}
                >
                  <MenuItem value="">Whole surface</MenuItem>
                  {segmentOptions.map((segment) => (
                    <MenuItem key={segment.id} value={segment.id}>
                      {segment.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                name="startsAt"
                label="Starts"
                type="datetime-local"
                required
                fullWidth
                defaultValue={block ? formatDateTimeLocalInput(block.startsAt, timeZone) : ""}
                helperText={`Times are in ${timeZone}`}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                name="endsAt"
                label="Ends"
                type="datetime-local"
                required
                fullWidth
                defaultValue={block ? formatDateTimeLocalInput(block.endsAt, timeZone) : ""}
                helperText={`Times are in ${timeZone}`}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Status"
                fullWidth
                value={status}
                onChange={(event) => setStatus(event.target.value as "DRAFT" | "PUBLISHED")}
                helperText="Only published blocks hold time and appear publicly"
              >
                <MenuItem value="DRAFT">Draft</MenuItem>
                <MenuItem value="PUBLISHED">Published</MenuItem>
              </TextField>
              <TextField
                name="capacity"
                label="Capacity (optional)"
                type="number"
                fullWidth
                defaultValue={block?.capacity ?? ""}
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
              />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                name="priceAmount"
                label="Price in cents (optional)"
                type="number"
                fullWidth
                defaultValue={block?.priceAmount ?? ""}
                helperText="e.g. 1500 = $15.00"
                slotProps={{ htmlInput: { min: 0, step: 1 } }}
              />
              <TextField
                name="priceLabel"
                label="Price label (optional)"
                fullWidth
                defaultValue={block?.priceLabel ?? ""}
                placeholder="$15 / skater"
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </Stack>

            <TextField
              select
              label="Registration"
              fullWidth
              value={registrationMode}
              onChange={(event) => setRegistrationMode(event.target.value as RegistrationMode)}
            >
              {REGISTRATION_MODES.map((value) => (
                <MenuItem key={value} value={value}>
                  {enumLabel(value)}
                </MenuItem>
              ))}
            </TextField>
            {registrationMode === "EXTERNAL_REGISTRATION" ? (
              <TextField
                name="externalRegistrationUrl"
                label="Registration URL"
                type="url"
                required
                fullWidth
                defaultValue={block?.externalRegistrationUrl ?? ""}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            ) : null}

            <TextField
              name="description"
              label="Description (optional)"
              multiline
              minRows={2}
              fullWidth
              defaultValue={block?.description ?? ""}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isPending} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isPending} sx={{ minHeight: 44 }}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Create block"}
          </Button>
        </DialogActions>
      </Stack>
    </>
  );
}
