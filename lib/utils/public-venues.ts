import type { Prisma } from "@prisma/client";

export const publicVenueProfileSelect = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  zipCode: true,
  website: true,
  slug: true,
  surfaceType: true,
  capacity: true,
  amenities: true,
  publicDescription: true,
  logoUrl: true,
  brandPrimaryColor: true,
  brandSecondaryColor: true,
  timezone: true,
  publicEmail: true,
  publicPhone: true,
  profileStatus: true,
  publishedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  surfaces: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      surfaceType: true,
      capacity: true,
      isDefault: true,
      displayOrder: true,
    },
    orderBy: { displayOrder: "asc" },
  },
} as const;

export const publicVenueSummarySelect = {
  id: true,
  name: true,
  city: true,
  state: true,
  slug: true,
  publicDescription: true,
  logoUrl: true,
  brandPrimaryColor: true,
  brandSecondaryColor: true,
  profileStatus: true,
  _count: {
    select: {
      surfaces: true,
    },
  },
} as const;

export const publicPublishedVenueWhere = {
  isActive: true,
  visibility: "PUBLIC",
  profileStatus: "PUBLISHED",
  slug: { not: null },
} as const;

export type PublicVenueProfile = Prisma.VenueGetPayload<{
  select: typeof publicVenueProfileSelect;
}>;

export type PublicVenueSummary = Prisma.VenueGetPayload<{
  select: typeof publicVenueSummarySelect;
}>;