import { prisma } from "@/lib/db/prisma";
import { VENUE_PROFILE_ROLES } from "@/lib/auth/session";

/**
 * VenueStaff bootstrap helpers.
 *
 * Plain (non-"use server") module on purpose: these must be importable by
 * venue Server Actions without becoming client-callable RPC endpoints —
 * calling them writes staff rows with no auth check of their own. Callers
 * are responsible for authenticating and authorizing first.
 */

type VenueStaffClient = Pick<typeof prisma, "venueStaff">;

export interface VenueStaffBootstrapInput {
  organizationId: string;
  userId: string;
  /** Omit (or null) for an organization-wide staff row covering every venue. */
  venueId?: string | null;
}

/**
 * Create an ACTIVE OWNER staff row — the single bootstrap write used by
 * venue-organization onboarding. Accepts a transaction client so callers can
 * bootstrap inside an existing transaction.
 */
export function createOwnerVenueStaff(
  client: VenueStaffClient,
  input: VenueStaffBootstrapInput
) {
  return client.venueStaff.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      venueId: input.venueId ?? null,
      role: "OWNER",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });
}

/**
 * Ensure the user can manage a newly created org venue. Org-wide OWNER/MANAGER
 * rows (venueId null) already cover every venue in the organization — the
 * common case, since onboarding grants the creator an org-wide OWNER row. If
 * the user only holds venue-scoped rows, grant a per-venue OWNER row for the
 * venue they just created so it does not become unmanageable to them.
 */
export async function ensureVenueStaffCoverage(
  client: VenueStaffClient,
  input: { organizationId: string; userId: string; venueId: string }
): Promise<void> {
  const orgWideManager = await client.venueStaff.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      venueId: null,
      status: "ACTIVE",
      role: { in: [...VENUE_PROFILE_ROLES] },
    },
    select: { id: true },
  });

  if (orgWideManager) return;

  await createOwnerVenueStaff(client, input);
}
