"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { upload } from "@vercel/blob/client";
import { Crest } from "@/components/ui/Crest";
import {
  clearEntityLogo,
  setEntityBrandColors,
  setEntityLogo,
} from "@/lib/actions/branding";
import { crestColorForId } from "@/lib/utils/crest";

type BrandableEntity = "team" | "league" | "venue";

export interface LogoUploaderProps {
  entity: BrandableEntity;
  entityId: string;
  /** The entity's display name — drives the monogram preview. */
  name: string;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  /**
   * Whether Blob storage is configured. When it is not, the control falls back
   * to accepting a hosted image URL rather than disappearing — an owner with
   * artwork on their own site can still set a crest.
   */
  uploadsEnabled: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Crest editor: upload a logo, or choose the color the monogram falls back to.
 *
 * The preview is the real Crest component rather than a bare thumbnail, so what
 * an owner approves here is exactly what every roster, dashboard, and schedule
 * will show — including the containment that keeps a wide wordmark intact.
 */
export function LogoUploader({
  entity,
  entityId,
  name,
  logoUrl,
  brandPrimaryColor,
  uploadsEnabled,
}: LogoUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [color, setColor] = useState(brandPrimaryColor ?? crestColorForId(entityId));
  const [urlDraft, setUrlDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const busy = progress != null || isPending;

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, okText: string) => {
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (!result.success) {
        setMessage({ severity: "error", text: result.error ?? "Something went wrong." });
        return;
      }
      setMessage({ severity: "success", text: okText });
      router.refresh();
    });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);

    if (!ACCEPT.split(",").includes(file.type)) {
      setMessage({ severity: "error", text: "Use a JPEG, PNG, or WebP image." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ severity: "error", text: "Logos must be 2 MB or smaller." });
      return;
    }

    setProgress(0);
    try {
      const blob = await upload(`branding/${entity}/${entityId}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: `/api/branding/${entity}/${entityId}/logo/upload`,
        onUploadProgress: (event) => setProgress(event.percentage),
      });

      const result = await setEntityLogo({ entity, entityId, url: blob.url });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      setMessage({ severity: "success", text: "Logo updated." });
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Upload failed.";
      setMessage({ severity: "error", text });
    } finally {
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems={{ sm: "center" }}>
        <Crest
          name={name}
          id={entityId}
          logoUrl={logoUrl}
          brandColor={color}
          size="xl"
        />

        <Box
          onDragOver={(event) => {
            if (!uploadsEnabled) return;
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            if (!uploadsEnabled) return;
            event.preventDefault();
            setIsDragging(false);
            void handleFile(event.dataTransfer.files?.[0]);
          }}
          sx={{
            flex: 1,
            width: "100%",
            border: "1px dashed",
            borderColor: isDragging ? "secondary.main" : "divider",
            backgroundColor: isDragging ? "action.hover" : "transparent",
            borderRadius: 1,
            p: 2,
            transition: "border-color 0.2s, background-color 0.2s",
          }}
        >
          {uploadsEnabled ? (
            <Stack spacing={1.5} alignItems="flex-start">
              <Typography variant="body2" color="text.secondary">
                Drop a square image here, or choose a file. JPEG, PNG, or WebP up to 2 MB.
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(event) => void handleFile(event.target.files?.[0] ?? undefined)}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  startIcon={<UploadIcon />}
                  variant="contained"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {logoUrl ? (
                  <Button
                    startIcon={<DeleteOutlineIcon />}
                    color="inherit"
                    disabled={busy}
                    onClick={() =>
                      run(() => clearEntityLogo({ entity, entityId }), "Logo removed.")
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                File uploads are not configured on this deployment. Paste a link to a hosted
                image instead.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  fullWidth
                  label="Image URL"
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  placeholder="https://example.com/crest.png"
                />
                <Button
                  variant="contained"
                  disabled={busy || !urlDraft.trim()}
                  onClick={() =>
                    run(
                      () => setEntityLogo({ entity, entityId, url: urlDraft.trim() }),
                      "Logo updated.",
                    )
                  }
                >
                  Save
                </Button>
              </Stack>
            </Stack>
          )}
        </Box>
      </Stack>

      {progress != null ? <LinearProgress variant="determinate" value={progress} /> : null}
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Crest color
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Used for the monogram when there is no logo, and for the rule across the top of
          this page.
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Box
            component="input"
            type="color"
            aria-label="Crest color"
            value={color}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setColor(event.target.value)
            }
            sx={{
              width: 44,
              height: 40,
              p: 0.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              background: "none",
              cursor: "pointer",
            }}
          />
          <TextField
            size="small"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            sx={{ width: 130, "& input": { fontFamily: "var(--font-mono), monospace" } }}
            slotProps={{ htmlInput: { "aria-label": "Crest color hex value" } }}
          />
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  setEntityBrandColors({ entity, entityId, brandPrimaryColor: color }),
                "Crest color saved.",
              )
            }
          >
            Save color
          </Button>
          {brandPrimaryColor ? (
            <Button
              startIcon={<RestartAltIcon />}
              color="inherit"
              disabled={busy}
              onClick={() => {
                setColor(crestColorForId(entityId));
                run(
                  () =>
                    setEntityBrandColors({ entity, entityId, brandPrimaryColor: null }),
                  "Crest color reset.",
                );
              }}
            >
              Reset
            </Button>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}
