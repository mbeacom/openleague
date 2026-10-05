import { del } from "@vercel/blob";
import { isBlobConfigured } from "@/lib/env";

/** Crest logo limits live in the portable logo-rules module; re-exported for the upload route. */
export { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from "./logo-rules";

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

/** The entity kinds that own a crest. */
export const BRANDABLE_ENTITIES = ["team", "league", "venue"] as const;
export type BrandableEntity = (typeof BRANDABLE_ENTITIES)[number];

export function isBrandableEntity(value: string): value is BrandableEntity {
  return (BRANDABLE_ENTITIES as readonly string[]).includes(value);
}

/** The pathname prefix every crest upload for an entity must live under. */
export function entityLogoPrefix(entity: BrandableEntity, entityId: string): string {
  return `branding/${entity}/${entityId}/`;
}

/** The read-write token's form: `vercel_blob_rw_<storeId>_<secret>` (as @vercel/blob parses it). */
const READ_WRITE_TOKEN_PREFIX = "vercel_blob_rw_";
const STORE_ID = /^[A-Za-z0-9]+$/;

/**
 * The public host of this project's own blob store, from the read-write token
 * every upload is signed with, or null when no valid token is configured.
 * Read at call time rather than through lib/env's import-time snapshot. The
 * store id is lowercased because a parsed URL's hostname always is.
 */
export function ownedBlobHost(token: string | undefined = process.env.BLOB_READ_WRITE_TOKEN): string | null {
  const value = token?.trim();
  if (!value?.startsWith(READ_WRITE_TOKEN_PREFIX)) return null;
  const storeId = value.slice(READ_WRITE_TOKEN_PREFIX.length).split("_")[0];
  if (!STORE_ID.test(storeId)) return null;
  return `${storeId.toLowerCase()}.public.blob.vercel-storage.com`;
}

/**
 * Whether a URL is one of our own blob objects under the given prefix.
 *
 * Both halves matter. The host must be exactly this project's store, so a URL
 * from anywhere else is never stored, served or fetched as if it were ours;
 * the prefix check stops one entity's admin from pointing their crest at
 * another entity's object and having a later delete take out a file they
 * never owned. Without a configured store nothing is owned.
 */
export function isOwnedBlobUrl(url: string, prefix: string): boolean {
  const host = ownedBlobHost();
  if (!host) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.host !== host) return false;
  if (parsed.username || parsed.password) return false;
  return parsed.pathname.replace(/^\//, "").startsWith(prefix);
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
