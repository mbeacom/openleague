"use server";

import { requireUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";

export async function getVenueScheduleAdminData(
  venueId: string
): Promise<ActionResult<{ venueId: string; surfaces: unknown[]; scheduleBlocks: unknown[] }>> {
  await requireUserId();

  return {
    success: true,
    data: {
      venueId,
      surfaces: [],
      scheduleBlocks: [],
    },
  };
}
