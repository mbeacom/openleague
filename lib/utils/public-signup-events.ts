import { Prisma } from "@prisma/client";

/**
 * Public data boundary for signup events. Everything a PUBLIC (or LINK-token)
 * viewer may see goes through this select. It must NEVER include
 * registrations, registrant/participant identities, invitations, managers, or
 * internal notes.
 */
export const publicSignupEventSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  ageClassification: true,
  status: true,
  visibility: true,
  startAt: true,
  endAt: true,
  timezone: true,
  locationText: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  cancellationCutoffAt: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  acceptsOnlinePayment: true,
  acceptsManualPayment: true,
  venmoHandle: true,
  zelleHandle: true,
  cashAppHandle: true,
  paymentPhone: true,
  paymentInstructions: true,
  galleryEnabled: true,
  galleryVisibility: true,
  publicRoster: true,
  publishedAt: true,
  canceledAt: true,
  hostOrganization: { select: { id: true, name: true } },
  hostLeague: { select: { id: true, name: true, slug: true } },
  hostTeam: { select: { id: true, name: true } },
  venue: {
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      city: true,
      state: true,
      timezone: true,
    },
  },
  slots: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      sortOrder: true,
      capacity: true,
      priceAmount: true,
      priceCurrency: true,
      waitlistEnabled: true,
    },
  },
  phases: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      opensAt: true,
      audience: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.SignupEventSelect;

export type PublicSignupEvent = Prisma.SignupEventGetPayload<{
  select: typeof publicSignupEventSelect;
}>;

/**
 * Privacy-safe display name for opt-in public rosters: first name plus last
 * initial only (e.g. "Jordan S."). Never expose full participant names on
 * public surfaces.
 */
export function toPublicRosterName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0];
  }

  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${parts[0]} ${lastInitial}.`;
}
