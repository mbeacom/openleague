"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  type SelectChangeEvent,
  Chip,
  Stack,
} from "@mui/material";
import { createVenue, updateVenue } from "@/lib/actions/venues";
import { createVenueSchema, updateVenueSchema } from "@/lib/utils/validation";

const AMENITY_OPTIONS = [
  "locker_rooms",
  "parking",
  "pro_shop",
  "scoreboard",
  "concessions",
  "restrooms",
  "heated_seating",
  "lighting",
  "sound_system",
  "first_aid",
];

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

interface VenueFormProps {
  venueId?: string;
  initialData?: {
    name: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    surfaceType: string;
    capacity: number | null;
    amenities: string[];
    phone: string;
    website: string;
    notes: string;
    visibility: string;
    teamId: string;
    leagueId: string;
  };
  teams?: Array<{ id: string; name: string }>;
  leagues?: Array<{ id: string; name: string }>;
}

export default function VenueForm({
  venueId,
  initialData,
  teams = [],
  leagues = [],
}: VenueFormProps) {
  const router = useRouter();
  const isEditMode = !!venueId;

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    address: initialData?.address || "",
    city: initialData?.city || "",
    state: initialData?.state || "",
    zipCode: initialData?.zipCode || "",
    surfaceType: initialData?.surfaceType || "OTHER",
    capacity: initialData?.capacity ?? "",
    amenities: initialData?.amenities || [],
    phone: initialData?.phone || "",
    website: initialData?.website || "",
    notes: initialData?.notes || "",
    visibility: initialData?.visibility || "PUBLIC",
    teamId: initialData?.teamId || "",
    leagueId: initialData?.leagueId || "",
  });

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const toggleAmenity = (amenity: string) => {
    setFormData((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload = {
      ...formData,
      surfaceType: formData.surfaceType as "ICE" | "TURF" | "COURT" | "FIELD" | "OTHER",
      visibility: formData.visibility as "PUBLIC" | "LEAGUE" | "TEAM",
      capacity: formData.capacity ? Number(formData.capacity) : undefined,
      teamId: formData.teamId || undefined,
      leagueId: formData.leagueId || undefined,
    };

    const schema = isEditMode ? updateVenueSchema : createVenueSchema;
    const dataToValidate = isEditMode ? { ...payload, id: venueId! } : payload;

    const validation = schema.safeParse(dataToValidate);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        if (field && !errors[field]) {
          errors[field] = issue.message;
        }
      });
      setFieldErrors(errors);
      setError("Please fix the errors below.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = isEditMode
        ? await updateVenue({ ...payload, id: venueId! })
        : await createVenue(payload);

      if (result.success) {
        router.push(isEditMode ? `/venues/${venueId}` : "/venues");
      } else {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 600, width: "100%" }}
    >
      <Typography variant="h5" component="h2" gutterBottom>
        {isEditMode ? "Edit Venue" : "Add Venue"}
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TextField
        label="Venue Name"
        name="name"
        value={formData.name}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., North Star Ice Arena"
        error={!!fieldErrors.name}
        helperText={fieldErrors.name}
      />

      <TextField
        label="Address"
        name="address"
        value={formData.address}
        onChange={handleChange}
        fullWidth
        disabled={isSubmitting}
        placeholder="123 Main Street"
        error={!!fieldErrors.address}
        helperText={fieldErrors.address}
      />

      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          label="City"
          name="city"
          value={formData.city}
          onChange={handleChange}
          fullWidth
          disabled={isSubmitting}
          error={!!fieldErrors.city}
          helperText={fieldErrors.city}
        />
        <TextField
          label="State"
          name="state"
          value={formData.state}
          onChange={handleChange}
          sx={{ minWidth: 120 }}
          disabled={isSubmitting}
          error={!!fieldErrors.state}
          helperText={fieldErrors.state}
        />
        <TextField
          label="ZIP Code"
          name="zipCode"
          value={formData.zipCode}
          onChange={handleChange}
          sx={{ minWidth: 120 }}
          disabled={isSubmitting}
          error={!!fieldErrors.zipCode}
          helperText={fieldErrors.zipCode}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 2 }}>
        <FormControl fullWidth error={!!fieldErrors.surfaceType}>
          <InputLabel>Surface Type</InputLabel>
          <Select
            name="surfaceType"
            value={formData.surfaceType}
            onChange={handleSelectChange}
            label="Surface Type"
            disabled={isSubmitting}
          >
            <MenuItem value="ICE">Ice</MenuItem>
            <MenuItem value="TURF">Turf</MenuItem>
            <MenuItem value="COURT">Court</MenuItem>
            <MenuItem value="FIELD">Field</MenuItem>
            <MenuItem value="OTHER">Other</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label="Capacity"
          name="capacity"
          type="number"
          value={formData.capacity}
          onChange={handleChange}
          fullWidth
          disabled={isSubmitting}
          error={!!fieldErrors.capacity}
          helperText={fieldErrors.capacity}
          slotProps={{ htmlInput: { min: 1 } }}
        />
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Amenities
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {AMENITY_OPTIONS.map((amenity) => (
            <Chip
              key={amenity}
              label={amenityLabels[amenity] || amenity}
              onClick={() => toggleAmenity(amenity)}
              color={formData.amenities.includes(amenity) ? "primary" : "default"}
              variant={formData.amenities.includes(amenity) ? "filled" : "outlined"}
              disabled={isSubmitting}
            />
          ))}
        </Stack>
      </Box>

      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          label="Phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          fullWidth
          disabled={isSubmitting}
          error={!!fieldErrors.phone}
          helperText={fieldErrors.phone}
          slotProps={{ htmlInput: { inputMode: "tel" } }}
        />
        <TextField
          label="Website"
          name="website"
          value={formData.website}
          onChange={handleChange}
          fullWidth
          disabled={isSubmitting}
          placeholder="https://..."
          error={!!fieldErrors.website}
          helperText={fieldErrors.website}
        />
      </Box>

      <TextField
        label="Notes"
        name="notes"
        value={formData.notes}
        onChange={handleChange}
        fullWidth
        multiline
        rows={3}
        disabled={isSubmitting}
        error={!!fieldErrors.notes}
        helperText={fieldErrors.notes}
      />

      <FormControl fullWidth error={!!fieldErrors.visibility}>
        <InputLabel>Visibility</InputLabel>
        <Select
          name="visibility"
          value={formData.visibility}
          onChange={handleSelectChange}
          label="Visibility"
          disabled={isSubmitting}
        >
          <MenuItem value="PUBLIC">Public - Anyone can see and use</MenuItem>
          <MenuItem value="LEAGUE">League - Visible to league members</MenuItem>
          <MenuItem value="TEAM">Team - Private to your team</MenuItem>
        </Select>
      </FormControl>

      {formData.visibility === "LEAGUE" && leagues.length > 0 && (
        <FormControl fullWidth error={!!fieldErrors.leagueId}>
          <InputLabel>League</InputLabel>
          <Select
            name="leagueId"
            value={formData.leagueId}
            onChange={handleSelectChange}
            label="League"
            disabled={isSubmitting}
          >
            {leagues.map((league) => (
              <MenuItem key={league.id} value={league.id}>
                {league.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {formData.visibility === "TEAM" && teams.length > 0 && (
        <FormControl fullWidth error={!!fieldErrors.teamId}>
          <InputLabel>Team</InputLabel>
          <Select
            name="teamId"
            value={formData.teamId}
            onChange={handleSelectChange}
            label="Team"
            disabled={isSubmitting}
          >
            {teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <Button
        type="submit"
        variant="contained"
        color="primary"
        size="large"
        disabled={isSubmitting}
        sx={{ mt: 1, minHeight: 48 }}
      >
        {isSubmitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            {isEditMode ? "Updating..." : "Creating..."}
          </>
        ) : isEditMode ? (
          "Update Venue"
        ) : (
          "Create Venue"
        )}
      </Button>
    </Box>
  );
}
