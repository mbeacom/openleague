"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FlagIcon from "@mui/icons-material/Flag";
import { upload } from "@vercel/blob/client";
import {
  finalizeEventMediaUpload,
  removeEventMediaItem,
  reportEventMediaItem,
  type EventGalleryItem,
} from "@/lib/actions/event-media";

interface MediaGalleryProps {
  eventId: string;
  items: EventGalleryItem[];
  canUpload: boolean;
  canModerate: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm";

export function MediaGallery({ eventId, items, canUpload, canModerate }: MediaGalleryProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setMessage(null);
    setProgress(0);
    try {
      const blob = await upload(`signup-events/${eventId}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: `/api/signup-events/${eventId}/media/upload`,
        onUploadProgress: (event) => setProgress(event.percentage),
      });

      const result = await finalizeEventMediaUpload({
        eventId,
        url: blob.url,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      setMessage({ severity: "success", text: "Uploaded!" });
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Upload failed.";
      setMessage({ severity: "error", text });
    } finally {
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (!result.success) {
        setMessage({ severity: "error", text: result.error ?? "Something went wrong." });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">Photos &amp; videos</Typography>
        {canUpload ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(event) => handleFiles(event.target.files)}
            />
            <Button
              startIcon={<AddPhotoAlternateIcon />}
              variant="contained"
              disabled={progress != null}
              onClick={() => fileInputRef.current?.click()}
            >
              Share a photo or video
            </Button>
          </>
        ) : null}
      </Stack>
      {progress != null ? <LinearProgress variant="determinate" value={progress} /> : null}
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      {items.length === 0 ? (
        <Typography color="text.secondary">
          No photos or videos yet{canUpload ? " — be the first to share one." : "."}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" },
          }}
        >
          {items.map((item) => (
            <Card key={item.id} variant="outlined" sx={{ position: "relative" }}>
              {item.kind === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.caption ?? `Photo shared by ${item.uploaderName}`}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                />
              ) : (
                <video
                  src={item.url}
                  controls
                  preload="metadata"
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                />
              )}
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 1, py: 0.5 }}
              >
                <Typography variant="caption" color="text.secondary" noWrap>
                  {item.caption ?? item.uploaderName}
                </Typography>
                <Stack direction="row">
                  {!item.canRemove ? (
                    <Tooltip title="Report this item">
                      <IconButton
                        size="small"
                        disabled={isPending}
                        aria-label="Report this item"
                        onClick={() => run(() => reportEventMediaItem({ mediaItemId: item.id }))}
                      >
                        <FlagIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  {item.canRemove ? (
                    <Tooltip title={canModerate ? "Remove (organizer)" : "Delete your upload"}>
                      <IconButton
                        size="small"
                        disabled={isPending}
                        aria-label="Remove this item"
                        onClick={() => {
                          if (!window.confirm("Remove this photo/video?")) return;
                          run(() => removeEventMediaItem({ mediaItemId: item.id }));
                        }}
                      >
                        <DeleteOutlineIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </Stack>
              </Stack>
            </Card>
          ))}
        </Box>
      )}
    </Stack>
  );
}
