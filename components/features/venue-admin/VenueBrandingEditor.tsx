"use client";

import { Stack, TextField, Typography } from "@mui/material";

interface VenueBrandingEditorProps {
  logoUrl: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  disabled?: boolean;
  onChange: (field: "logoUrl" | "brandPrimaryColor" | "brandSecondaryColor", value: string) => void;
}

export function VenueBrandingEditor({
  logoUrl,
  brandPrimaryColor,
  brandSecondaryColor,
  disabled = false,
  onChange,
}: VenueBrandingEditorProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Branding</Typography>
      <TextField
        label="Logo URL"
        name="logoUrl"
        value={logoUrl}
        onChange={(event) => onChange("logoUrl", event.target.value)}
        disabled={disabled}
        fullWidth
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Primary brand color"
          name="brandPrimaryColor"
          value={brandPrimaryColor}
          onChange={(event) => onChange("brandPrimaryColor", event.target.value)}
          disabled={disabled}
          placeholder="#003B73"
          fullWidth
        />
        <TextField
          label="Secondary brand color"
          name="brandSecondaryColor"
          value={brandSecondaryColor}
          onChange={(event) => onChange("brandSecondaryColor", event.target.value)}
          disabled={disabled}
          placeholder="#18A999"
          fullWidth
        />
      </Stack>
    </Stack>
  );
}
