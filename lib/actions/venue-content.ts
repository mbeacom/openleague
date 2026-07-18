"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireVenueContentManager } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import { publicPublishedVenueWhere } from "@/lib/utils/public-venues";
import {
  lessonOfferingSchema,
  skillLevelReferenceSchema,
  venueContentPostSchema,
  venueScheduleBlockSchema,
  type LessonOfferingInput,
  type SkillLevelReferenceInput,
  type VenueContentPostInput,
  type VenueScheduleBlockInput,
} from "@/lib/utils/validation";

const lessonCommandSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  lessonOfferingId: z.string().cuid("Invalid lesson offering ID format"),
});

const postCommandSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  postId: z.string().cuid("Invalid post ID format"),
});

const skillLevelReferenceCommandSchema = skillLevelReferenceSchema.extend({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
});

const skillLevelAssignmentSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  lessonOfferingId: z.string().cuid("Invalid lesson offering ID format").optional(),
  scheduleBlockId: z.string().cuid("Invalid schedule block ID format").optional(),
  skillLevelIds: z.array(z.string().cuid("Invalid skill level ID format")).max(20),
});

const lessonSkillLevelAssignmentSchema = skillLevelAssignmentSchema.extend({
  lessonOfferingId: z.string().cuid("Invalid lesson offering ID format"),
});

const scheduleBlockSkillLevelAssignmentSchema = skillLevelAssignmentSchema.extend({
  scheduleBlockId: z.string().cuid("Invalid schedule block ID format"),
});

const lessonOfferingAdminSelect = {
  id: true,
  title: true,
  status: true,
} as const satisfies Prisma.LessonOfferingSelect;

const venueContentPostAdminSelect = {
  id: true,
  title: true,
  status: true,
} as const satisfies Prisma.VenueContentPostSelect;

type LessonOfferingAdminSummary = Prisma.LessonOfferingGetPayload<{
  select: typeof lessonOfferingAdminSelect;
}>;

type VenueContentPostAdminSummary = Prisma.VenueContentPostGetPayload<{
  select: typeof venueContentPostAdminSelect;
}>;

const publicContentPostSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  body: true,
  publishedAt: true,
} as const satisfies Prisma.VenueContentPostSelect;

const publicLessonOfferingSelect = {
  id: true,
  title: true,
  description: true,
  lessonType: true,
  instructorName: true,
  priceAmount: true,
  priceCurrency: true,
  durationMinutes: true,
  availabilityDescription: true,
  registrationMode: true,
  externalRegistrationUrl: true,
  skillLevels: {
    select: {
      id: true,
      label: true,
      discipline: true,
    },
  },
} as const satisfies Prisma.LessonOfferingSelect;

const publicSpecialtyEventSelect = {
  id: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  priceAmount: true,
  priceCurrency: true,
  priceLabel: true,
  registrationMode: true,
  externalRegistrationUrl: true,
  surface: {
    select: {
      id: true,
      name: true,
    },
  },
} as const satisfies Prisma.VenueScheduleBlockSelect;

interface PublicContentFilters {
  skillLevelIds?: string[];
}

