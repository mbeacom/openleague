"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";
import { rethrowIfNextRedirectError } from "@/lib/utils/next-errors";
import {
  getPublicAssociationProfileSelect,
  getPublicTeamProfileSelect,
  publicPublishedAssociationWhere,
  publicPublishedTeamWhere,
  publicTeamSummarySelect,
} from "@/lib/utils/public-associations";

/**
 * Public association and team profiles (feature 007 / User Story 4).
 *
 * Every mutation is gated on `hasCapability`, never on `requireLeagueRole`.
 * That is deliberate: the gear domain shipped guarding on the legacy role and
 * consequently ignored role grants entirely, which took a follow-up pass to
 * unpick. New surfaces start grant-native.
 */

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const cuid = z.string().cuid("Invalid ID format");

/** URL-safe, lowercase, no leading/trailing or doubled separators. */
const slugSchema = z
  .string()
  .min(3, "A slug needs at least 3 characters")
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens");

const profileSchema = z.object({
  leagueId: cuid,
  publicDescription: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  brandPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  brandSecondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  publicEmail: z.string().email().max(255).nullable().optional(),
  publicPhone: z.string().max(40).nullable().optional(),
});

async function canAdminister(userId: string, leagueId: string): Promise<boolean> {
  return hasCapability({
    userId,
    leagueId,
    capability: Capability.ADMINISTER_ASSOCIATION,
  });
}

export async function updateAssociationProfile(
  input: z.infer<typeof profileSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = profileSchema.parse(input);

    if (!(await canAdminister(userId, validated.leagueId))) {
      return { success: false, error: "You do not have permission to edit this profile." };
    }

    const { leagueId, ...fields } = validated;
    await prisma.league.update({
      where: { id: leagueId },
      // Only fields the caller actually sent; omitted keys keep their values
      // rather than being nulled by a partial form submit.
      data: Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ),
    });

    revalidatePath(`/league/${leagueId}/settings/public`);
    return { success: true, data: { id: leagueId } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error updating association profile:", error);
    return { success: false, error: "Failed to save the profile." };
  }
}

const slugInputSchema = z.object({ leagueId: cuid, slug: slugSchema });

/**
 * Rename an association's public slug, retiring the old one.
 *
 * The retirement is written in the same transaction that frees the slug, so a
 * shared link never points at nothing — the window where neither the league
 * nor a redirect answers for it does not exist.
 */
