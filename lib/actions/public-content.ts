"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import {
  Capability,
  hasCapability,
  loadActiveGrants,
  ROLE_CAPABILITY_MATRIX,
} from "@/lib/auth/capabilities";
import { resolvePublicAssociation } from "@/lib/actions/association-profile";
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
  title: z.string().trim().min(1, "A title is required").max(200),
  summary: z.string().trim().max(400).optional(),
  body: z.string().trim().min(1, "Some content is required").max(20000),
  visibility: z.enum(["PUBLIC", "MEMBERS_ONLY"]).default("PUBLIC"),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("PUBLISHED"),
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
    const draft = validated.status === "DRAFT";
    const publishAt = validated.publishAt ?? (draft ? null : now);
    // SCHEDULED and PUBLISHED are the same row with a different publishAt; the
    // public reader gates on the timestamp, so the status is a label for
    // administrators rather than a switch the reader consults.
    const scheduled = !draft && publishAt !== null && publishAt > now;

    const item = await prisma.publicContentItem.create({
      data: {
        leagueId: validated.leagueId,
        teamId: validated.teamId ?? null,
        slug: validated.slug,
        title: validated.title,
        summary: validated.summary || null,
        body: validated.body,
        visibility: validated.visibility,
        status: draft ? "DRAFT" : scheduled ? "SCHEDULED" : "PUBLISHED",
        publishAt,
        publishedAt: draft || scheduled ? null : now,
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
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(400).nullable().optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  visibility: z.enum(["PUBLIC", "MEMBERS_ONLY"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
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
      select: {
        id: true,
        leagueId: true,
        teamId: true,
        status: true,
        publishAt: true,
        publishedAt: true,
      },
    });
    if (!item) return { success: false, error: "That post could not be found." };

    if (!(await canPublish(userId, item.leagueId, item.teamId ?? undefined))) {
      return { success: false, error: "You do not have permission to edit this post." };
    }
    if (item.status === "ARCHIVED") {
      return { success: false, error: "Archived posts cannot be edited." };
    }
    const now = new Date();
    const alreadyPublic =
      item.status === "PUBLISHED"
      || (
        item.status === "SCHEDULED"
        && item.publishAt !== null
        && item.publishAt <= now
      );
    if (validated.status === "DRAFT" && alreadyPublic) {
      return {
        success: false,
        error: "Published posts can be archived but cannot return to draft.",
      };
    }

    const nextPublishAt =
      validated.status === "PUBLISHED"
        ? (validated.publishAt ?? item.publishAt ?? now)
        : validated.publishAt;
    const scheduled = nextPublishAt ? nextPublishAt > now : undefined;
    const publication =
      validated.status === "DRAFT"
        ? { status: "DRAFT" as const, publishedAt: null }
        : nextPublishAt
          ? {
              publishAt: nextPublishAt,
              status: scheduled ? ("SCHEDULED" as const) : ("PUBLISHED" as const),
              // Keep the original publication moment when one exists; moving a
              // published post's date forward should not rewrite its history.
              publishedAt: scheduled ? null : (item.publishedAt ?? now),
            }
          : {};

    await prisma.publicContentItem.update({
      where: { id: item.id },
      data: {
        ...(validated.title !== undefined ? { title: validated.title } : {}),
        ...(validated.summary !== undefined
          ? { summary: validated.summary === null ? null : validated.summary }
          : {}),
        ...(validated.body !== undefined ? { body: validated.body } : {}),
        ...(validated.visibility !== undefined ? { visibility: validated.visibility } : {}),
        ...publication,
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

async function getContentManagementScope(userId: string, leagueId: string) {
  const canPublishAssociationWide = await canPublish(userId, leagueId);
  if (canPublishAssociationWide) {
    const teams = await prisma.team.findMany({
      where: { leagueId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return { canPublishAssociationWide, teams };
  }

  const grants = await loadActiveGrants(userId, leagueId);
  const teamIds = new Set<string>();
  const divisionIds = new Set<string>();

  for (const grant of grants) {
    const role = ROLE_CAPABILITY_MATRIX[grant.role];
    if (
      !role.capabilities.includes(Capability.MANAGE_PUBLIC_CONTENT)
      || !role.scopes.includes(grant.scopeType)
    ) {
      continue;
    }
    if (grant.scopeType === "TEAM" && grant.teamId) teamIds.add(grant.teamId);
    if (grant.scopeType === "DIVISION" && grant.divisionId) {
      divisionIds.add(grant.divisionId);
    }
  }

  const targets = [
    ...(teamIds.size ? [{ id: { in: [...teamIds] } }] : []),
    ...(divisionIds.size ? [{ divisionId: { in: [...divisionIds] } }] : []),
  ];
  const teams = targets.length
    ? await prisma.team.findMany({
        where: { leagueId, isActive: true, OR: targets },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return { canPublishAssociationWide, teams };
}

/** Management view: every item covered by the caller's active grant scope. */
export async function listAssociationContent(leagueId: string) {
  const userId = await requireUserId();
  const scope = await getContentManagementScope(userId, leagueId);
  if (!scope.canPublishAssociationWide && scope.teams.length === 0) {
    return { success: false as const, error: "You do not have permission to view content." };
  }

  const items = await prisma.publicContentItem.findMany({
    where: {
      leagueId,
      ...(!scope.canPublishAssociationWide
        ? { teamId: { in: scope.teams.map(({ id }) => id) } }
        : {}),
    },
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

  return {
    success: true as const,
    data: {
      items,
      teams: scope.teams,
      canPublishAssociationWide: scope.canPublishAssociationWide,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Public readers. No session — these serve anonymous visitors.               */
/* ------------------------------------------------------------------------- */

export async function listPublicAssociationContent(
  leagueId: string,
  limit = 20,
  offset = 0,
) {
  return prisma.publicContentItem.findMany({
    where: { leagueId, ...publicContentWhere(new Date()) },
    select: publicContentSelect,
    orderBy: { publishAt: "desc" },
    take: Math.min(100, Math.max(1, Math.trunc(limit))),
    skip: Math.max(0, Math.trunc(offset)),
  });
}

export async function listPublicAssociationContentPage(
  leagueId: string,
  page: number,
  pageSize = 20,
) {
  const normalizedPage = Math.max(1, Math.trunc(page));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  const where = { leagueId, ...publicContentWhere(new Date()) };
  const totalItems = await prisma.publicContentItem.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedPageSize));
  const items =
    normalizedPage > totalPages
      ? []
      : await prisma.publicContentItem.findMany({
      where,
      select: publicContentSelect,
      orderBy: { publishAt: "desc" },
      take: normalizedPageSize,
      skip: (normalizedPage - 1) * normalizedPageSize,
    });

  return {
    items,
    page: normalizedPage,
    totalItems,
    totalPages,
  };
}

/**
 * One public news item, resolved by association slug so the route never has to
 * trust a league id from the URL.
 */
export async function getPublicContentItem(associationSlug: string, contentSlug: string) {
  const now = new Date();
  const resolved = await resolvePublicAssociation(associationSlug);
  if (!resolved) return null;

  const league = await prisma.league.findFirst({
    where: { ...publicPublishedAssociationWhere, id: resolved.id },
    select: { id: true, name: true, slug: true },
  });
  if (!league) return null;

  const item = await prisma.publicContentItem.findFirst({
    where: { leagueId: league.id, slug: contentSlug, ...publicContentWhere(now) },
    select: publicContentDetailSelect,
  });
  if (!item) return null;

  return {
    item,
    association: { ...league, slug: resolved.canonicalSlug },
  };
}
