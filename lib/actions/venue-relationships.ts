"use server";

import { requireUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";

export async function getVenueRelationshipAdminData(
  venueId: string
): Promise<ActionResult<{ venueId: string; relationships: unknown[] }>> {
  await requireUserId();

  return {
    success: true,
    data: {
      venueId,
      relationships: [],
    },
  };
}
