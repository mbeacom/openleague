"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import type { ScheduleFormat } from "@prisma/client";
import { DateField, TimeField } from "@/components/ui/date";
import {
  generateRoundRobin,
  previewRoundRobin,
  type GenerationPreview,
} from "@/lib/actions/season-generation";
import { updateSeason, updateSeasonPhase } from "@/lib/actions/seasons";
import { GENERATIVE_FORMATS, SCHEDULE_FORMAT_LABELS } from "@/lib/utils/sport-catalog";
import { SCHEDULE_FORMATS, type GenerateRoundRobinInput } from "@/lib/utils/validation";
import { FALLBACK_TIME_ZONE, formatDateTimeInZone } from "@/lib/utils/date";

interface GenerationWizardProps {
  seasonId: string;
  /** Defaults for the generation date range. */
  seasonStartDate: Date;
  seasonEndDate: Date;
  /** Phases the format/generation may target ("Entire season" when empty). */
  phases: Array<{ id: string; name: string }>;
  /** League teams (with division membership) or administered teams. */
  teams: Array<{ id: string; name: string; divisionId?: string | null }>;
  /** League divisions — empty for team-owned seasons. */
  divisions: Array<{ id: string; name: string }>;
  venues: Array<{ id: string; name: string; timezone: string }>;
}

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const dateInputValue = (date: Date) => new Date(date).toISOString().slice(0, 10);

type Notice = { severity: "success" | "info"; text: string };

/**
 * Opt-in schedule generation (US2). Format only appears here — never on the
 * manual path (FR-005). Round robin is the one working generator; every other
 * format is presented as "label only" and selecting it merely records the
 * label via updateSeason/updateSeasonPhase (FR-006/007 — the system never
 * pretends to generate). Generation previews exactly what will be created
 * (FR-016) and creates DRAFT games for review before publishing (FR-017).
 */
