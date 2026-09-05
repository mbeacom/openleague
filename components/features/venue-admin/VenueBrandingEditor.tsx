"use client";

import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/CloudUpload";
import { upload } from "@vercel/blob/client";
import { Crest } from "@/components/ui/Crest";

type BrandableEntity = "team" | "league" | "venue";

interface VenueBrandingEditorProps {
  logoUrl: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  disabled?: boolean;
  onChange: (field: "logoUrl" | "brandPrimaryColor" | "brandSecondaryColor", value: string) => void;
  /**
   * Entity this branding belongs to. Supplying it turns on file upload; without
   * it the editor stays a URL field, which is what the association's per-team
   * rows still use.
   */
  entity?: BrandableEntity;
  entityId?: string;
  /** Display name — drives the monogram in the preview. */
  name?: string;
  /** Whether Blob storage is configured on this deployment. */
  uploadsEnabled?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Branding panel for an association or venue profile.
 *
 * Deliberately form-controlled rather than saving on its own: it sits inside a
 * larger profile form with one Save button, and a control that wrote through
 * immediately while its neighbors waited for submit would leave an owner unable
 * to say what state they had actually committed. Uploading a file therefore
 * writes the resulting URL into the form and leaves the save to the parent.
 */
export function VenueBrandingEditor({
  logoUrl,
  brandPrimaryColor,
  brandSecondaryColor,
  disabled = false,
  onChange,
  entity,
  entityId,
  name = "",
  uploadsEnabled = false,
}: VenueBrandingEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUpload = uploadsEnabled && Boolean(entity && entityId);

  const handleFile = async (file: File | undefined) => {
    if (!file || !entity || !entityId) return;
    setError(null);

    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Logos must be 2 MB or smaller.");
      return;
    }

    setProgress(0);
    try {
      const blob = await upload(`branding/${entity}/${entityId}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: `/api/branding/${entity}/${entityId}/logo/upload`,
        onUploadProgress: (event) => setProgress(event.percentage),
      });
      onChange("logoUrl", blob.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Branding</Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "center" }}>
        <Crest
          name={name || "?"}
          id={entityId ?? name}
          logoUrl={logoUrl || null}
          brandColor={brandPrimaryColor || null}
          size="xl"
        />
        <Stack spacing={1.5} sx={{ flex: 1, width: "100%" }}>
          <TextField
            label="Logo URL"
            name="logoUrl"
            value={logoUrl}
            onChange={(event) => onChange("logoUrl", event.target.value)}
            disabled={disabled}
            fullWidth
          />
          {canUpload ? (
            <Box>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(event) => void handleFile(event.target.files?.[0] ?? undefined)}
              />
              <Button
                startIcon={<UploadIcon />}
                variant="outlined"
                disabled={disabled || progress != null}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload an image
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                JPEG, PNG, or WebP up to 2 MB. Save the profile to apply it.
              </Typography>
            </Box>
          ) : null}
        </Stack>
      </Stack>

      {progress != null ? <LinearProgress variant="determinate" value={progress} /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <ColorField
          label="Primary brand color"
          name="brandPrimaryColor"
          value={brandPrimaryColor}
          placeholder="#003B73"
          disabled={disabled}
          onChange={(value) => onChange("brandPrimaryColor", value)}
        />
        <ColorField
          label="Secondary brand color"
          name="brandSecondaryColor"
          value={brandSecondaryColor}
          placeholder="#18A999"
          disabled={disabled}
          onChange={(value) => onChange("brandSecondaryColor", value)}
        />
      </Stack>
    </Stack>
  );
}

/**
 * Hex field with a swatch beside it. The swatch is a convenience, not the
 * source of truth — the text field stays authoritative so a pasted brand hex
 * from a style guide round-trips exactly, and so an empty value stays empty
 * rather than being coerced to the picker's default black.
 */
function ColorField({
  label,
  name,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const isValidHex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flex: 1 }}>
      <Box
        component="input"
        type="color"
        aria-label={`${label} swatch`}
        value={isValidHex ? value : placeholder}
        disabled={disabled}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        sx={{
          width: 48,
          height: 56,
          flexShrink: 0,
          p: 0.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          background: "none",
          cursor: disabled ? "default" : "pointer",
        }}
      />
      <TextField
        label={label}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        fullWidth
        sx={{ "& input": { fontFamily: "var(--font-mono), monospace" } }}
      />
    </Stack>
  );
}
