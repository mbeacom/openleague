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
  // Optional schematic facility map (feature 006, FR-017).
  layout: true,
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
  scheduleBlocks: {
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
    select: {
      id: true,
      title: true,
      activityType: true,
      startsAt: true,
      endsAt: true,
      surface: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 3,
  },
} as const satisfies Prisma.VenueSelect;

export function getPublicVenueProfileSelect(now: Date) {
  return {
    ...publicVenueProfileSelect,
    scheduleBlocks: {
      ...publicVenueProfileSelect.scheduleBlocks,
      where: {
        ...publicVenueProfileSelect.scheduleBlocks.where,
        startsAt: { gte: now },
      },
    },
  } as const satisfies Prisma.VenueSelect;
}

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
} as const satisfies Prisma.VenueSelect;

export const publicPublishedVenueWhere = {
  isActive: true,
  visibility: "PUBLIC",
  profileStatus: "PUBLISHED",
  slug: { not: null },
} as const satisfies Prisma.VenueWhereInput;

export type PublicVenueProfile = Prisma.VenueGetPayload<{
  select: ReturnType<typeof getPublicVenueProfileSelect>;
}>;

export type PublicVenueSummary = Prisma.VenueGetPayload<{
  select: typeof publicVenueSummarySelect;
}>;