"use client";

import { useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Chip,
  Stack,
  TextField,
  InputAdornment,
  Button,
} from "@mui/material";
import {
  Search as SearchIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import VenueCard from "./VenueCard";

interface VenueListProps {
  venues: Array<{
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
  }>;
  isAdmin: boolean;
}

const surfaceFilters = [
  { label: "All", value: "" },
  { label: "Ice", value: "ICE" },
  { label: "Turf", value: "TURF" },
  { label: "Court", value: "COURT" },
  { label: "Field", value: "FIELD" },
  { label: "Other", value: "OTHER" },
];

export default function VenueList({ venues, isAdmin }: VenueListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [surfaceFilter, setSurfaceFilter] = useState("");

  const filtered = venues.filter((v) => {
    const matchesSearch =
      !search ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.address?.toLowerCase().includes(search.toLowerCase()) ||
      v.city?.toLowerCase().includes(search.toLowerCase());

    const matchesSurface = !surfaceFilter || v.surfaceType === surfaceFilter;

    return matchesSearch && matchesSurface;
  });

  if (venues.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          gap: 2,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          No venues yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isAdmin
            ? "Add a venue to get started with scheduling ice time."
            : "Your team admin hasn't added any venues yet."}
        </Typography>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/venues/new")}
          >
            Add Venue
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <TextField
          size="small"
          placeholder="Search venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 250 }}
        />
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/venues/new")}
          >
            Add Venue
          </Button>
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: "wrap", gap: 1 }}>
        {surfaceFilters.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            onClick={() => setSurfaceFilter(f.value)}
            color={surfaceFilter === f.value ? "primary" : "default"}
            variant={surfaceFilter === f.value ? "filled" : "outlined"}
          />
        ))}
      </Stack>

      {filtered.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
          No venues match your filters.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((venue) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={venue.id}>
              <VenueCard venue={venue} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