export async function updateAssociationSlug(
  input: z.infer<typeof slugInputSchema>,
): Promise<ActionResult<{ slug: string }>> {
  try {
    const userId = await requireUserId();
    const validated = slugInputSchema.parse(input);

    if (!(await canAdminister(userId, validated.leagueId))) {
      return { success: false, error: "You do not have permission to change this address." };
    }

    const league = await prisma.league.findUnique({
      where: { id: validated.leagueId },
      select: { slug: true },
    });
    if (!league) return { success: false, error: "That association could not be found." };
    if (league.slug === validated.slug) {
      return { success: true, data: { slug: validated.slug } };
    }

    const [takenByLeague, takenByRedirect] = await Promise.all([
      prisma.league.findFirst({
        where: { slug: validated.slug, NOT: { id: validated.leagueId } },
        select: { id: true },
      }),
      prisma.publicSlugRedirect.findFirst({
        where: { slug: validated.slug, teamId: null, NOT: { leagueId: validated.leagueId } },
        select: { id: true },
      }),
    ]);
    // A retired slug is as taken as a live one: reusing it would silently
    // hijack somebody else's old links.
    if (takenByLeague || takenByRedirect) {
      return { success: false, error: "That address is already in use." };
    }

    await prisma.$transaction(async (tx) => {
      if (league.slug) {
        await tx.publicSlugRedirect.upsert({
          where: { id: `${validated.leagueId}:${league.slug}` },
          create: {
            id: `${validated.leagueId}:${league.slug}`,
            slug: league.slug,
            leagueId: validated.leagueId,
          },
          update: {},
        });
      }
      await tx.league.update({
        where: { id: validated.leagueId },
        data: { slug: validated.slug },
      });
      // The association's own new slug must not stay retired, or it would
      // redirect to itself forever.
      await tx.publicSlugRedirect.deleteMany({
        where: { slug: validated.slug, teamId: null },
      });
    });

    revalidatePath(`/league/${validated.leagueId}/settings/public`);
    return { success: true, data: { slug: validated.slug } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error updating association slug:", error);
    return { success: false, error: "Failed to change the address." };
  }
}

const publishSchema = z.object({ leagueId: cuid, publish: z.boolean() });

export async function setAssociationProfilePublished(
  input: z.infer<typeof publishSchema>,
): Promise<ActionResult<{ status: string }>> {
  try {
    const userId = await requireUserId();
    const validated = publishSchema.parse(input);

    if (!(await canAdminister(userId, validated.leagueId))) {
      return { success: false, error: "You do not have permission to publish this profile." };
    }

    const league = await prisma.league.findUnique({
      where: { id: validated.leagueId },
      select: { slug: true },
    });
    if (!league) return { success: false, error: "That association could not be found." };

    // The database enforces this too; checking here turns a constraint error
    // into an instruction the administrator can act on.
    if (validated.publish && !league.slug) {
      return {
        success: false,
        error: "Choose a public address before publishing.",
      };
    }

    await prisma.league.update({
      where: { id: validated.leagueId },
      data: validated.publish
        ? { profileStatus: "PUBLISHED", publishedAt: new Date() }
        : { profileStatus: "UNPUBLISHED" },
    });

    revalidatePath(`/league/${validated.leagueId}/settings/public`);
    return { success: true, data: { status: validated.publish ? "PUBLISHED" : "UNPUBLISHED" } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error publishing association profile:", error);
    return { success: false, error: "Failed to change publication." };
  }
}

const teamProfileSchema = z.object({
  leagueId: cuid,
  teamId: cuid,
  slug: slugSchema.optional(),
  publicDescription: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  publish: z.boolean().optional(),
});

export async function updateTeamPublicProfile(
  input: z.infer<typeof teamProfileSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = teamProfileSchema.parse(input);

    if (!(await canAdminister(userId, validated.leagueId))) {
      return { success: false, error: "You do not have permission to edit this team page." };
    }

    const team = await prisma.team.findFirst({
      where: { id: validated.teamId, leagueId: validated.leagueId },
      select: { id: true, slug: true },
    });
    if (!team) return { success: false, error: "That team could not be found." };

    const nextSlug = validated.slug ?? team.slug;
    if (validated.publish && !nextSlug) {
      return { success: false, error: "Choose a public address before publishing." };
    }

    if (validated.slug && validated.slug !== team.slug) {
      const [takenByTeam, takenByRedirect] = await Promise.all([
        prisma.team.findFirst({
          where: {
            leagueId: validated.leagueId,
            slug: validated.slug,
            NOT: { id: validated.teamId },
          },
          select: { id: true },
        }),
        prisma.publicSlugRedirect.findFirst({
          where: {
            leagueId: validated.leagueId,
            slug: validated.slug,
            teamId: { not: null },
            NOT: { teamId: validated.teamId },
          },
          select: { id: true },
        }),
      ]);
      if (takenByTeam || takenByRedirect) {
        return { success: false, error: "Another team already uses that address." };
      }
    }

    await prisma.$transaction(async (tx) => {
      if (validated.slug && team.slug && validated.slug !== team.slug) {
        await tx.publicSlugRedirect.upsert({
          where: { id: `${validated.teamId}:${team.slug}` },
          create: {
            id: `${validated.teamId}:${team.slug}`,
            slug: team.slug,
            leagueId: validated.leagueId,
            teamId: validated.teamId,
          },
          update: {},
        });
      }

      await tx.team.update({
        where: { id: validated.teamId },
        data: {
          ...(validated.slug !== undefined ? { slug: validated.slug } : {}),
          ...(validated.publicDescription !== undefined
            ? { publicDescription: validated.publicDescription }
            : {}),
          ...(validated.logoUrl !== undefined ? { logoUrl: validated.logoUrl } : {}),
          ...(validated.publish === true
            ? { profileStatus: "PUBLISHED" as const, publishedAt: new Date() }
            : {}),
          ...(validated.publish === false ? { profileStatus: "UNPUBLISHED" as const } : {}),
        },
      });

      if (validated.slug) {
        await tx.publicSlugRedirect.deleteMany({
          where: {
            leagueId: validated.leagueId,
            slug: validated.slug,
            teamId: validated.teamId,
          },
        });
      }
    });

    revalidatePath(`/league/${validated.leagueId}/settings/public`);
    return { success: true, data: { id: validated.teamId } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error updating team public profile:", error);
    return { success: false, error: "Failed to save the team page." };
  }
}

/* ------------------------------------------------------------------------- */
/* Public readers. No session, no capability — these serve anonymous visitors. */
/* ------------------------------------------------------------------------- */

/**
 * Resolve a public association by slug, following one retirement hop.
 *
 * Returns the canonical slug so the caller can redirect rather than serve the
 * page at a stale address, which keeps one URL per association for search
 * engines and for anybody copying the link out of the address bar.
 */
type ResolvedAssociation = {
  id: string;
  canonicalSlug: string;
  redirected: boolean;
};

async function resolveAssociationSlug(
  slug: string,
  requirePublishedProfile: boolean,
): Promise<ResolvedAssociation | null> {
  const league = await prisma.league.findFirst({
    where: requirePublishedProfile
      ? { ...publicPublishedAssociationWhere, slug }
      : { isActive: true, slug },
    select: { id: true, slug: true },
  });
  if (league?.slug) {
    return { id: league.id, canonicalSlug: league.slug, redirected: false };
  }

  const redirect = await prisma.publicSlugRedirect.findFirst({
    where: { slug, teamId: null },
    select: { league: { select: { id: true, slug: true, profileStatus: true, isActive: true } } },
  });
  // Redirects store the target id, so this always lands on whatever the
  // association is called today — no chains to walk, and a second rename does
  // not strand the first old link.
  if (
    redirect?.league?.slug &&
    redirect.league.isActive &&
    (!requirePublishedProfile || redirect.league.profileStatus === "PUBLISHED")
  ) {
    return { id: redirect.league.id, canonicalSlug: redirect.league.slug, redirected: true };
  }

  return null;
}

export async function resolvePublicAssociation(
  slug: string,
): Promise<ResolvedAssociation | null> {
  return resolveAssociationSlug(slug, true);
}

/**
 * Resolve the public-events namespace, which predates association profiles.
 * An active association may publish signup events while its profile is still a
 * draft, so this resolver preserves retired event links without exposing the
 * profile, team, news, or schedule surfaces.
 */
export async function resolveActiveAssociation(
  slug: string,
): Promise<ResolvedAssociation | null> {
  return resolveAssociationSlug(slug, false);
}

export async function getPublicAssociationProfile(slug: string) {
  const resolved = await resolvePublicAssociation(slug);
  if (!resolved) return null;

  const now = new Date();
  const association = await prisma.league.findFirst({
    where: { ...publicPublishedAssociationWhere, id: resolved.id },
    select: getPublicAssociationProfileSelect(now),
  });
  return association ? { ...association, canonicalSlug: resolved.canonicalSlug } : null;
}

export async function getPublicAssociationTeams(leagueId: string) {
  return prisma.team.findMany({
    where: { ...publicPublishedTeamWhere, leagueId },
    select: publicTeamSummarySelect,
    orderBy: { name: "asc" },
  });
}

export async function resolvePublicTeam(
  leagueId: string,
  teamSlug: string,
): Promise<{ id: string; canonicalSlug: string; redirected: boolean } | null> {
  const team = await prisma.team.findFirst({
    where: { ...publicPublishedTeamWhere, leagueId, slug: teamSlug },
    select: { id: true, slug: true },
  });
  if (team?.slug) {
    return { id: team.id, canonicalSlug: team.slug, redirected: false };
  }

  const redirect = await prisma.publicSlugRedirect.findFirst({
    where: { leagueId, slug: teamSlug, teamId: { not: null } },
    select: { team: { select: { id: true, slug: true, profileStatus: true, isActive: true } } },
  });
  if (
    redirect?.team?.slug &&
    redirect.team.isActive &&
    redirect.team.profileStatus === "PUBLISHED"
  ) {
    return { id: redirect.team.id, canonicalSlug: redirect.team.slug, redirected: true };
  }

  return null;
}

export async function getPublicTeamProfile(leagueId: string, teamSlug: string) {
  const resolved = await resolvePublicTeam(leagueId, teamSlug);
  if (!resolved) return null;

  const now = new Date();
  const team = await prisma.team.findFirst({
    where: { ...publicPublishedTeamWhere, id: resolved.id },
    select: getPublicTeamProfileSelect(now),
  });
  return team ? { ...team, canonicalSlug: resolved.canonicalSlug } : null;
}
