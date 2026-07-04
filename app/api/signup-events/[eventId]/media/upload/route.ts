import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId, isEventManager } from "@/lib/auth/session";
import { isConfirmedEventRegistrant } from "@/lib/utils/event-access";
import {
  ALLOWED_CONTENT_TYPES,
  eventMediaPrefix,
  isBlobEnabled,
  VIDEO_MAX_BYTES,
} from "@/lib/media/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client-upload token exchange for event media (Vercel Blob). The browser
 * uploads directly to Blob storage with a token this route issues after
 * authorizing the caller — confirmed registrants and event managers only,
 * on events whose gallery is enabled. Size/type caps are baked into the
 * token so the client cannot exceed them; a server-added random suffix
 * makes every stored pathname unguessable.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<Response> {
  const { eventId } = await params;

  if (!isBlobEnabled()) {
    return NextResponse.json({ error: "Media uploads are not configured" }, { status: 503 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, galleryEnabled: true },
  });
  if (!event || event.status === "CANCELED") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!event.galleryEnabled) {
    return NextResponse.json({ error: "The gallery is disabled for this event" }, { status: 403 });
  }

  const [manager, registrant] = await Promise.all([
    isEventManager(userId, eventId),
    isConfirmedEventRegistrant(eventId, userId),
  ]);
  if (!manager && !registrant) {
    return NextResponse.json(
      { error: "Only event participants and organizers can share media" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(eventMediaPrefix(eventId))) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
          // Videos are the larger cap; finalize validates per-kind limits.
          maximumSizeInBytes: VIDEO_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ eventId, userId }),
        };
      },
      // Rows are created by the finalize server action after the upload
      // resolves client-side (this callback does not fire in local dev).
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
