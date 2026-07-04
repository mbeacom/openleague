import { del } from "@vercel/blob";
import { isBlobConfigured } from "@/lib/env";

/**
 * Vercel Blob integration for event media galleries — the platform's first
 * object-storage use. Media uploads are feature-flagged on
 * BLOB_READ_WRITE_TOKEN; without it galleries are hidden everywhere.
 *
 * Storage model: blobs are stored web-accessible under unguessable
 * server-randomized pathnames (capability URLs, like LINK event tokens).
 * Authorization is enforced on the gallery LISTING — who may browse, upload,
 * and moderate — while individual URLs are unguessable. True private blobs
 * with per-request signed URLs are a follow-up (see tasks.md notes).
 */

export function isBlobEnabled(): boolean {
  return isBlobConfigured;
}

/** Images: 10 MB. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Videos: 200 MB (duration capped client-side; size is authoritative). */
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const VIDEO_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const ALLOWED_CONTENT_TYPES = [...IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES];

export function mediaKindForContentType(contentType: string): "PHOTO" | "VIDEO" | null {
  if ((IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType)) return "PHOTO";
  if ((VIDEO_CONTENT_TYPES as readonly string[]).includes(contentType)) return "VIDEO";
  return null;
}

export function maxBytesForContentType(contentType: string): number {
  return mediaKindForContentType(contentType) === "VIDEO" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
}

/** The pathname prefix every upload for an event must live under. */
export function eventMediaPrefix(eventId: string): string {
  return `signup-events/${eventId}/`;
}

/** Best-effort blob deletion — a storage failure must not fail the DB removal. */
export async function deleteBlobBestEffort(url: string): Promise<void> {
  if (!isBlobEnabled()) return;
  try {
    await del(url);
  } catch (error) {
    console.error("Failed to delete blob (leaving orphan):", error);
  }
}
