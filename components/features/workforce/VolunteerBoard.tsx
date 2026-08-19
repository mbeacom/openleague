"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

import type { VolunteerNeedSummary } from "@/lib/actions/volunteers";
import {
  completeVolunteerAssignment,
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

export function VolunteerBoard({ needs, isOrganizer }: VolunteerBoardProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "That action could not be completed.");
      }
    });
  }

  if (needs.length === 0) {
    return (
      <Alert severity="info">
        {isOrganizer
          ? "No volunteer needs yet. Create one to start staffing the season."
          : "You have no volunteer shifts right now."}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}

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
                  {new Date(need.startAt).toLocaleString()} ({need.timezone})
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
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

export default VolunteerBoard;
