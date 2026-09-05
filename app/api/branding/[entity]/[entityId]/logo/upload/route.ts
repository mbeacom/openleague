import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUserId } from "@/lib/auth/session";
import { canBrandEntity } from "@/lib/actions/branding";
import {
  entityLogoPrefix,
  isBlobEnabled,
  isBrandableEntity,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
} from "@/lib/media/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client-upload token exchange for crest logos (Vercel Blob).
 *
 * Mirrors the event-media route: the browser uploads straight to Blob storage
 * with a short-lived token this route issues only after authorizing the caller
 * against the same check the write action uses. Type and size caps are baked
 * into the token so the client cannot exceed them, and the path is pinned to
 * this entity's prefix so a token for one team cannot write another's object.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; entityId: string }> },
): Promise<Response> {
  const { entity, entityId } = await params;

  if (!isBlobEnabled()) {
    return NextResponse.json({ error: "Logo uploads are not configured" }, { status: 503 });
  }
  if (!isBrandableEntity(entity)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canBrandEntity(userId, entity, entityId))) {
    return NextResponse.json(
      { error: "You do not have permission to change this logo" },
      { status: 403 },
    );
  }

  const prefix = entityLogoPrefix(entity, entityId);
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(prefix)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: [...LOGO_CONTENT_TYPES],
          maximumSizeInBytes: LOGO_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ entity, entityId, userId }),
        };
      },
      // The row is written by setEntityLogo once the upload resolves
      // client-side; this callback does not fire in local dev.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
