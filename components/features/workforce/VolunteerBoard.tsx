"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { VolunteerNeedSummary } from "@/lib/actions/volunteers";
import {
  assignVolunteer,
  completeVolunteerAssignment,
  createVolunteerNeed,
  markVolunteerAssignmentMissed,
  respondToVolunteerAssignment,
} from "@/lib/actions/volunteers";

const STATUS_COLOR = {
  OPEN: "success",
  CLOSED: "default",
  CANCELED: "error",
  COMPLETED: "info",
} as const;

const ASSIGNMENT_COLOR = {
  INVITED: "warning",
  ACCEPTED: "success",
  DECLINED: "default",
  CANCELED: "default",
  COMPLETED: "info",
  MISSED: "error",
} as const;

function chipColor<T extends Record<string, string>>(
  map: T,
  key: string,
): T[keyof T] | "default" {
  return (map[key] as T[keyof T]) ?? "default";
}

export interface VolunteerBoardProps {
  /** Required for organizers, who can create needs here. */
  leagueId?: string;
  /** Teams a need may be scoped to; empty for volunteers. */
  teams?: Array<{ id: string; name: string }>;
  needs: VolunteerNeedSummary[];
  /**
   * Organizers see fulfillment across every need and can close assignments
   * out. Volunteers see only their own shifts, so the board renders their
   * accept/decline controls instead.
   */
  isOrganizer: boolean;
  /** The signed-in user, for deciding which assignment rows are answerable. */
  currentUserId?: string;
}

