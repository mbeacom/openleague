"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Divider, Stack, TextField, Typography } from "@mui/material";
import { publishVenueProfile, updateVenueProfile } from "@/lib/actions/venue-organizations";
import { updateVenueProfileSchema } from "@/lib/utils/validation";
import { VenueBrandingEditor } from "./VenueBrandingEditor";

interface VenueProfileEditorProps {
  organizationId: string;
  venue: {
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
    state: string | null;
    publicDescription: string | null;
    logoUrl: string | null;
    brandPrimaryColor: string | null;
    brandSecondaryColor: string | null;
    timezone: string;
    publicEmail: string | null;
    publicPhone: string | null;
    privateManagerNotes: string | null;
    profileStatus: string;
  };
}

export function VenueProfileEditor({ organizationId, venue }: VenueProfileEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: venue.name,
    slug: venue.slug ?? "",
    city: venue.city ?? "",
    state: venue.state ?? "",
    publicDescription: venue.publicDescription ?? "",
    logoUrl: venue.logoUrl ?? "",
    brandPrimaryColor: venue.brandPrimaryColor ?? "",
    brandSecondaryColor: venue.brandSecondaryColor ?? "",
    timezone: venue.timezone,
    publicEmail: venue.publicEmail ?? "",
    publicPhone: venue.publicPhone ?? "",
    privateManagerNotes: venue.privateManagerNotes ?? "",
    surfaceType: "ICE",
    profileStatus: venue.profileStatus as "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED",
  });

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
    setError(null);
    setMessage(null);
  }

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateVenueProfileSchema.safeParse({
      organizationId,
      venueId: venue.id,
      ...formData,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please fix the profile fields.");
      return;
    }

    startTransition(async () => {
      const result = await updateVenueProfile(parsed.data);
      if (result.success) {
        setMessage("Profile saved.");
      } else {
        setError(result.error);
      }
    });
  }

  function publishProfile() {
    startTransition(async () => {
      const result = await publishVenueProfile({ organizationId, venueId: venue.id });
      if (result.success) {
        setMessage("Profile published.");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Stack component="form" spacing={2} onSubmit={saveProfile} sx={{ maxWidth: 840 }}>
      <Typography variant="h5">Venue profile</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <TextField
        label="Venue name"
        value={formData.name}
        onChange={(event) => updateField("name", event.target.value)}
        required
        disabled={isPending}
      />
      <TextField
        label="Public slug"
        value={formData.slug}
        onChange={(event) => updateField("slug", event.target.value)}
        helperText="Lowercase letters, numbers, and hyphens only"
        disabled={isPending}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField label="City" value={formData.city} onChange={(event) => updateField("city", event.target.value)} disabled={isPending} fullWidth />
        <TextField label="State" value={formData.state} onChange={(event) => updateField("state", event.target.value)} disabled={isPending} fullWidth />
      </Stack>
      <TextField
        label="Public description"
        value={formData.publicDescription}
        onChange={(event) => updateField("publicDescription", event.target.value)}
        multiline
        minRows={4}
        disabled={isPending}
      />
      <VenueBrandingEditor
        logoUrl={formData.logoUrl}
        brandPrimaryColor={formData.brandPrimaryColor}
        brandSecondaryColor={formData.brandSecondaryColor}
        disabled={isPending}
        onChange={updateField}
      />
      <Divider />
      <TextField
        label="Public email"
        type="email"
        value={formData.publicEmail}
        onChange={(event) => updateField("publicEmail", event.target.value)}
        disabled={isPending}
      />
      <TextField
        label="Private manager notes"
        value={formData.privateManagerNotes}
        onChange={(event) => updateField("privateManagerNotes", event.target.value)}
        multiline
        minRows={3}
        disabled={isPending}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button type="submit" variant="contained" disabled={isPending}>
          Save profile
        </Button>
        <Button type="button" variant="outlined" onClick={publishProfile} disabled={isPending}>
          Publish profile
        </Button>
      </Stack>
    </Stack>
  );
}
