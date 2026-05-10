"use server";

import { requireUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";

export async function getVenueContentAdminData(
  venueId: string
): Promise<ActionResult<{ venueId: string; lessons: unknown[]; posts: unknown[] }>> {
  await requireUserId();

  return {
    success: true,
    data: {
      venueId,
      lessons: [],
      posts: [],
    },
  };
}
