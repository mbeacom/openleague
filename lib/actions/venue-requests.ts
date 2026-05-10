"use server";

import { requireUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";

export async function getVenueRequestQueue(
  venueId: string
): Promise<ActionResult<{ venueId: string; requests: unknown[] }>> {
  await requireUserId();

  return {
    success: true,
    data: {
      venueId,
      requests: [],
    },
  };
}