export function VolunteerBoard({
  leagueId,
  teams = [],
  needs,
  isOrganizer,
}: VolunteerBoardProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assignEmail, setAssignEmail] = useState("");
  const [form, setForm] = useState({
    roleLabel: "",
    capacity: "1",
    startAt: "",
    endAt: "",
    teamId: "",
  });

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "That action could not be completed.");
      }
    });
  }

  const timezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";

  function handleCreate() {
    if (!leagueId) return;
    setError(null);
    startTransition(async () => {
      const result = await createVolunteerNeed({
        leagueId,
        roleLabel: form.roleLabel,
        capacity: Number(form.capacity),
        startAt: new Date(form.startAt),
        endAt: new Date(form.endAt),
        timezone,
        ...(form.teamId ? { teamId: form.teamId } : {}),
      });
      if (result.success) {
        setCreateOpen(false);
        setForm({ roleLabel: "", capacity: "1", startAt: "", endAt: "", teamId: "" });
      } else {
        setError(result.error);
      }
    });
  }

  function handleAssign(needId: string) {
    setError(null);
    startTransition(async () => {
      const result = await assignVolunteer({ needId, invitedEmail: assignEmail });
      if (result.success) {
        setAssignFor(null);
        setAssignEmail("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      {isOrganizer && leagueId ? (
        <Box>
          <Button
            variant="contained"
            onClick={() => setCreateOpen(true)}
            sx={{ minHeight: 44 }}
          >
            Create volunteer need
          </Button>
        </Box>
      ) : null}

      {needs.length === 0 ? (
        <Alert severity="info">
          {isOrganizer
            ? "No volunteer needs yet. Create one to start staffing the season."
            : "You have no volunteer shifts right now."}
        </Alert>
      ) : null}

      {needs.map((need) => {
        const filled = need.capacity > 0 ? (need.acceptedCount / need.capacity) * 100 : 0;
        const shortfall = Math.max(need.capacity - need.acceptedCount, 0);

        return (
          <Card key={need.id} variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
            >
              <Box>
                <Typography variant="h6" component="h3">
                  {need.roleLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {need.teamName ? `${need.teamName} · ` : ""}
                  {new Date(need.startAt).toLocaleString(undefined, {
                    timeZone: need.timezone,
                  })}{" "}
                  ({need.timezone})
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  label={need.status}
                  color={chipColor(STATUS_COLOR, need.status)}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${need.acceptedCount} of ${need.capacity} filled`}
                />
              </Stack>
            </Stack>

            {need.description ? (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {need.description}
              </Typography>
            ) : null}

            <Box sx={{ mt: 1.5 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(filled, 100)}
                aria-label={`${need.roleLabel} staffing`}
                sx={{ height: 8, borderRadius: 1 }}
              />
              {isOrganizer && shortfall > 0 && need.status === "OPEN" ? (
                <Typography variant="caption" color="warning.main">
                  {shortfall} more volunteer{shortfall === 1 ? "" : "s"} needed
                </Typography>
              ) : null}
            </Box>

            <Stack spacing={1} sx={{ mt: 2 }}>
              {need.assignments.map((assignment) => (
                <Stack
                  key={assignment.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ flexWrap: "wrap", gap: 1 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={assignment.status}
                      color={chipColor(ASSIGNMENT_COLOR, assignment.status)}
                    />
                    <Typography variant="body2">{assignment.personLabel}</Typography>
                  </Stack>

                  <Stack direction="row" spacing={1}>
                    {!isOrganizer && assignment.status === "INVITED" ? (
                      <>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={pending}
                          sx={{ minHeight: 44 }}
                          onClick={() =>
                            run(() =>
                              respondToVolunteerAssignment({
                                assignmentId: assignment.id,
                                response: "ACCEPTED",
                              }),
                            )
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          size="small"
                          disabled={pending}
                          sx={{ minHeight: 44 }}
                          onClick={() =>
                            run(() =>
                              respondToVolunteerAssignment({
                                assignmentId: assignment.id,
                                response: "DECLINED",
                              }),
                            )
                          }
                        >
                          Decline
                        </Button>
                      </>
                    ) : null}

                    {isOrganizer && assignment.status === "ACCEPTED" ? (
                      <>
                        <Button
                          size="small"
                          disabled={pending}
                          sx={{ minHeight: 44 }}
                          onClick={() => run(() => completeVolunteerAssignment(assignment.id))}
                        >
                          Completed
                        </Button>
                        <Button
                          size="small"
                          color="warning"
                          disabled={pending}
                          sx={{ minHeight: 44 }}
                          onClick={() =>
                            run(() => markVolunteerAssignmentMissed(assignment.id))
                          }
                        >
                          No-show
                        </Button>
                      </>
                    ) : null}
                  </Stack>
                </Stack>
              ))}

              {need.assignments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nobody assigned yet.
                </Typography>
              ) : null}

              {isOrganizer && need.status === "OPEN" ? (
                <Box>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={pending}
                    sx={{ minHeight: 44 }}
                    onClick={() => {
                      setAssignFor(need.id);
                      setAssignEmail("");
                    }}
                  >
                    Assign volunteer
                  </Button>
                </Box>
              ) : null}
            </Stack>
          </Card>
        );
      })}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create volunteer need</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Role"
              value={form.roleLabel}
              onChange={(e) => setForm({ ...form, roleLabel: e.target.value })}
              fullWidth
            />
            <TextField
              label="How many volunteers"
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              fullWidth
            />
            <TextField
              label="Starts"
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Ends"
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            {teams.length > 0 ? (
              <TextField
                select
                label="Team (optional)"
                value={form.teamId}
                onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                fullWidth
              >
                <MenuItem value="">Whole association</MenuItem>
                {teams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={pending || !form.roleLabel || !form.startAt || !form.endAt}
            sx={{ minHeight: 44 }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={assignFor !== null} onClose={() => setAssignFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Assign a volunteer</DialogTitle>
        <DialogContent>
          <TextField
            label="Email address"
            type="email"
            value={assignEmail}
            onChange={(e) => setAssignEmail(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
            helperText="They need an existing account. Invite them to the association first if not."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignFor(null)} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => assignFor && handleAssign(assignFor)}
            disabled={pending || !assignEmail}
            sx={{ minHeight: 44 }}
          >
            Assign
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default VolunteerBoard;
