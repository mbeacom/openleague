"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { ScheduleFormat, SeasonPhaseType } from "@prisma/client";
import { DateField } from "@/components/ui/date";
import {
  createSeasonPhase,
  deleteSeasonPhase,
  updateSeasonPhase,
} from "@/lib/actions/seasons";
import { SCHEDULE_FORMAT_LABELS } from "@/lib/utils/sport-catalog";
import { SCHEDULE_FORMATS, SEASON_PHASE_TYPES } from "@/lib/utils/validation";

const PHASE_TYPE_LABELS: Record<SeasonPhaseType, string> = {
  PRE_SEASON: "Pre-season",
  REGULAR_SEASON: "Regular season",
  PLAYOFFS: "Playoffs",
  CUSTOM: "Custom",
};

export interface PhaseEditorPhase {
  id: string;
  name: string;
  type: SeasonPhaseType;
  sortOrder: number;
  startDate: Date;
  endDate: Date;
  format: ScheduleFormat | null;
  formatRounds: number | null;
  /** Games attached to the phase — a phase must be empty to be deletable. */
  gameCount: number;
}

interface PhaseEditorProps {
  seasonId: string;
  /** Phase dates must fall within the season range (also server-enforced). */
  seasonStartDate: Date;
  seasonEndDate: Date;
  phases: PhaseEditorPhase[];
}

// Season/phase dates are date-only values stored at UTC midnight.
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));

const dateInputValue = (date: Date) => new Date(date).toISOString().slice(0, 10);

/**
 * Season phases (FR-002): optional, ordered subdivisions (pre-season, regular
 * season, playoffs, custom) with their own date ranges and optional format
 * labels. Deleting is blocked while a phase has games — the server enforces
 * the same rule.
 */
