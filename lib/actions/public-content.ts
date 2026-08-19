"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";
import { rethrowIfNextRedirectError } from "@/lib/utils/next-errors";
import {
  publicContentDetailSelect,
  publicContentSelect,
  publicContentWhere,
  publicPublishedAssociationWhere,
} from "@/lib/utils/public-associations";

/**
 * Association news and announcements (feature 007 / User Story 4).
 *
 * Publication is scheduled by *time*, not by a job: an item with a past
 * `publishAt` reads as published. Nothing has to run at the appointed minute,
 * which is what makes scheduled publication idempotent — and means a missed or
 * doubled worker run cannot withhold or duplicate an announcement.
 */

/**
 * Author-supplied text is stored as written, trimmed only.
 *
 * It is deliberately NOT HTML-escaped at rest: React escapes on render, so
 * escaping here would store `&amp;` and display it literally. No other action
 * in this codebase escapes display text at rest either — see the roster, gear,
 * and volunteer actions.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const cuid = z.string().cuid("Invalid ID format");

const slugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens");

const createSchema = z.object({
  leagueId: cuid,
  teamId: cuid.optional(),
  slug: slugSchema,
  title: z.string().min(1, "A title is required").max(200),
  summary: z.string().max(400).optional(),
  body: z.string().min(1, "Some content is required").max(20000),
  visibility: z.enum(["PUBLIC", "MEMBERS_ONLY"]).default("PUBLIC"),
  /** Omitted publishes immediately; a future value schedules it. */
  publishAt: z.coerce.date().optional(),
});

export type CreatePublicContentInput = z.input<typeof createSchema>;

async function canPublish(userId: string, leagueId: string, teamId?: string) {
  return hasCapability({
    userId,
    leagueId,
    capability: Capability.MANAGE_PUBLIC_CONTENT,
    teamId,
  });
}

export async function createPublicContent(
  input: CreatePublicContentInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = createSchema.parse(input);

    if (!(await canPublish(userId, validated.leagueId, validated.teamId))) {
      return { success: false, error: "You do not have permission to publish here." };
    }

    if (validated.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: validated.teamId, leagueId: validated.leagueId },
        select: { id: true },
      });
      if (!team) {
        return { success: false, error: "That team does not belong to this association." };
      }
    }

    const existing = await prisma.publicContentItem.findFirst({
      where: { leagueId: validated.leagueId, slug: validated.slug },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "That address is already used by another post." };
    }

    const now = new Date();
    const publishAt = validated.publishAt ?? now;
    // SCHEDULED and PUBLISHED are the same row with a different publishAt; the
    // public reader gates on the timestamp, so the status is a label for
    // administrators rather than a switch the reader consults.
    const scheduled = publishAt > now;

    const item = await prisma.publicContentItem.create({
      data: {
        leagueId: validated.leagueId,
        teamId: validated.teamId ?? null,
        slug: validated.slug,
        title: validated.title.trim(),
        summary: validated.summary ? validated.summary.trim() : null,
        body: validated.body.trim(),
        visibility: validated.visibility,
        status: scheduled ? "SCHEDULED" : "PUBLISHED",
        publishAt,
        publishedAt: scheduled ? null : now,
        authorId: userId,
      },
      select: { id: true },
    });

    revalidatePath(`/league/${validated.leagueId}/content`);
    return { success: true, data: { id: item.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error creating public content:", error);
    return { success: false, error: "Failed to save the post." };
  }
}

const updateSchema = z.object({
  itemId: cuid,
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(400).nullable().optional(),
  body: z.string().min(1).max(20000).optional(),
  visibility: z.enum(["PUBLIC", "MEMBERS_ONLY"]).optional(),
  publishAt: z.coerce.date().optional(),
});

