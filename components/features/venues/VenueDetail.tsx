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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import {
  Place as PlaceIcon,
  Phone as PhoneIcon,
  Language as WebIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
} from "@mui/icons-material";
import { deleteVenue } from "@/lib/actions/venues";

const surfaceTypeLabels: Record<string, string> = {
  ICE: "Ice Rink",
  TURF: "Turf Field",
  COURT: "Court",
  FIELD: "Field",
  OTHER: "Other",
};

const amenityLabels: Record<string, string> = {
  locker_rooms: "Locker Rooms",
  parking: "Parking",
  pro_shop: "Pro Shop",
  scoreboard: "Scoreboard",
  concessions: "Concessions",
  restrooms: "Restrooms",
  heated_seating: "Heated Seating",
  lighting: "Lighting",
  sound_system: "Sound System",
  first_aid: "First Aid",
};

interface VenueDetailProps {
  venue: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    surfaceType: string;
    capacity: number | null;
    amenities: string[];
    phone: string | null;
    website: string | null;
    notes: string | null;
    visibility: string;
    isActive: boolean;
    team: { id: string; name: string } | null;
    league: { id: string; name: string } | null;
    createdBy: { id: string; name: string | null } | null;
    _count: { events: number };
  };
  canEdit: boolean;
  upcomingEvents?: Array<{
    id: string;
    title: string;
    startAt: string;
    type: string;
    team: { name: string };
  }>;
}

export default function VenueDetail({ venue, canEdit, upcomingEvents = [] }: VenueDetailProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteVenue(venue.id);
      if (result.success) {
        router.push("/venues");
      } else {
        setError(result.error);
        setDeleteDialogOpen(false);
      }
    } catch {
      setError("Failed to delete venue.");
      setDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const locationParts = [venue.address, venue.city, venue.state, venue.zipCode]
    .filter(Boolean)
    .join(", ");

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                {venue.name}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  label={surfaceTypeLabels[venue.surfaceType] || venue.surfaceType}
                  color="primary"
                  size="small"
                />
                <Chip
                  label={venue.visibility}
                  size="small"
                  variant="outlined"
                />
                {!venue.isActive && (
                  <Chip label="Inactive" size="small" color="error" />
                )}
              </Stack>
            </Box>
            {canEdit && (
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => router.push(`/venues/${venue.id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Delete
                </Button>
              </Stack>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          {locationParts && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <PlaceIcon color="action" />
              <Typography variant="body1">{locationParts}</Typography>
            </Box>
          )}

          {venue.phone && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <PhoneIcon color="action" />
              <Typography variant="body1">{venue.phone}</Typography>
            </Box>
          )}

          {venue.website && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <WebIcon color="action" />
              <Typography
                variant="body1"
                component="a"
                href={venue.website.startsWith("http") ? venue.website : `https://${venue.website}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "primary.main" }}
              >
                {venue.website}
              </Typography>
            </Box>
          )}

          {venue.capacity && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <PeopleIcon color="action" />
              <Typography variant="body1">Capacity: {venue.capacity}</Typography>
            </Box>
          )}

          {venue.amenities.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Amenities
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {venue.amenities.map((amenity) => (
                  <Chip
                    key={amenity}
                    label={amenityLabels[amenity] || amenity}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Stack>
            </Box>
          )}

          {venue.notes && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Notes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {venue.notes}
              </Typography>
            </Box>
          )}

          {venue.team && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Team: {venue.team.name}
            </Typography>
          )}
          {venue.league && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              League: {venue.league.name}
            </Typography>
          )}
        </CardContent>
      </Card>

      {upcomingEvents.length > 0 && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Upcoming Events ({venue._count.events})
            </Typography>
            <Stack spacing={1}>
              {upcomingEvents.map((event) => (
                <Box
                  key={event.id}
                  onClick={() => router.push(`/events/${event.id}`)}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 1.5,
                    borderRadius: 1,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box>
                    <Typography variant="body1">{event.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {event.team.name}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="body2">
                      {new Date(event.startAt).toLocaleDateString()}
                    </Typography>
                    <Chip label={event.type} size="small" variant="outlined" />
                  </Box>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Venue</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {venue._count.events > 0
              ? `This venue has ${venue._count.events} upcoming events. It will be deactivated instead of deleted.`
              : "Are you sure you want to delete this venue? This action cannot be undone."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