export function GenerationWizard({
  seasonId,
  seasonStartDate,
  seasonEndDate,
  phases,
  teams,
  divisions,
  venues,
}: GenerationWizardProps) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
          >
            <Stack spacing={0.5}>
              <Typography variant="h6">Schedule generation</Typography>
              <Typography variant="body2" color="text.secondary">
                Optionally generate a round-robin schedule as draft games to review and publish, or
                record a format label for manually scheduled games.
              </Typography>
            </Stack>
            <Button
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              disabled={teams.length < 2}
              onClick={() => {
                setNotice(null);
                setOpen(true);
              }}
              sx={{ minHeight: 44, flexShrink: 0 }}
            >
              Generate games
            </Button>
          </Stack>
          {teams.length < 2 ? (
            <Typography variant="body2" color="text.secondary">
              At least two teams are needed to generate games.
            </Typography>
          ) : null}
          {notice ? (
            <Alert severity={notice.severity} onClose={() => setNotice(null)}>
              {notice.text}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        {open ? (
          <WizardBody
            seasonId={seasonId}
            seasonStartDate={seasonStartDate}
            seasonEndDate={seasonEndDate}
            phases={phases}
            teams={teams}
            divisions={divisions}
            venues={venues}
            onClose={() => setOpen(false)}
            onNotice={setNotice}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

type WizardStep = "format" | "settings" | "preview" | "done";

const STEP_INDEX: Record<Exclude<WizardStep, "done">, number> = {
  format: 0,
  settings: 1,
  preview: 2,
};

function WizardBody({
  seasonId,
  seasonStartDate,
  seasonEndDate,
  phases,
  teams,
  divisions,
  venues,
  onClose,
  onNotice,
}: GenerationWizardProps & {
  onClose: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<WizardStep>("format");
  const [error, setError] = useState<string | null>(null);

  // Step a: format + target (season or phase).
  const [format, setFormat] = useState<ScheduleFormat | "">("");
  const [phaseId, setPhaseId] = useState("");

  // Step b: round-robin parameters (FR-015/018).
  const [divisionId, setDivisionId] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [rounds, setRounds] = useState(1);
  const [startDateText, setStartDateText] = useState(dateInputValue(seasonStartDate));
  const [endDateText, setEndDateText] = useState(dateInputValue(seasonEndDate));
  const [eligibleDays, setEligibleDays] = useState<number[]>([0, 6]);
  const [startTime, setStartTime] = useState("18:00");
  const [durationText, setDurationText] = useState("60");
  const [defaultVenueId, setDefaultVenueId] = useState("");

  // Step c/d: the exact input that produced the preview is reused for
  // generation, so what was shown is what gets created (FR-016).
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [previewInput, setPreviewInput] = useState<GenerateRoundRobinInput | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const isGenerative = format !== "" && GENERATIVE_FORMATS.has(format);
  const formatLabel = format === "" ? "" : SCHEDULE_FORMAT_LABELS[format];
  const targetLabel = phaseId
    ? (phases.find((phase) => phase.id === phaseId)?.name ?? "this phase")
    : "the season";
  const previewTimezone =
    venues.find((venue) => venue.id === defaultVenueId)?.timezone ?? FALLBACK_TIME_ZONE;

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((current) =>
      current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId]
    );
  };

  /** Division defaults its member teams; manual add/remove stays open (FR-018). */
  const handleDivisionChange = (nextDivisionId: string) => {
    setDivisionId(nextDivisionId);
    if (nextDivisionId) {
      setSelectedTeamIds(
        teams.filter((team) => team.divisionId === nextDivisionId).map((team) => team.id)
      );
    }
  };

  /**
   * Non-generative formats are recorded as descriptive labels only — no games
   * are created and none are claimed to be (FR-006/007).
   */
  const handleSaveLabel = () => {
    if (format === "") return;
    startTransition(async () => {
      setError(null);
      const result = phaseId
        ? await updateSeasonPhase({ phaseId, format })
        : await updateSeason({ seasonId, format });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onNotice({
        severity: "info",
        text: `${formatLabel} is recorded as a label on ${targetLabel} — games are scheduled manually.`,
      });
      onClose();
      router.refresh();
    });
  };

  const buildInput = (): GenerateRoundRobinInput | null => {
    if (selectedTeamIds.length < 2) {
      setError("Select at least two teams.");
      return null;
    }
    const startDate = new Date(startDateText);
    const endDate = new Date(endDateText);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Enter a valid start and end date.");
      return null;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return null;
    }
    if (eligibleDays.length === 0) {
      setError("Select at least one eligible game day.");
      return null;
    }
    const gameDurationMinutes = Number(durationText);
    if (!Number.isInteger(gameDurationMinutes) || gameDurationMinutes < 30 || gameDurationMinutes > 300) {
      setError("Game duration must be between 30 and 300 minutes.");
      return null;
    }
    return {
      seasonId,
      phaseId: phaseId || undefined,
      teamIds: selectedTeamIds,
      rounds,
      startDate,
      endDate,
      eligibleDays,
      startTime,
      gameDurationMinutes,
      defaultVenueId: defaultVenueId || undefined,
    };
  };

  const handlePreview = () => {
    setError(null);
    const input = buildInput();
    if (!input) return;
    startTransition(async () => {
      const result = await previewRoundRobin(input);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
      setPreviewInput(input);
      setStep("preview");
    });
  };

  const handleGenerate = () => {
    if (!previewInput) return;
    startTransition(async () => {
      setError(null);
      const result = await generateRoundRobin(previewInput);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const count = result.data.createdIds.length;
      setCreatedCount(count);
      setStep("done");
      onNotice({
        severity: "success",
        text: `${count} draft game${count === 1 ? "" : "s"} created — review and publish below.`,
      });
      router.refresh();
    });
  };

  const conflictedCount = preview
    ? preview.games.filter((game) => game.conflicts.length > 0).length
    : 0;

  return (
    <>
      <DialogTitle>Generate games</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {step !== "done" ? (
            <Stepper activeStep={STEP_INDEX[step]} alternativeLabel>
              <Step>
                <StepLabel>Format</StepLabel>
              </Step>
              <Step>
                <StepLabel>Settings</StepLabel>
              </Step>
              <Step>
                <StepLabel>Preview</StepLabel>
              </Step>
            </Stepper>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {step === "format" ? (
            <Stack spacing={2}>
              <TextField
                select
                label="Format"
                value={format}
                onChange={(event) => setFormat(event.target.value as ScheduleFormat)}
                helperText="Only round robin can be generated — other formats are descriptive labels"
              >
                {SCHEDULE_FORMATS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {SCHEDULE_FORMAT_LABELS[option]}
                    {GENERATIVE_FORMATS.has(option) ? "" : " — label only"}
                  </MenuItem>
                ))}
              </TextField>

              {phases.length > 0 ? (
                <TextField
                  select
                  label="Apply to"
                  value={phaseId}
                  onChange={(event) => setPhaseId(event.target.value)}
                  helperText="The season or phase this format (and any generated games) belongs to"
                >
                  <MenuItem value="">Entire season</MenuItem>
                  {phases.map((phase) => (
                    <MenuItem key={phase.id} value={phase.id}>
                      {phase.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}

              {format !== "" && !isGenerative ? (
                <Alert severity="info">
                  {formatLabel} is a label only — games are scheduled manually. Saving records the
                  label on {targetLabel}; no games are generated.
                </Alert>
              ) : null}
            </Stack>
          ) : null}

          {step === "settings" ? (
            <Stack spacing={2}>
              {divisions.length > 0 ? (
                <TextField
                  select
                  label="Division (optional)"
                  value={divisionId}
                  onChange={(event) => handleDivisionChange(event.target.value)}
                  helperText="Selecting a division preselects its teams — adjust the list below freely"
                >
                  <MenuItem value="">Choose teams manually</MenuItem>
                  {divisions.map((division) => (
                    <MenuItem key={division.id} value={division.id}>
                      {division.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}

              <Stack spacing={0.5}>
                <Typography variant="subtitle2">
                  Teams ({selectedTeamIds.length} selected)
                </Typography>
                <Box
                  sx={{
                    maxHeight: 240,
                    overflowY: "auto",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    px: 1.5,
                    py: 0.5,
                  }}
                >
                  <FormGroup>
                    {teams.map((team) => (
                      <FormControlLabel
                        key={team.id}
                        control={
                          <Checkbox
                            checked={selectedTeamIds.includes(team.id)}
                            onChange={() => toggleTeam(team.id)}
                          />
                        }
                        label={team.name}
                      />
                    ))}
                  </FormGroup>
                </Box>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="Rounds"
                  fullWidth
                  value={rounds}
                  onChange={(event) => setRounds(Number(event.target.value))}
                  helperText="Times each pair of teams meets"
                >
                  {[1, 2, 3, 4].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
                <DateField
                  label="First game day"
                  required
                  fullWidth
                  value={startDateText}
                  onChange={setStartDateText}
                />
                <DateField
                  label="Last game day"
                  required
                  fullWidth
                  value={endDateText}
                  onChange={setEndDateText}
                />
              </Stack>

              <Stack spacing={0.5}>
                <Typography variant="subtitle2">Eligible game days</Typography>
                <ToggleButtonGroup
                  value={eligibleDays}
                  onChange={(_event, next: number[]) => setEligibleDays(next)}
                  size="small"
                  sx={{ flexWrap: "wrap" }}
                >
                  {WEEKDAYS.map((day) => (
                    <ToggleButton key={day.value} value={day.value} sx={{ minWidth: 52, minHeight: 44 }}>
                      {day.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  One game per eligible day, starting at the time below.
                </Typography>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TimeField
                  label="Start time"
                  required
                  fullWidth
                  value={startTime}
                  onChange={setStartTime}
                />
                <TextField
                  label="Game duration (minutes)"
                  type="number"
                  required
                  fullWidth
                  value={durationText}
                  onChange={(event) => setDurationText(event.target.value)}
                  slotProps={{ htmlInput: { min: 30, max: 300, step: 5 } }}
                />
                <TextField
                  select
                  label="Default venue (optional)"
                  fullWidth
                  value={defaultVenueId}
                  onChange={(event) => setDefaultVenueId(event.target.value)}
                  helperText="Assign venues during review if unset"
                >
                  <MenuItem value="">No default venue</MenuItem>
                  {venues.map((venue) => (
                    <MenuItem key={venue.id} value={venue.id}>
                      {venue.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </Stack>
          ) : null}

          {step === "preview" && preview ? (
            <Stack spacing={2}>
              <Typography variant="body2">
                {preview.games.length} of {preview.totalPairings} pairing
                {preview.totalPairings === 1 ? "" : "s"} scheduled
                {preview.games.length > 0
                  ? ` — ${preview.games.length} draft game${preview.games.length === 1 ? "" : "s"} will be created.`
                  : "."}
              </Typography>

              {preview.unslottedCount > 0 ? (
                <Alert severity="warning">
                  {preview.unslottedCount} pairing{preview.unslottedCount === 1 ? "" : "s"} did not
                  fit in the selected date range and will not be created. Extend the range or add
                  more eligible days to include {preview.unslottedCount === 1 ? "it" : "them"}.
                </Alert>
              ) : null}

              {conflictedCount > 0 ? (
                <Alert severity="warning">
                  {conflictedCount} game{conflictedCount === 1 ? "" : "s"} overlap existing venue
                  bookings — flagged below. Drafts can still be created and adjusted before
                  publishing.
                </Alert>
              ) : null}

              <TableContainer sx={{ overflowX: "auto", maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Matchup</TableCell>
                      <TableCell>Round</TableCell>
                      <TableCell>When</TableCell>
                      <TableCell>Conflicts</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.games.map((game, index) => (
                      <TableRow key={`${game.homeTeamId}-${game.awayTeamId}-${index}`} hover>
                        <TableCell>
                          {game.homeTeamName} vs {game.awayTeamName}
                        </TableCell>
                        <TableCell>{game.round}</TableCell>
                        <TableCell>{formatDateTimeInZone(game.startAt, previewTimezone)}</TableCell>
                        <TableCell>
                          {game.conflicts.length === 0 ? (
                            "—"
                          ) : (
                            <Stack spacing={0.5} alignItems="flex-start">
                              <Chip
                                size="small"
                                color="warning"
                                label={`${game.conflicts.length} conflict${game.conflicts.length === 1 ? "" : "s"}`}
                              />
                              {game.conflicts.map((conflict, conflictIndex) => (
                                <Typography
                                  key={`${conflict.title}-${conflictIndex}`}
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {conflict.title} —{" "}
                                  {formatDateTimeInZone(conflict.startAt, previewTimezone)}
                                </Typography>
                              ))}
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          ) : null}

          {step === "done" ? (
            <Alert severity="success">
              {createdCount} draft game{createdCount === 1 ? "" : "s"} created — review and publish
              below. Drafts have no calendar presence until published.
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        {step === "format" ? (
          <>
            <Button onClick={onClose} disabled={isPending} sx={{ minHeight: 44 }}>
              Cancel
            </Button>
            {format !== "" && !isGenerative ? (
              <Button
                variant="contained"
                onClick={handleSaveLabel}
                disabled={isPending}
                sx={{ minHeight: 44 }}
              >
                {isPending ? "Saving…" : "Save label"}
              </Button>
            ) : (
              <Button
                variant="contained"
                disabled={format === ""}
                onClick={() => {
                  setError(null);
                  setStep("settings");
                }}
                sx={{ minHeight: 44 }}
              >
                Next
              </Button>
            )}
          </>
        ) : null}

        {step === "settings" ? (
          <>
            <Button
              onClick={() => {
                setError(null);
                setStep("format");
              }}
              disabled={isPending}
              sx={{ minHeight: 44 }}
            >
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handlePreview}
              disabled={isPending}
              sx={{ minHeight: 44 }}
            >
              {isPending ? "Previewing…" : "Preview games"}
            </Button>
          </>
        ) : null}

        {step === "preview" ? (
          <>
            <Button
              onClick={() => {
                setError(null);
                setStep("settings");
              }}
              disabled={isPending}
              sx={{ minHeight: 44 }}
            >
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={isPending || !preview || preview.games.length === 0}
              sx={{ minHeight: 44 }}
            >
              {isPending
                ? "Creating…"
                : `Create ${preview?.games.length ?? 0} draft game${preview?.games.length === 1 ? "" : "s"}`}
            </Button>
          </>
        ) : null}

        {step === "done" ? (
          <Button variant="contained" onClick={onClose} sx={{ minHeight: 44 }}>
            Done
          </Button>
        ) : null}
      </DialogActions>
    </>
  );
}
