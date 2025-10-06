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

interface EventDetailProps {
  event: {
    id: string;
    type: string;
    title: string;
    startAt: Date;
    location: string;
    opponent: string | null;
    notes: string | null;
    team: {
      id: string;
      name: string;
    };
  };
  userRole: string;
}

export default function EventDetail({ event, userRole }: EventDetailProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userRole === "ADMIN";

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
                <Typography variant="body1">{formatDateTime(event.startAt)}</Typography>
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
