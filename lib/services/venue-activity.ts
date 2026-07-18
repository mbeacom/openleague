import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

/**
 * Venue activity-log helpers.
 *
 * These live in a plain (non-"use server") module on purpose: they must be
 * importable by venue Server Actions, but must NOT themselves be exposed as
 * client-callable RPC endpoints. When these were exported from a "use server"
 * file, an unauthenticated caller could invoke logVenueActivity directly and
 * forge audit-log rows with an arbitrary actorId/venueId. Callers are
 * responsible for authenticating and authorizing before logging.
 */
export interface VenueActivityLogInput {
  venueId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  summary: string;
  details?: Prisma.InputJsonValue;
}

/**
 * Write a venue activity-log row. Accepts either the shared prisma client or a
 * transaction client so callers can log inside an existing transaction.
 */
export function createVenueActivityLog(
  client: Pick<typeof prisma, "venueActivityLog">,
  input: VenueActivityLogInput
) {
  return client.venueActivityLog.create({
    data: {
      venueId: input.venueId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      summary: input.summary,
      details: input.details ?? undefined,
    },
  });
}

export function logVenueActivity(input: VenueActivityLogInput) {
  return createVenueActivityLog(prisma, input);
}