export async function updatePublicContent(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = updateSchema.parse(input);

    const item = await prisma.publicContentItem.findUnique({
      where: { id: validated.itemId },
      select: { id: true, leagueId: true, teamId: true, status: true, publishedAt: true },
    });
    if (!item) return { success: false, error: "That post could not be found." };

    if (!(await canPublish(userId, item.leagueId, item.teamId ?? undefined))) {
      return { success: false, error: "You do not have permission to edit this post." };
    }
    if (item.status === "ARCHIVED") {
      return { success: false, error: "Archived posts cannot be edited." };
    }

    const now = new Date();
    const nextPublishAt = validated.publishAt;
    const scheduled = nextPublishAt ? nextPublishAt > now : undefined;

    await prisma.publicContentItem.update({
      where: { id: item.id },
      data: {
        ...(validated.title !== undefined ? { title: validated.title.trim() } : {}),
        ...(validated.summary !== undefined
          ? { summary: validated.summary === null ? null : validated.summary.trim() }
          : {}),
        ...(validated.body !== undefined ? { body: validated.body.trim() } : {}),
        ...(validated.visibility !== undefined ? { visibility: validated.visibility } : {}),
        ...(nextPublishAt
          ? {
              publishAt: nextPublishAt,
              status: scheduled ? ("SCHEDULED" as const) : ("PUBLISHED" as const),
              // Keep the original publication moment when one exists; moving a
              // published post's date forward should not rewrite its history.
              publishedAt: scheduled ? null : (item.publishedAt ?? now),
            }
          : {}),
      },
    });

    revalidatePath(`/league/${item.leagueId}/content`);
    return { success: true, data: { id: item.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error updating public content:", error);
    return { success: false, error: "Failed to save the post." };
  }
}

export async function archivePublicContent(
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = cuid.parse(itemId);

    const item = await prisma.publicContentItem.findUnique({
      where: { id: validated },
      select: { id: true, leagueId: true, teamId: true, status: true },
    });
    if (!item) return { success: false, error: "That post could not be found." };

    if (!(await canPublish(userId, item.leagueId, item.teamId ?? undefined))) {
      return { success: false, error: "You do not have permission to archive this post." };
    }
    if (item.status === "ARCHIVED") {
      return { success: true, data: { id: item.id } };
    }

    await prisma.publicContentItem.update({
      where: { id: item.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    revalidatePath(`/league/${item.leagueId}/content`);
    return { success: true, data: { id: item.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid post ID." };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error archiving public content:", error);
    return { success: false, error: "Failed to archive the post." };
  }
}

/** Administrator view: every item, including drafts and archived ones. */
export async function listAssociationContent(leagueId: string) {
  const userId = await requireUserId();
  if (!(await canPublish(userId, leagueId))) {
    return { success: false as const, error: "You do not have permission to view content." };
  }

  const items = await prisma.publicContentItem.findMany({
    where: { leagueId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      visibility: true,
      publishAt: true,
      archivedAt: true,
      team: { select: { name: true } },
    },
    orderBy: [{ publishAt: "desc" }, { createdAt: "desc" }],
  });

  return { success: true as const, data: items };
}

/* ------------------------------------------------------------------------- */
/* Public readers. No session — these serve anonymous visitors.               */
/* ------------------------------------------------------------------------- */

export async function listPublicAssociationContent(leagueId: string, limit = 20) {
  return prisma.publicContentItem.findMany({
    where: { leagueId, ...publicContentWhere(new Date()) },
    select: publicContentSelect,
    orderBy: { publishAt: "desc" },
    take: limit,
  });
}

/**
 * One public news item, resolved by association slug so the route never has to
 * trust a league id from the URL.
 */
export async function getPublicContentItem(associationSlug: string, contentSlug: string) {
  const now = new Date();
  const league = await prisma.league.findFirst({
    where: { ...publicPublishedAssociationWhere, slug: associationSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!league) return null;

  const item = await prisma.publicContentItem.findFirst({
    where: { leagueId: league.id, slug: contentSlug, ...publicContentWhere(now) },
    select: publicContentDetailSelect,
  });
  if (!item) return null;

  return { item, association: league };
}
