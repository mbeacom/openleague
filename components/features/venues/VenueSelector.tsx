"use client";

import { useState, useEffect } from "react";
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  Chip,
} from "@mui/material";
import { Place as PlaceIcon } from "@mui/icons-material";
import { getAvailableVenues } from "@/lib/actions/venues";

interface VenueOption {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  surfaceType: string;
}

interface VenueSelectorProps {
  value: string; // venueId
  onChange: (venueId: string, venueName: string) => void;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  surfaceFilter?: string;
}

const surfaceLabels: Record<string, string> = {
  ICE: "Ice",
  TURF: "Turf",
  COURT: "Court",
  FIELD: "Field",
  OTHER: "Other",
};

export default function VenueSelector({
  value,
  onChange,
  disabled = false,
  error = false,
  helperText,
  surfaceFilter,
}: VenueSelectorProps) {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadVenues() {
      try {
        const result = await getAvailableVenues(
          surfaceFilter ? { surfaceType: surfaceFilter } : undefined
        );
        if (mounted) {
          setVenues(
            result.map((v) => ({
              id: v.id,
              name: v.name,
              address: v.address,
              city: v.city,
              state: v.state,
              surfaceType: v.surfaceType,
            }))
          );
        }
      } catch {
        // Silently fail — venues list will be empty
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadVenues();
    return () => {
      mounted = false;
    };
  }, [surfaceFilter]);

  const selectedVenue = venues.find((v) => v.id === value) || null;

  return (
    <Autocomplete
      options={venues}
      value={selectedVenue}
      onChange={(_, newValue) => {
        onChange(newValue?.id || "", newValue?.name || "");
      }}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      loading={loading}
      disabled={disabled}
      renderOption={(props, option) => {
        const locationParts = [option.city, option.state].filter(Boolean).join(", ");
        return (
          <Box component="li" {...props} key={option.id}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
              <PlaceIcon fontSize="small" color="action" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body1">{option.name}</Typography>
                {locationParts && (
                  <Typography variant="body2" color="text.secondary">
                    {locationParts}
                  </Typography>
                )}
              </Box>
              <Chip
                label={surfaceLabels[option.surfaceType] || option.surfaceType}
                size="small"
                variant="outlined"
              />
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Venue"
          placeholder="Select a venue (optional)"
          error={error}
          helperText={helperText || "Choose a venue or type a location below"}
        />
      )}
    />
  );
}
