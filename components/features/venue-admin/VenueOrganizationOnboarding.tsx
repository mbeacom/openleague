"use client";

import { useState, useTransition } from "react";
import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { createVenueOrganization } from "@/lib/actions/venue-organizations";
import { createVenueOrganizationSchema, VENUE_ORGANIZATION_TYPES } from "@/lib/utils/validation";

export function VenueOrganizationOnboarding() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "RINK",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    website: "",
    description: "",
  });

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = createVenueOrganizationSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please fix the form fields.");
      return;
    }

    startTransition(async () => {
      const result = await createVenueOrganization(parsed.data);
      if (result.success) {
        setSuccess("Venue organization created.");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit} sx={{ maxWidth: 720 }}>
      <Typography variant="h5">Create rink organization</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      <TextField
        label="Organization name"
        value={formData.name}
        onChange={(event) => updateField("name", event.target.value)}
        required
        disabled={isPending}
      />
      <TextField
        select
        label="Organization type"
        value={formData.type}
        onChange={(event) => updateField("type", event.target.value)}
        disabled={isPending}
      >
        {VENUE_ORGANIZATION_TYPES.map((type) => (
          <MenuItem key={type} value={type}>
            {type.replaceAll("_", " ")}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Primary contact name"
        value={formData.primaryContactName}
        onChange={(event) => updateField("primaryContactName", event.target.value)}
        disabled={isPending}
      />
      <TextField
        label="Primary contact email"
        type="email"
        value={formData.primaryContactEmail}
        onChange={(event) => updateField("primaryContactEmail", event.target.value)}
        disabled={isPending}
      />
      <TextField
        label="Website"
        value={formData.website}
        onChange={(event) => updateField("website", event.target.value)}
        disabled={isPending}
      />
      <TextField
        label="Description"
        value={formData.description}
        onChange={(event) => updateField("description", event.target.value)}
        multiline
        minRows={3}
        disabled={isPending}
      />
      <Button type="submit" variant="contained" disabled={isPending}>
        Create organization
      </Button>
    </Stack>
  );
}
