"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  attachVenueToOrganization,
  createOrganizationVenue,
} from "@/lib/actions/venue-organizations";
import { createVenueSchema, SURFACE_TYPES } from "@/lib/utils/validation";

interface AttachableVenue {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  surfaceType: string;
}

interface AddOrganizationVenueFormProps {
  organizationId: string;
  attachableVenues: AttachableVenue[];
}

export function AddOrganizationVenueForm({
  organizationId,
  attachableVenues,
}: AddOrganizationVenueFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    surfaceType: "ICE",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = createVenueSchema.safeParse({
      ...formData,
      organizationId,
      visibility: "PUBLIC",
      amenities: [],
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please fix the form fields.");
      return;
    }

    startTransition(async () => {
      const result = await createOrganizationVenue(parsed.data);
      if (result.success) {
        router.push(`/venue-admin/${organizationId}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleAttach(venueId: string) {
    setAttachError(null);
    startTransition(async () => {
      const result = await attachVenueToOrganization({ organizationId, venueId });
      if (result.success) {
        router.push(`/venue-admin/${organizationId}`);
        router.refresh();
      } else {
        setAttachError(result.error);
      }
    });
  }

  return (
    <Stack spacing={4}>
      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Venue name"
          value={formData.name}
          onChange={(event) => updateField("name", event.target.value)}
          required
          disabled={isPending}
        />
        <TextField
          select
          label="Surface type"
          value={formData.surfaceType}
          onChange={(event) => updateField("surfaceType", event.target.value)}
          disabled={isPending}
        >
          {SURFACE_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {type.replaceAll("_", " ")}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Address"
          value={formData.address}
          onChange={(event) => updateField("address", event.target.value)}
          disabled={isPending}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="City"
            value={formData.city}
            onChange={(event) => updateField("city", event.target.value)}
            disabled={isPending}
            fullWidth
          />
          <TextField
            label="State"
            value={formData.state}
            onChange={(event) => updateField("state", event.target.value)}
            disabled={isPending}
            fullWidth
          />
          <TextField
            label="ZIP code"
            value={formData.zipCode}
            onChange={(event) => updateField("zipCode", event.target.value)}
            disabled={isPending}
            fullWidth
          />
        </Stack>
        <Button type="submit" variant="contained" disabled={isPending}>
          Add venue
        </Button>
      </Stack>

      {attachableVenues.length > 0 && (
        <Stack spacing={2}>
          <Divider />
          <Typography variant="h6" component="h2">
            Attach an existing venue
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Standalone venues you created can be brought under this organization.
          </Typography>
          {attachError && <Alert severity="error">{attachError}</Alert>}
          {attachableVenues.map((venue) => (
            <Card key={venue.id} variant="outlined">
              <CardContent>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  alignItems={{ sm: "center" }}
                  justifyContent="space-between"
                >
                  <div>
                    <Typography variant="subtitle1">{venue.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[venue.city, venue.state].filter(Boolean).join(", ") || "No location set"}
                      {" - "}
                      {venue.surfaceType}
                    </Typography>
                  </div>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => handleAttach(venue.id)}
                    disabled={isPending}
                  >
                    Attach
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
