"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Stack,
  Button,
  Divider,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import {
  Publish as PublishIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { publishSchedule, archiveSchedule, deleteSchedule } from "@/lib/actions/game-schedules";

const statusColors: Record<string, "warning" | "success" | "default"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "default",
};

interface ScheduleDetailProps {
  schedule: {
    id: string;
    name: string;
    seasonName: string | null;
    startDate: Date;
    endDate: Date;
    status: string;
    roundRobin: boolean;
    rounds: number;
    notes: string | null;
    createdBy: { id: string; name: string | null } | null;
    league: { id: string; name: string } | null;
    team: { id: string; name: string } | null;
    games: Array<{
      id: string;
      roundNumber: number;
      gameNumber: number;
      event: {
        id: string;
        title: string;
        startAt: Date;
        endAt: Date | null;
        location: string;
        venue: { id: string; name: string } | null;
        homeTeam: { id: string; name: string } | null;
        awayTeam: { id: string; name: string } | null;
        team: { id: string; name: string };
      };
    }>;
  };
  canEdit: boolean;
}

export default function ScheduleDetail({ schedule, canEdit }: ScheduleDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handlePublish = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await publishSchedule({ gameScheduleId: schedule.id });
      if (!result.success) {
        setError(result.error);
      }
    } catch {
      setError("Failed to publish schedule.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await archiveSchedule(schedule.id);
      if (!result.success) {
        setError(result.error);
      }
    } catch {
      setError("Failed to archive schedule.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const result = await deleteSchedule(schedule.id);
      if (result.success) {
        router.push("/schedules");
      } else {
        setError(result.error);
        setDeleteDialogOpen(false);
      }
    } catch {
      setError("Failed to delete schedule.");
      setDeleteDialogOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Group games by round
  const gamesByRound = new Map<number, typeof schedule.games>();
  for (const game of schedule.games) {
    const round = game.roundNumber;
    if (!gamesByRound.has(round)) gamesByRound.set(round, []);
    gamesByRound.get(round)!.push(game);
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                {schedule.name}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Chip
                  label={schedule.status}
                  color={statusColors[schedule.status] || "default"}
                  size="small"
                />
                {schedule.seasonName && (
                  <Chip label={schedule.seasonName} size="small" variant="outlined" />
                )}
                <Chip
                  label={`${schedule.games.length} games`}
                  size="small"
                  variant="outlined"
                />
              </Stack>
            </Box>

            {canEdit && (
              <Stack direction="row" spacing={1}>
                {schedule.status === "DRAFT" && (
                  <>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<PublishIcon />}
                      onClick={handlePublish}
                      disabled={isLoading}
                      size="small"
                    >
                      Publish
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={isLoading}
                      size="small"
                    >
                      Delete
                    </Button>
                  </>
                )}
                {schedule.status === "PUBLISHED" && (
                  <Button
                    variant="outlined"
                    startIcon={<ArchiveIcon />}
                    onClick={handleArchive}
                    disabled={isLoading}
                    size="small"
                  >
                    Archive
                  </Button>
                )}
              </Stack>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body1">
            {new Date(schedule.startDate).toLocaleDateString()} &ndash;{" "}
            {new Date(schedule.endDate).toLocaleDateString()}
          </Typography>
          {schedule.league && (
            <Typography variant="body2" color="text.secondary">
              League: {schedule.league.name}
            </Typography>
          )}
          {schedule.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {schedule.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Games by Round */}
      {Array.from(gamesByRound.entries()).map(([round, games]) => (
        <Card key={round} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Round {round}
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Home</TableCell>
                    <TableCell>Away</TableCell>
                    <TableCell>Venue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {games.map((game) => (
                    <TableRow
                      key={game.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => router.push(`/events/${game.event.id}`)}
                    >
                      <TableCell>
                        {new Date(game.event.startAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {new Date(game.event.startAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {game.event.homeTeam?.name || game.event.team.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {game.event.awayTeam?.name || "TBD"}
                      </TableCell>
                      <TableCell>
                        {game.event.venue?.name || game.event.location}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ))}

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Schedule</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete the schedule and all {schedule.games.length} generated game events. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" disabled={isLoading}>
            {isLoading ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