export function PhaseEditor({ seasonId, seasonStartDate, seasonEndDate, phases }: PhaseEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formTarget, setFormTarget] = useState<{ phase: PhaseEditorPhase | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhaseEditorPhase | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const sorted = [...phases].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      setListError(null);
      const result = await deleteSeasonPhase({ phaseId: deleteTarget.id });
      setDeleteTarget(null);
      if (!result.success) {
        setListError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Phases</Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setFormTarget({ phase: null })}
              sx={{ minHeight: 44 }}
            >
              Add phase
            </Button>
          </Stack>

          {listError ? <Alert severity="error">{listError}</Alert> : null}

          {sorted.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No phases yet — optionally split the season into pre-season, regular season, and
              playoffs, each with its own date range.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {sorted.map((phase) => (
                <Stack
                  key={phase.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}
                >
                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="subtitle1">{phase.name}</Typography>
                      <Chip size="small" label={PHASE_TYPE_LABELS[phase.type]} />
                      {phase.format ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${SCHEDULE_FORMAT_LABELS[phase.format]}${
                            phase.format === "ROUND_ROBIN" && phase.formatRounds
                              ? ` · ${phase.formatRounds} round${phase.formatRounds === 1 ? "" : "s"}`
                              : ""
                          }`}
                        />
                      ) : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(phase.startDate)} – {formatDate(phase.endDate)}
                      {phase.gameCount > 0
                        ? ` · ${phase.gameCount} game${phase.gameCount === 1 ? "" : "s"}`
                        : ""}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      disabled={isPending}
                      onClick={() => setFormTarget({ phase })}
                      sx={{ minHeight: 44 }}
                    >
                      Edit
                    </Button>
                    <Tooltip
                      title={
                        phase.gameCount > 0
                          ? "Move or remove this phase's games before deleting it"
                          : ""
                      }
                    >
                      <span>
                        <Button
                          size="small"
                          color="error"
                          disabled={isPending || phase.gameCount > 0}
                          onClick={() => setDeleteTarget(phase)}
                          sx={{ minHeight: 44 }}
                        >
                          Delete
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </CardContent>

      {/* Add/edit dialog — body mounts fresh on each open (GameForm pattern). */}
      <Dialog
        open={Boolean(formTarget)}
        onClose={() => (isPending ? undefined : setFormTarget(null))}
        fullWidth
        maxWidth="sm"
      >
        {formTarget ? (
          <PhaseFormBody
            key={formTarget.phase?.id ?? "new"}
            seasonId={seasonId}
            seasonStartDate={seasonStartDate}
            seasonEndDate={seasonEndDate}
            nextSortOrder={
              sorted.length > 0 ? Math.max(...sorted.map((phase) => phase.sortOrder)) + 1 : 0
            }
            phase={formTarget.phase}
            onClose={() => setFormTarget(null)}
          />
        ) : null}
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => (isPending ? undefined : setDeleteTarget(null))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete this phase?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget
              ? `"${deleteTarget.name}" (${formatDate(deleteTarget.startDate)} – ${formatDate(
                  deleteTarget.endDate
                )}) is removed permanently. Games are unaffected — only empty phases can be deleted.`
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={isPending} sx={{ minHeight: 44 }}>
            Keep phase
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={isPending}
            sx={{ minHeight: 44 }}
          >
            {isPending ? "Working…" : "Delete phase"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

function PhaseFormBody({
  seasonId,
  seasonStartDate,
  seasonEndDate,
  nextSortOrder,
  phase,
  onClose,
}: {
  seasonId: string;
  seasonStartDate: Date;
  seasonEndDate: Date;
  nextSortOrder: number;
  phase: PhaseEditorPhase | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(phase);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = (name: string) => String(formData.get(name) ?? "").trim();

    const startDate = new Date(text("startDate"));
    const endDate = new Date(text("endDate"));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Enter a valid start and end date.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    if (startDate < new Date(seasonStartDate) || endDate > new Date(seasonEndDate)) {
      setError(
        `Phase dates must fall within the season (${formatDate(seasonStartDate)} – ${formatDate(
          seasonEndDate
        )}).`
      );
      return;
    }

    const type = text("type") as SeasonPhaseType;
    const formatText = text("format");
    const format = formatText ? (formatText as ScheduleFormat) : null;

    startTransition(async () => {
      setError(null);
      const result =
        isEdit && phase
          ? await updateSeasonPhase({
              phaseId: phase.id,
              name: text("name"),
              type,
              startDate,
              endDate,
              format,
            })
          : await createSeasonPhase({
              seasonId,
              name: text("name"),
              type,
              sortOrder: nextSortOrder,
              startDate,
              endDate,
              format,
            });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogTitle>{isEdit ? "Edit phase" : "Add phase"}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}

            <TextField
              name="name"
              label="Phase name"
              required
              defaultValue={phase?.name ?? ""}
              placeholder="Regular season"
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <TextField
              select
              name="type"
              label="Type"
              required
              defaultValue={phase?.type ?? "CUSTOM"}
            >
              {SEASON_PHASE_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {PHASE_TYPE_LABELS[type]}
                </MenuItem>
              ))}
            </TextField>
            {/* The season-end upper bound (former native `max`) is enforced by
                handleSubmit and the server; DateField exposes only `min`. */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <DateField
                name="startDate"
                label="Starts"
                required
                fullWidth
                defaultValue={phase ? dateInputValue(phase.startDate) : ""}
                min={dateInputValue(seasonStartDate)}
              />
              <DateField
                name="endDate"
                label="Ends"
                required
                fullWidth
                defaultValue={phase ? dateInputValue(phase.endDate) : ""}
                min={dateInputValue(seasonStartDate)}
              />
            </Stack>
            <TextField
              select
              name="format"
              label="Format label (optional)"
              defaultValue={phase?.format ?? ""}
              helperText="Optional — a label only; it never changes how games are scheduled"
            >
              <MenuItem value="">Not specified</MenuItem>
              {SCHEDULE_FORMATS.map((format) => (
                <MenuItem key={format} value={format}>
                  {SCHEDULE_FORMAT_LABELS[format]}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isPending} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isPending} sx={{ minHeight: 44 }}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add phase"}
          </Button>
        </DialogActions>
      </Stack>
    </>
  );
}
