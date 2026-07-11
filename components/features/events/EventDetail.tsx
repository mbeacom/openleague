"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Stack,
} from "@mui/material";
import {
  CalendarToday,
  LocationOn,
  SportsScore,
  Notes as NotesIcon,
  Edit,
  Delete,
} from "@mui/icons-material";
import { deleteEvent } from "@/lib/actions/events";
import { formatDateTime } from "@/lib/utils/date";
import { RSVPButtons } from "./RSVPButtons";
import { AttendanceView } from "./AttendanceView";
import type { AttendanceCounts, AttendanceEntry } from "@/types/events";

type RSVPStatus = "GOING" | "NOT_GOING" | "MAYBE" | "NO_RESPONSE";

type EventRsvp = {
  id: string;
  status: RSVPStatus;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  // Per-child response (identity graph, Tier 3). Absent/null on
  // self/household rows.
  playerId?: string | null;
  player?: {
    id: string;
    name: string;
  } | null;
};

/** A player the viewer guards (with canRsvp) on this event's team. */
export interface GuardedPlayerRsvp {
  playerId: string;
  playerName: string;
  status: RSVPStatus;
}

interface EventDetailProps {
  event: {
    id: string;
    type: string;
    title: string;
    startAt: Date;
    timezone?: string;
    location: string;
    opponent: string | null;
    notes: string | null;
    team: {
      id: string;
      name: string;
    };
    rsvps: EventRsvp[];
    canRSVP?: boolean;
    canManageEvent?: boolean;
  };
  userRole: string;
  currentUserId: string;
  /**
   * Guarded players (canRsvp) the viewer answers for on this event's team.
   * Empty/omitted → single-identity UI, identical to the pre-Tier-3 layout.
   */
  guardedPlayers?: GuardedPlayerRsvp[];
  /**
   * Server-computed attendance (getEventAttendance contract). When absent the
   * component derives equivalent entries/counts from event.rsvps.
   */
  attendance?: { entries: AttendanceEntry[]; counts: AttendanceCounts } | null;
}

/**
 * Fallback attendance derivation matching the getEventAttendance semantics:
 * player-level entries where a per-child row exists, user-level otherwise;
 * every row is a distinct entry.
 */
function deriveAttendance(rsvps: EventRsvp[]): {
  entries: AttendanceEntry[];
  counts: AttendanceCounts;
} {
  const entries: AttendanceEntry[] = rsvps.map((rsvp) =>
    rsvp.playerId && rsvp.player
      ? {
          kind: "player" as const,
          name: rsvp.player.name,
          status: rsvp.status,
          respondedByName: rsvp.user.name ?? rsvp.user.email,
        }
      : {
          kind: "user" as const,
          name: rsvp.user.name ?? rsvp.user.email,
          status: rsvp.status,
        }
  );

  const counts: AttendanceCounts = {
    GOING: 0,
    NOT_GOING: 0,
    MAYBE: 0,
    NO_RESPONSE: 0,
  };
  for (const entry of entries) {
    counts[entry.status] += 1;
  }

  return { entries, counts };
}

export default function EventDetail({
  event,
  userRole,
  currentUserId,
  guardedPlayers = [],
  attendance,
}: EventDetailProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = event.canManageEvent ?? userRole === "ADMIN";
  const canRSVP = event.canRSVP ?? true;

  // Find current user's own (self/household) RSVP status — per-child rows
  // carry a playerId and are answered separately below.
  const currentUserRSVP = event.rsvps.find(
    (rsvp) => rsvp.user.id === currentUserId && !rsvp.playerId
  );
  const currentStatus = currentUserRSVP?.status || "NO_RESPONSE";

  const hasGuardedPlayers = guardedPlayers.length > 0;
  const { entries: attendanceEntries, counts: attendanceCounts } =
    attendance ?? deriveAttendance(event.rsvps);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const result = await deleteEvent(event.id);

      if (result.success) {
        router.push("/calendar");
      } else {
        setError(result.error);
        setIsDeleting(false);
      }
    } catch (err) {
      console.error("Error deleting event:", err);
      setError("An unexpected error occurred. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              mb: 2,
            }}
          >
            <Box>
              <Chip
                label={event.type}
                color={event.type === "GAME" ? "primary" : "secondary"}
                size="small"
                sx={{ mb: 1 }}
              />
              <Typography variant="h4" component="h1" gutterBottom>
                {event.title}
              </Typography>
            </Box>

            {isAdmin && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Edit />}
                  onClick={() => router.push(`/events/${event.id}/edit`)}
                  sx={{ minHeight: 44 }}
                >
                  Edit
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<Delete />}
                  onClick={() => setDeleteDialogOpen(true)}
                  sx={{ minHeight: 44 }}
                >
                  Delete
                </Button>
              </Box>
            )}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 3 }}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <CalendarToday color="action" />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Date & Time
                </Typography>
                <Typography variant="body1">{formatDateTime(event.startAt, event.timezone)}</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <LocationOn color="action" />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Location
                </Typography>
                <Typography variant="body1">{event.location}</Typography>
              </Box>
            </Box>

            {event.opponent && (
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <SportsScore color="action" />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Opponent
                  </Typography>
                  <Typography variant="body1">{event.opponent}</Typography>
                </Box>
              </Box>
            )}

            {event.notes && (
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <NotesIcon color="action" />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Notes
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                    {event.notes}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* RSVP Buttons — one response row per identity for guardians */}
      {canRSVP && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            {hasGuardedPlayers ? "Your Responses" : "Your Response"}
          </Typography>
          {hasGuardedPlayers ? (
            <Stack spacing={2.5}>
              <Box>
                <Typography
                  variant="subtitle2"
                  sx={{ mb: 1, color: "text.secondary" }}
                >
                  You
                </Typography>
                <RSVPButtons eventId={event.id} currentStatus={currentStatus} />
              </Box>
              {guardedPlayers.map((player) => (
                <Box key={player.playerId}>
                  <Typography
                    variant="subtitle2"
                    sx={{ mb: 1, color: "text.secondary" }}
                  >
                    {player.playerName}
                  </Typography>
                  <RSVPButtons
                    eventId={event.id}
                    currentStatus={player.status}
                    playerId={player.playerId}
                  />
                </Box>
              ))}
            </Stack>
          ) : (
            <RSVPButtons eventId={event.id} currentStatus={currentStatus} />
          )}
        </Box>
      )}

      {/* Attendance View (Admin only) */}
      {isAdmin && (
        <Box sx={{ mt: 3 }}>
          <AttendanceView entries={attendanceEntries} counts={attendanceCounts} />
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Event</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography>
            Are you sure you want to delete this event? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