export async function createSkillLevelReference(
  input: SkillLevelReferenceInput & { organizationId: string; venueId: string }
): Promise<ActionResult<{ skillLevelId: string }>> {
  try {
    const validated = skillLevelReferenceCommandSchema.parse(input);
    await requireVenueContentManager(validated.organizationId, validated.venueId);

    const skillLevel = await prisma.skillLevelReference.upsert({
      where: {
        source_discipline_label: {
          source: validated.source,
          discipline: validated.discipline,
          label: validated.label,
        },
      },
      create: {
        source: validated.source,
        discipline: validated.discipline,
        label: validated.label,
        description: validated.description || null,
        sortOrder: validated.sortOrder ?? null,
        isActive: validated.isActive,
      },
      update: {
        description: validated.description || null,
        sortOrder: validated.sortOrder ?? null,
        isActive: validated.isActive,
      },
      select: { id: true },
    });

    return { success: true, data: { skillLevelId: skillLevel.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to save skill level reference." };
  }
}

export async function getSkillLevelReferences() {
  return prisma.skillLevelReference.findMany({
    where: { isActive: true },
    orderBy: [{ discipline: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function assignSkillLevelsToLesson(
  input: z.input<typeof lessonSkillLevelAssignmentSchema>
): Promise<ActionResult<{ lessonOfferingId: string }>> {
  try {
    const validated = lessonSkillLevelAssignmentSchema.parse(input);
    await requireVenueContentManager(validated.organizationId, validated.venueId);
    // Bind venue -> org. Org-wide staff roles satisfy requireVenueContentManager
    // for ANY venueId, so without this an OWNER of their own org could pass a
    // victim's venueId + lessonOfferingId and rewrite its skill-level tags (IDOR).
    await ensureVenue(validated.organizationId, validated.venueId);

    const lesson = await prisma.lessonOffering.update({
      where: { id: validated.lessonOfferingId, venueId: validated.venueId },
      data: { skillLevels: { set: validated.skillLevelIds.map((id) => ({ id })) } },
      select: { id: true },
    });

    return { success: true, data: { lessonOfferingId: lesson.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to assign lesson skill levels." };
  }
}

export async function assignSkillLevelsToScheduleBlock(
  input: z.input<typeof scheduleBlockSkillLevelAssignmentSchema>
): Promise<ActionResult<{ scheduleBlockId: string }>> {
  try {
    const validated = scheduleBlockSkillLevelAssignmentSchema.parse(input);
    await requireVenueContentManager(validated.organizationId, validated.venueId);
    // Bind venue -> org (see assignSkillLevelsToLesson): closes the same IDOR
    // where an org-wide role satisfies the check for a foreign venueId.
    await ensureVenue(validated.organizationId, validated.venueId);

    const block = await prisma.venueScheduleBlock.update({
      where: { id: validated.scheduleBlockId, venueId: validated.venueId },
      data: { skillLevels: { set: validated.skillLevelIds.map((id) => ({ id })) } },
      select: { id: true },
    });

    return { success: true, data: { scheduleBlockId: block.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to assign schedule skill levels." };
  }
}

export async function getVenueContentAdminData(
  organizationId: string,
  venueId: string
): Promise<ActionResult<{ venueId: string; lessons: LessonOfferingAdminSummary[]; posts: VenueContentPostAdminSummary[] }>> {
  try {
    await requireVenueContentManager(organizationId, venueId);
    const [lessons, posts] = await Promise.all([
      prisma.lessonOffering.findMany({ where: { venueId }, select: lessonOfferingAdminSelect, orderBy: { createdAt: "desc" } }),
      prisma.venueContentPost.findMany({ where: { venueId }, select: venueContentPostAdminSelect, orderBy: { createdAt: "desc" } }),
    ]);

    return { success: true, data: { venueId, lessons, posts } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to load venue content." };
  }
}

export async function createLessonOffering(
  input: LessonOfferingInput
): Promise<ActionResult<{ lessonOfferingId: string; status: string }>> {
  try {
    const validated = lessonOfferingSchema.parse(input);
    await requireVenueContentManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenue(validated.organizationId, validated.venueId);

    const lesson = await prisma.lessonOffering.create({
      data: {
        venueId: validated.venueId,
        surfaceId: validated.surfaceId || null,
        title: validated.title,
        description: validated.description || null,
        lessonType: validated.lessonType,
        instructorName: validated.instructorName || null,
        priceAmount: validated.priceAmount ?? null,
        priceCurrency: validated.priceCurrency,
        durationMinutes: validated.durationMinutes ?? null,
        availabilityDescription: validated.availabilityDescription || null,
        registrationMode: validated.registrationMode,
        externalRegistrationUrl: validated.externalRegistrationUrl || null,
        status: "DRAFT",
      },
      select: { id: true, status: true },
    });

    revalidateContentPaths(validated.organizationId, validated.venueId, venue.slug);
    return { success: true, data: { lessonOfferingId: lesson.id, status: lesson.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to create lesson offering." };
  }
}

export async function publishLessonOffering(
  input: z.input<typeof lessonCommandSchema>
): Promise<ActionResult<{ lessonOfferingId: string; status: string }>> {
  return setLessonStatus(input, "PUBLISHED");
}

export async function archiveLessonOffering(
  input: z.input<typeof lessonCommandSchema>
): Promise<ActionResult<{ lessonOfferingId: string; status: string }>> {
  return setLessonStatus(input, "ARCHIVED");
}

export async function publishSpecialtyEvent(
  input: VenueScheduleBlockInput
): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  try {
    const validated = venueScheduleBlockSchema.parse({
      ...input,
      activityType: "SPECIALTY_EVENT",
      visibility: "PUBLIC",
      status: "PUBLISHED",
    });
    const userId = await requireVenueContentManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenue(validated.organizationId, validated.venueId);

    const block = await prisma.venueScheduleBlock.create({
      data: {
        venueId: validated.venueId,
        surfaceId: validated.surfaceId || null,
        title: validated.title,
        description: validated.description || null,
        activityType: "SPECIALTY_EVENT",
        audience: validated.audience,
        visibility: "PUBLIC",
        status: "PUBLISHED",
        startsAt: validated.startsAt,
        endsAt: validated.endsAt,
        capacity: validated.capacity ?? null,
        priceAmount: validated.priceAmount ?? null,
        priceCurrency: validated.priceCurrency,
        priceLabel: validated.priceLabel || null,
        registrationMode: validated.registrationMode,
        externalRegistrationUrl: validated.externalRegistrationUrl || null,
        createdById: userId,
      },
      select: { id: true, status: true },
    });

    revalidateContentPaths(validated.organizationId, validated.venueId, venue.slug);
    return { success: true, data: { scheduleBlockId: block.id, status: block.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to publish specialty event." };
  }
}

export async function saveVenueContentPost(
  input: VenueContentPostInput
): Promise<ActionResult<{ postId: string; status: string; publishedAt: Date | null }>> {
  try {
    const validated = venueContentPostSchema.parse(input);
    const authorId = await requireVenueContentManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenue(validated.organizationId, validated.venueId);
    const publishedAt = validated.status === "PUBLISHED" ? new Date() : null;

    const data = {
      venueId: validated.venueId,
      title: validated.title,
      slug: validated.slug,
      excerpt: validated.excerpt || null,
      body: validated.body,
      status: validated.status,
      scheduledFor: validated.scheduledFor ?? null,
      publishedAt,
    };

    const post = validated.postId
      ? await prisma.venueContentPost.update({
          where: { id: validated.postId, venueId: validated.venueId },
          data,
          select: { id: true, status: true, publishedAt: true },
        })
      : await prisma.venueContentPost.create({
          data: { ...data, authorId },
          select: { id: true, status: true, publishedAt: true },
        });

    revalidateContentPaths(validated.organizationId, validated.venueId, venue.slug);
    return { success: true, data: { postId: post.id, status: post.status, publishedAt: post.publishedAt } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to save venue post." };
  }
}

export async function archiveVenueContentPost(
  input: z.input<typeof postCommandSchema>
): Promise<ActionResult<{ postId: string; status: string }>> {
  try {
    const validated = postCommandSchema.parse(input);
    await requireVenueContentManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenue(validated.organizationId, validated.venueId);

    const post = await prisma.venueContentPost.update({
      where: { id: validated.postId, venueId: validated.venueId },
      data: { status: "ARCHIVED" },
      select: { id: true, status: true },
    });

    revalidateContentPaths(validated.organizationId, validated.venueId, venue.slug);
    return { success: true, data: { postId: post.id, status: post.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to archive venue post." };
  }
}

export async function getPublicVenueContent(venueId: string, filters: PublicContentFilters = {}) {
  const skillLevelWhere = filters.skillLevelIds?.length
    ? { skillLevels: { some: { id: { in: filters.skillLevelIds } } } }
    : {};

  const venue = await prisma.venue.findFirst({
    where: {
      ...publicPublishedVenueWhere,
      id: venueId,
    },
    select: {
      contentPosts: {
        where: { status: "PUBLISHED" },
        select: publicContentPostSelect,
        orderBy: { publishedAt: "desc" },
      },
      lessonOfferings: {
        where: { status: "PUBLISHED", ...skillLevelWhere },
        select: publicLessonOfferingSelect,
        orderBy: { title: "asc" },
      },
      scheduleBlocks: {
        where: { status: "PUBLISHED", visibility: "PUBLIC", activityType: "SPECIALTY_EVENT" },
        select: publicSpecialtyEventSelect,
        orderBy: { startsAt: "asc" },
      },
    },
  });

  if (!venue) {
    return { posts: [], lessons: [], events: [] };
  }

  return { posts: venue.contentPosts, lessons: venue.lessonOfferings, events: venue.scheduleBlocks };
}

async function setLessonStatus(
  input: z.input<typeof lessonCommandSchema>,
  status: "PUBLISHED" | "ARCHIVED"
): Promise<ActionResult<{ lessonOfferingId: string; status: string }>> {
  try {
    const validated = lessonCommandSchema.parse(input);
    await requireVenueContentManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenue(validated.organizationId, validated.venueId);

    const lesson = await prisma.lessonOffering.update({
      where: { id: validated.lessonOfferingId, venueId: validated.venueId },
      data: { status },
      select: { id: true, status: true },
    });

    revalidateContentPaths(validated.organizationId, validated.venueId, venue.slug);
    return { success: true, data: { lessonOfferingId: lesson.id, status: lesson.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update lesson offering." };
  }
}

async function ensureVenue(organizationId: string, venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, organizationId },
    select: { id: true, slug: true },
  });

  if (!venue) {
    throw new Error("Venue not found");
  }

  return venue;
}

function revalidateContentPaths(organizationId: string, venueId: string, slug?: string | null) {
  revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/content`);
  if (slug) {
    revalidatePath(`/rinks/${slug}`);
  }
}
