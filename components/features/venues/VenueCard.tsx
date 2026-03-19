"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Stack,
} from "@mui/material";
import {
  Place as PlaceIcon,
  People as PeopleIcon,
} from "@mui/icons-material";

interface VenueCardProps {
  venue: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    surfaceType: string;
    capacity: number | null;
    visibility: string;
    isActive: boolean;
    team: { id: string; name: string } | null;
    league: { id: string; name: string } | null;
  };
}

const surfaceTypeLabels: Record<string, string> = {
  ICE: "Ice",
  TURF: "Turf",
  COURT: "Court",
  FIELD: "Field",
  OTHER: "Other",
};

const surfaceTypeColors: Record<string, "primary" | "secondary" | "success" | "warning" | "info"> = {
  ICE: "info",
  TURF: "success",
  COURT: "warning",
  FIELD: "success",
  OTHER: "secondary",
};

const visibilityLabels: Record<string, string> = {
  PUBLIC: "Public",
  LEAGUE: "League",
  TEAM: "Team",
};

export default function VenueCard({ venue }: VenueCardProps) {
  const router = useRouter();

  const locationParts = [venue.city, venue.state].filter(Boolean).join(", ");

  return (
    <Card
      onClick={() => router.push(`/venues/${venue.id}`)}
      sx={{
        cursor: "pointer",
        transition: "transform 0.15s, box-shadow 0.15s",
        opacity: venue.isActive ? 1 : 0.6,
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: 4,
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
          <Typography variant="h6" component="h3" noWrap sx={{ flex: 1, mr: 1 }}>
            {venue.name}
          </Typography>
          <Chip
            label={surfaceTypeLabels[venue.surfaceType] || venue.surfaceType}
            color={surfaceTypeColors[venue.surfaceType] || "secondary"}
            size="small"
          />
        </Box>

        {venue.address && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
            <PlaceIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary" noWrap>
              {venue.address}
            </Typography>
          </Box>
        )}

        {locationParts && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 3.5, mb: 0.5 }}>
            {locationParts}
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          {venue.capacity && (
            <Chip
              icon={<PeopleIcon />}
              label={`${venue.capacity}`}
              size="small"
              variant="outlined"
            />
          )}
          <Chip
            label={visibilityLabels[venue.visibility] || venue.visibility}
            size="small"
            variant="outlined"
            color={venue.visibility === "PUBLIC" ? "primary" : "default"}
          />
          {venue.team && (
            <Chip label={venue.team.name} size="small" variant="outlined" />
          )}
          {venue.league && (
            <Chip label={venue.league.name} size="small" variant="outlined" />
          )}
          {!venue.isActive && (
            <Chip label="Inactive" size="small" color="error" variant="outlined" />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
