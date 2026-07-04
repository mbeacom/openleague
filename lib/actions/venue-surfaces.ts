"use server";

/**
 * Surface segmentation server actions (feature 006, US1).
 *
 * "Geometry proposes, declarations decide": drawn geometry only ever produces
 * SUGGESTIONS; the persisted SegmentCoexistence pair rows are the sole source
 * of conflict truth. Every mutation authenticates, validates with Zod,
 * authorizes via venue schedule roles (OWNER/MANAGER/SCHEDULER), writes a
 * VenueActivityLog entry, and revalidates the venue-admin surfaces/schedule
 * paths plus the public rink pages.
 */

import { revalidatePath } from "next/cache";
import { Prisma, type SurfaceType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireVenueScheduleManager } from "@/lib/auth/session";
import { logVenueActivity, type ActionResult } from "@/lib/actions/venue-organizations";
import {
  applySegmentationPresetSchema,
  createSegmentSchema,
  segmentGeometrySchema,
  setSegmentActiveSchema,
  setWholeSurfaceLabelSchema,
  suggestCoexistenceSchema,
  updateSegmentSchema,
  type ApplySegmentationPresetInput,
  type CreateSegmentInput,
  type SetSegmentActiveInput,
  type SetWholeSurfaceLabelInput,
  type SuggestCoexistenceInput,
  type UpdateSegmentInput,
} from "@/lib/utils/validation";
import {
  getSegmentationPreset,
  getWholeSurfaceDefaultLabel,
} from "@/lib/utils/segment-presets";
import {
  normalizeGeometry,
  suggestCoexistence as suggestCoexistenceFromGeometry,
} from "@/lib/utils/segment-geometry";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";
import type {
  CoexistencePair,
  CoexistenceSuggestion,
  SegmentGeometry,
  SurfaceSegmentation,
  VenueBookingView,
} from "@/types/segments";

const getSurfaceSegmentationSchema = z.object({
  surfaceId: z.string().cuid("Invalid surface ID format"),
});

/** Horizon for expanding recurring blocks when listing future bookings. */
const FUTURE_BOOKING_HORIZON_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * Cap on expanded occurrences per recurring block in the pair-overlap
 * analysis (matches venue-schedules' MAX_RECURRENCE_CONFLICT_OCCURRENCES).
 */
const MAX_RECURRENCE_CONFLICT_OCCURRENCES = 8;

/**
 * Friendly, user-facing failure raised inside actions; its message is safe to
 * return to the client (unlike arbitrary thrown errors, which map to a
 * generic fallback).
 */
class SegmentActionError extends Error {}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Apply the segmentation preset for the surface's type (FR-004).
 *
 * Idempotent by `(surfaceId, presetRole)`: existing preset segments are never
 * deleted, renamed, or moved; only missing segments and missing coexistence
 * rows are created. Surface types without a preset no-op with a friendly
 * message.
 */
export async function applySegmentationPreset(
  input: ApplySegmentationPresetInput
): Promise<
  ActionResult<{
    surfaceId: string;
    applied: boolean;
    createdSegmentCount: number;
    createdPairCount: number;
    message?: string;
  }>
> {
  try {
    const validated = applySegmentationPresetSchema.parse(input);
    const context = await requireSurfaceManager(validated.surfaceId);

    const preset = getSegmentationPreset(context.surface.surfaceType);
    if (!preset) {
      return {
        success: true,
        data: {
          surfaceId: context.surface.id,
          applied: false,
          createdSegmentCount: 0,
          createdPairCount: 0,
          message:
            "This surface type has no segmentation preset — the whole surface stays bookable as-is. You can still draw custom zones.",
        },
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.surfaceSegment.findMany({
        where: { surfaceId: context.surface.id },
        select: { id: true, name: true, presetRole: true },
      });
      const roleToId = new Map(
        existing
          .filter((segment) => segment.presetRole !== null)
          .map((segment) => [segment.presetRole as string, segment.id])
      );
      const existingNames = new Set(existing.map((segment) => segment.name));

      let createdSegmentCount = 0;
      for (const def of preset.segments) {
        if (roleToId.has(def.role)) continue; // never touch existing preset segments
        if (existingNames.has(def.defaultName)) {
          throw new SegmentActionError(
            `A segment named "${def.defaultName}" already exists on this surface. Rename it, then re-apply the preset.`
          );
        }
        const created = await tx.surfaceSegment.create({
          data: {
            surfaceId: context.surface.id,
            name: def.defaultName,
            kind: def.kind,
            presetRole: def.role,
            geometry: toJsonGeometry(def.geometry),
          },
          select: { id: true },
        });
        roleToId.set(def.role, created.id);
        createdSegmentCount += 1;
      }

      // Canonical (min, max) ordering is resolved from the segment ids AFTER
      // creation — preset roles say nothing about id order.
      const pairData = preset.coexistingRolePairs.map(([roleA, roleB]) => {
        const idA = roleToId.get(roleA);
        const idB = roleToId.get(roleB);
        if (!idA || !idB) {
          throw new Error(`Preset coexistence references unknown role ${roleA}/${roleB}`);
        }
        return canonicalPair(idA, idB);
      });
      const createdPairs = await tx.segmentCoexistence.createMany({
        data: pairData,
        skipDuplicates: true,
      });

      return { createdSegmentCount, createdPairCount: createdPairs.count };
    });

    await logVenueActivity({
      venueId: context.venueId,
      actorId: context.userId,
      action: "SEGMENTATION_PRESET_APPLIED",
      resourceType: "IceSurface",
      resourceId: context.surface.id,
      summary: `Applied ${context.surface.surfaceType} segmentation preset to ${context.surface.name}`,
      details: {
        createdSegmentCount: result.createdSegmentCount,
        createdPairCount: result.createdPairCount,
      },
    });
    revalidateSegmentationPaths(context);

    return {
      success: true,
      data: { surfaceId: context.surface.id, applied: true, ...result },
    };
  } catch (error) {
    return actionFailure(error, "Failed to apply the segmentation preset.");
  }
}

/**
 * Create a CUSTOM segment from drawn geometry (FR-005).
 *
 * Only staff-confirmed coexistence pairs are persisted (canonicalized);
 * undeclared pairs conflict by default. Because the new segment has no id
 * until it is created, pass the SURFACE id in a pair slot to mean "the
 * segment being created" (the review UI pairs the new zone against existing
 * segments). Pairs between two existing same-surface segments are persisted
 * literally; any other id is rejected.
 */
export async function createSegment(
  input: CreateSegmentInput
): Promise<ActionResult<{ segmentId: string }>> {
  try {
    const validated = createSegmentSchema.parse(input);
    const context = await requireSurfaceManager(validated.surfaceId);
    const geometry = normalizeGeometry(validated.geometry);

    const segment = await prisma.$transaction(async (tx) => {
      const existingIds = new Set(
        (
          await tx.surfaceSegment.findMany({
            where: { surfaceId: context.surface.id },
            select: { id: true },
          })
        ).map((row) => row.id)
      );

      const created = await tx.surfaceSegment.create({
        data: {
          surfaceId: context.surface.id,
          name: validated.name,
          kind: "CUSTOM",
          geometry: toJsonGeometry(geometry),
        },
        select: { id: true, name: true },
      });

      const resolvePairId = (id: string): string => {
        if (id === context.surface.id) return created.id; // "the new segment"
        if (existingIds.has(id)) return id;
        throw new SegmentActionError(
          "Coexistence pairs must reference segments of this surface."
        );
      };

      const pairs = new Map<string, CoexistencePair>();
      for (const pair of validated.confirmedCoexistence) {
        const idA = resolvePairId(pair.segmentAId);
        const idB = resolvePairId(pair.segmentBId);
        if (idA === idB) {
          throw new SegmentActionError("A segment cannot coexist with itself.");
        }
        const canonical = canonicalPair(idA, idB);
        pairs.set(pairMapKey(canonical), canonical);
      }
      if (pairs.size > 0) {
        await tx.segmentCoexistence.createMany({
          data: [...pairs.values()],
          skipDuplicates: true,
        });
      }

      return created;
    });

    await logVenueActivity({
      venueId: context.venueId,
      actorId: context.userId,
      action: "SEGMENT_CREATED",
      resourceType: "SurfaceSegment",
      resourceId: segment.id,
      summary: `Created segment ${segment.name} on ${context.surface.name}`,
      details: { confirmedPairCount: validated.confirmedCoexistence.length },
    });
    revalidateSegmentationPaths(context);

    return { success: true, data: { segmentId: segment.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        success: false,
        error: "A segment with this name already exists on this surface.",
      };
    }
    return actionFailure(error, "Failed to create the segment.");
  }
}

/**
 * Update a segment (FR-007). Name and geometry edits are free. When
 * `confirmedCoexistence` is provided it is the COMPLETE desired pair set
 * involving this segment (every pair must include the segment being edited):
 * removed pairs that would put existing future bookings into conflict are
 * returned as `details.newlyConflicting` and require `confirm: true` to save.
 * Nothing is auto-invalidated — existing bookings stay put.
 */
export async function updateSegment(
  input: UpdateSegmentInput
): Promise<ActionResult<{ segmentId: string }>> {
  try {
    const validated = updateSegmentSchema.parse(input);
    const context = await requireSegmentManager(validated.segmentId);
    const segment = context.segment;

    let pairChanges: { toAdd: CoexistencePair[]; toRemove: CoexistencePair[] } | null = null;
    if (validated.confirmedCoexistence) {
      const surfaceSegmentIds = new Set(
        (
          await prisma.surfaceSegment.findMany({
            where: { surfaceId: segment.surfaceId },
            select: { id: true },
          })
        ).map((row) => row.id)
      );

      const desired = new Map<string, CoexistencePair>();
      for (const pair of validated.confirmedCoexistence) {
        if (pair.segmentAId !== segment.id && pair.segmentBId !== segment.id) {
          throw new SegmentActionError(
            "Each coexistence pair must include the segment being edited."
          );
        }
        const partnerId = pair.segmentAId === segment.id ? pair.segmentBId : pair.segmentAId;
        if (partnerId === segment.id) {
          throw new SegmentActionError("A segment cannot coexist with itself.");
        }
        if (!surfaceSegmentIds.has(partnerId)) {
          throw new SegmentActionError(
            "Coexistence pairs must reference segments of this surface."
          );
        }
        const canonical = canonicalPair(segment.id, partnerId);
        desired.set(pairMapKey(canonical), canonical);
      }

      const currentRows = await prisma.segmentCoexistence.findMany({
        where: { OR: [{ segmentAId: segment.id }, { segmentBId: segment.id }] },
        select: { segmentAId: true, segmentBId: true },
      });
      const current = new Map<string, CoexistencePair>(
        currentRows.map((row) => {
          const canonical = canonicalPair(row.segmentAId, row.segmentBId);
          return [pairMapKey(canonical), canonical];
        })
      );

      const toRemove = [...current.entries()]
        .filter(([key]) => !desired.has(key))
        .map(([, pair]) => pair);
      const toAdd = [...desired.entries()]
        .filter(([key]) => !current.has(key))
        .map(([, pair]) => pair);

      if (toRemove.length > 0) {
        const newlyConflicting = await findNewlyConflictingBookings(toRemove);
        if (newlyConflicting.length > 0 && !validated.confirm) {
          return {
            success: false,
            error:
              "Removing these coexistence declarations would put existing future bookings in conflict. Review them and confirm to save anyway.",
            details: { newlyConflicting },
          };
        }
      }

      pairChanges = { toAdd, toRemove };
    }

    await prisma.$transaction(async (tx) => {
      if (validated.name !== undefined || validated.geometry) {
        await tx.surfaceSegment.update({
          where: { id: segment.id },
          data: {
            ...(validated.name !== undefined ? { name: validated.name } : {}),
            ...(validated.geometry
              ? { geometry: toJsonGeometry(normalizeGeometry(validated.geometry)) }
              : {}),
          },
        });
      }
      if (pairChanges) {
        if (pairChanges.toRemove.length > 0) {
          await tx.segmentCoexistence.deleteMany({
            where: {
              OR: pairChanges.toRemove.map((pair) => ({
                segmentAId: pair.segmentAId,
                segmentBId: pair.segmentBId,
              })),
            },
          });
        }
        if (pairChanges.toAdd.length > 0) {
          await tx.segmentCoexistence.createMany({
            data: pairChanges.toAdd,
            skipDuplicates: true,
          });
        }
      }
    });

    await logVenueActivity({
      venueId: context.venueId,
      actorId: context.userId,
      action: "SEGMENT_UPDATED",
      resourceType: "SurfaceSegment",
      resourceId: segment.id,
      summary: `Updated segment ${validated.name ?? segment.name} on ${context.surfaceName}`,
      details: pairChanges
        ? {
            addedPairCount: pairChanges.toAdd.length,
            removedPairCount: pairChanges.toRemove.length,
          }
        : undefined,
    });
    revalidateSegmentationPaths(context);

    return { success: true, data: { segmentId: segment.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        success: false,
        error: "A segment with this name already exists on this surface.",
      };
    }
    return actionFailure(error, "Failed to update the segment.");
  }
}

/**
 * Pure read for the editor review step: drawn geometry vs the surface's
 * active segments → advisory coexistence suggestions. Never persisted and
 * never used for conflict math (FR-005).
 */
export async function suggestCoexistence(
  input: SuggestCoexistenceInput
): Promise<ActionResult<{ suggestions: CoexistenceSuggestion[] }>> {
  try {
    const validated = suggestCoexistenceSchema.parse(input);
    const context = await requireSurfaceManager(validated.surfaceId);
    const excludeSegmentId = validated.excludeSegmentId || undefined;

    const segments = await prisma.surfaceSegment.findMany({
      where: {
        surfaceId: context.surface.id,
        isActive: true,
        ...(excludeSegmentId ? { id: { not: excludeSegmentId } } : {}),
      },
      select: { id: true, name: true, geometry: true },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    });

    const suggestions = suggestCoexistenceFromGeometry(
      validated.geometry,
      segments.map((segment) => ({
        id: segment.id,
        name: segment.name,
        geometry: toGeometry(segment.geometry),
      }))
    );

    return { success: true, data: { suggestions } };
  } catch (error) {
    return actionFailure(error, "Failed to suggest coexistence relationships.");
  }
}

/**
 * Activate or deactivate a segment. Deactivation is refused with
 * `details.futureBookings` while any future bookings reference the segment
 * (FR-007); reactivation is always allowed. Deactivated segments stay
 * visible in history but disappear from pickers.
 */
export async function setSegmentActive(
  input: SetSegmentActiveInput
): Promise<ActionResult<{ segmentId: string; isActive: boolean }>> {
  try {
    const validated = setSegmentActiveSchema.parse(input);
    const context = await requireSegmentManager(validated.segmentId);
    const segment = context.segment;

    if (!validated.isActive) {
      const futureBookings = await findFutureSegmentBookings([segment.id]);
      if (futureBookings.length > 0) {
        return {
          success: false,
          error:
            "This segment has upcoming bookings and cannot be deactivated. Move or cancel them first.",
          details: { futureBookings },
        };
      }
    }

    if (segment.isActive !== validated.isActive) {
      await prisma.surfaceSegment.update({
        where: { id: segment.id },
        data: { isActive: validated.isActive },
      });

      await logVenueActivity({
        venueId: context.venueId,
        actorId: context.userId,
        action: validated.isActive ? "SEGMENT_ACTIVATED" : "SEGMENT_DEACTIVATED",
        resourceType: "SurfaceSegment",
        resourceId: segment.id,
        summary: `${validated.isActive ? "Activated" : "Deactivated"} segment ${segment.name} on ${context.surfaceName}`,
      });
      revalidateSegmentationPaths(context);
    }

    return { success: true, data: { segmentId: segment.id, isActive: validated.isActive } };
  } catch (error) {
    return actionFailure(error, "Failed to update the segment's status.");
  }
}

/**
 * Rename the implicit whole-surface segment (research R2). An empty or
 * omitted label resets to the surface-type default ("Full ice", …).
 */
export async function setWholeSurfaceLabel(
  input: SetWholeSurfaceLabelInput
): Promise<ActionResult<{ surfaceId: string; wholeLabel: string }>> {
  try {
    const validated = setWholeSurfaceLabelSchema.parse(input);
    const context = await requireSurfaceManager(validated.surfaceId);
    const wholeLabel = validated.wholeLabel || null;

    await prisma.iceSurface.update({
      where: { id: context.surface.id },
      data: { wholeLabel },
    });

    const effectiveLabel =
      wholeLabel ?? getWholeSurfaceDefaultLabel(context.surface.surfaceType);

    await logVenueActivity({
      venueId: context.venueId,
      actorId: context.userId,
      action: "WHOLE_SURFACE_LABEL_SET",
      resourceType: "IceSurface",
      resourceId: context.surface.id,
      summary: `Set whole-surface label for ${context.surface.name} to "${effectiveLabel}"`,
    });
    revalidateSegmentationPaths(context);

    return {
      success: true,
      data: { surfaceId: context.surface.id, wholeLabel: effectiveLabel },
    };
  } catch (error) {
    return actionFailure(error, "Failed to update the whole-surface label.");
  }
}

/**
 * Segments + canonical coexistence pairs + effective whole-surface label for
 * the segmentation editor and booking pickers. Includes inactive segments
 * (SegmentView carries `isActive`); pickers filter to active themselves.
 */
export async function getSurfaceSegmentation(input: {
  surfaceId: string;
}): Promise<ActionResult<SurfaceSegmentation>> {
  try {
    const validated = getSurfaceSegmentationSchema.parse(input);
    const context = await requireSurfaceManager(validated.surfaceId);

    const [segments, pairs] = await Promise.all([
      prisma.surfaceSegment.findMany({
        where: { surfaceId: context.surface.id },
        select: {
          id: true,
          name: true,
          kind: true,
          presetRole: true,
          isActive: true,
          geometry: true,
        },
        orderBy: [{ createdAt: "asc" }, { name: "asc" }],
      }),
      // Both segments of a pair share a surface (validation invariant), so
      // filtering on segmentA is sufficient.
      prisma.segmentCoexistence.findMany({
        where: { segmentA: { surfaceId: context.surface.id } },
        select: { segmentAId: true, segmentBId: true },
      }),
    ]);

    return {
      success: true,
      data: {
        surfaceId: context.surface.id,
        surfaceName: context.surface.name,
        surfaceType: context.surface.surfaceType,
        wholeLabel:
          context.surface.wholeLabel ??
          getWholeSurfaceDefaultLabel(context.surface.surfaceType),
        segments: segments.map((segment) => ({
          id: segment.id,
          name: segment.name,
          kind: segment.kind,
          presetRole: segment.presetRole,
          isActive: segment.isActive,
          geometry: toGeometry(segment.geometry),
        })),
        coexistence: pairs.map((pair) => canonicalPair(pair.segmentAId, pair.segmentBId)),
      },
    };
  } catch (error) {
    return actionFailure(error, "Failed to load surface segmentation.");
  }
}

// ---------------------------------------------------------------------------
// Auth + context resolution
// ---------------------------------------------------------------------------

type SurfaceContext = {
  userId: string;
  organizationId: string;
  venueId: string;
  slug: string | null;
  surface: {
    id: string;
    name: string;
    surfaceType: SurfaceType;
    wholeLabel: string | null;
  };
};

async function requireSurfaceManager(surfaceId: string): Promise<SurfaceContext> {
  const surface = await prisma.iceSurface.findUnique({
    where: { id: surfaceId },
    select: {
      id: true,
      name: true,
      surfaceType: true,
      wholeLabel: true,
      venueId: true,
      venue: { select: { organizationId: true, slug: true } },
    },
  });

  if (!surface || !surface.venue.organizationId) {
    throw new SegmentActionError("Surface not found");
  }

  const userId = await requireVenueScheduleManager(
    surface.venue.organizationId,
    surface.venueId
  );

  return {
    userId,
    organizationId: surface.venue.organizationId,
    venueId: surface.venueId,
    slug: surface.venue.slug,
    surface: {
      id: surface.id,
      name: surface.name,
      surfaceType: surface.surfaceType,
      wholeLabel: surface.wholeLabel,
    },
  };
}

type SegmentContext = {
  userId: string;
  organizationId: string;
  venueId: string;
  slug: string | null;
  surfaceName: string;
  segment: {
    id: string;
    name: string;
    isActive: boolean;
    surfaceId: string;
  };
};

async function requireSegmentManager(segmentId: string): Promise<SegmentContext> {
  const segment = await prisma.surfaceSegment.findUnique({
    where: { id: segmentId },
    select: {
      id: true,
      name: true,
      isActive: true,
      surfaceId: true,
      surface: {
        select: {
          name: true,
          venueId: true,
          venue: { select: { organizationId: true, slug: true } },
        },
      },
    },
  });

  if (!segment || !segment.surface.venue.organizationId) {
    throw new SegmentActionError("Segment not found");
  }

  const userId = await requireVenueScheduleManager(
    segment.surface.venue.organizationId,
    segment.surface.venueId
  );

  return {
    userId,
    organizationId: segment.surface.venue.organizationId,
    venueId: segment.surface.venueId,
    slug: segment.surface.venue.slug,
    surfaceName: segment.surface.name,
    segment: {
      id: segment.id,
      name: segment.name,
      isActive: segment.isActive,
      surfaceId: segment.surfaceId,
    },
  };
}

// ---------------------------------------------------------------------------
// Future bookings (FR-007 guards)
// ---------------------------------------------------------------------------

/**
 * Future bookings that reference the given segments, across the four
 * segment-capable sources (SeasonGame, EventGame, VenueScheduleBlock,
 * PracticeSession). Calendar Events are always venue-wide — they can never
 * reference a segment, so they never pin one. Inclusion filters mirror the
 * availability engine; recurring blocks are expanded and only future
 * occurrences count, capped at `maxOccurrencesPerBlock`. The default of 1
 * (each block reported once, at its next occurrence) is sufficient for pure
 * existence guards; the pair-overlap analysis passes a higher cap because
 * later occurrences can overlap where the first does not.
 */
async function findFutureSegmentBookings(
  segmentIds: string[],
  now: Date = new Date(),
  maxOccurrencesPerBlock: number = 1
): Promise<VenueBookingView[]> {
  if (segmentIds.length === 0) return [];
  const horizon = new Date(now.getTime() + FUTURE_BOOKING_HORIZON_MS);

  const [seasonGames, eventGames, blocks, practices] = await Promise.all([
    prisma.seasonGame.findMany({
      where: {
        segmentId: { in: segmentIds },
        status: { in: ["SCHEDULED", "COMPLETED"] },
        endAt: { gt: now },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
    prisma.eventGame.findMany({
      where: {
        segmentId: { in: segmentIds },
        status: { not: "CANCELED" },
        event: { status: "PUBLISHED" },
        endAt: { gt: now },
      },
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
        event: { select: { title: true } },
      },
    }),
    prisma.venueScheduleBlock.findMany({
      where: {
        segmentId: { in: segmentIds },
        status: "PUBLISHED",
        OR: [
          { endsAt: { gt: now } },
          {
            recurrenceRule: { not: null },
            OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gt: now } }],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
        recurrenceRule: true,
        recurrenceEndDate: true,
      },
    }),
    prisma.practiceSession.findMany({
      where: { segmentId: { in: segmentIds }, startAt: { gte: now } },
      select: {
        id: true,
        title: true,
        startAt: true,
        duration: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
      },
    }),
  ]);

  const bookings: VenueBookingView[] = [];

  for (const game of seasonGames) {
    bookings.push({
      id: game.id,
      source: "seasonGame",
      title: `${game.homeTeam.name} vs ${game.awayTeam.name}`,
      startAt: game.startAt,
      endAt: game.endAt,
      surfaceId: game.surfaceId,
      segmentId: game.segmentId,
      segmentName: game.segment?.name ?? null,
    });
  }

  for (const game of eventGames) {
    bookings.push({
      id: game.id,
      source: "eventGame",
      title: `${game.name ?? "Game"} — ${game.event.title}`,
      startAt: game.startAt,
      endAt: game.endAt,
      surfaceId: game.surfaceId,
      segmentId: game.segmentId,
      segmentName: game.segment?.name ?? null,
    });
  }

  for (const block of blocks) {
    for (const occurrence of futureBlockOccurrences(block, now, horizon, maxOccurrencesPerBlock)) {
      bookings.push({
        id: block.id,
        source: "scheduleBlock",
        title: block.title,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        surfaceId: block.surfaceId,
        segmentId: block.segmentId,
        segmentName: block.segment?.name ?? null,
      });
    }
  }

  for (const practice of practices) {
    if (!practice.startAt) continue; // narrows nullable column; query excludes
    bookings.push({
      id: practice.id,
      source: "practice",
      title: `Practice — ${practice.title}`,
      startAt: practice.startAt,
      endAt: new Date(practice.startAt.getTime() + practice.duration * 60_000),
      surfaceId: practice.surfaceId,
      segmentId: practice.segmentId,
      segmentName: practice.segment?.name ?? null,
    });
  }

  return bookings.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * The first `limit` occurrences of a block that end after `now`
 * (non-recurring blocks are their own single occurrence). Unsupported
 * recurrence rules fall back to the base range.
 */
function futureBlockOccurrences(
  block: {
    startsAt: Date;
    endsAt: Date;
    recurrenceRule: string | null;
    recurrenceEndDate: Date | null;
  },
  now: Date,
  horizon: Date,
  limit: number
): Array<{ startAt: Date; endAt: Date }> {
  if (!block.recurrenceRule) {
    return block.endsAt > now ? [{ startAt: block.startsAt, endAt: block.endsAt }] : [];
  }
  try {
    const occurrences = expandRecurrenceWindow(
      {
        startAt: block.startsAt,
        endAt: block.endsAt,
        recurrenceRule: block.recurrenceRule,
        recurrenceEndAt: block.recurrenceEndDate,
      },
      now,
      horizon
    );
    return occurrences.slice(0, limit);
  } catch {
    return block.endsAt > now ? [{ startAt: block.startsAt, endAt: block.endsAt }] : [];
  }
}

/**
 * Future bookings that would become conflicts if the given coexistence pairs
 * were removed: for each removed pair, bookings on the two segments whose
 * times overlap each other (FR-007). Recurring blocks are expanded (capped)
 * because a block's later occurrences can overlap another booking even when
 * its first future occurrence does not. Returns a flat, deduped list sorted
 * by start time.
 */
async function findNewlyConflictingBookings(
  removedPairs: CoexistencePair[],
  now: Date = new Date()
): Promise<VenueBookingView[]> {
  if (removedPairs.length === 0) return [];

  const segmentIds = [
    ...new Set(removedPairs.flatMap((pair) => [pair.segmentAId, pair.segmentBId])),
  ];
  const bookings = await findFutureSegmentBookings(
    segmentIds,
    now,
    MAX_RECURRENCE_CONFLICT_OCCURRENCES
  );

  const bySegment = new Map<string, VenueBookingView[]>();
  for (const booking of bookings) {
    if (!booking.segmentId) continue;
    const list = bySegment.get(booking.segmentId) ?? [];
    list.push(booking);
    bySegment.set(booking.segmentId, list);
  }

  const seen = new Set<string>();
  const conflicting: VenueBookingView[] = [];
  const add = (booking: VenueBookingView) => {
    const key = `${booking.source}:${booking.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    conflicting.push(booking);
  };

  for (const pair of removedPairs) {
    const listA = bySegment.get(pair.segmentAId) ?? [];
    const listB = bySegment.get(pair.segmentBId) ?? [];
    for (const a of listA) {
      for (const b of listB) {
        if (bookingsOverlap(a, b)) {
          add(a);
          add(b);
        }
      }
    }
  }

  return conflicting.sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
}

/** Strict overlap; the four segment-capable sources always have an end time. */
function bookingsOverlap(
  a: { startAt: Date; endAt: Date | null },
  b: { startAt: Date; endAt: Date | null }
): boolean {
  const aEnd = a.endAt ?? a.startAt;
  const bEnd = b.endAt ?? b.startAt;
  return a.startAt < bEnd && b.startAt < aEnd;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Canonical (min, max) pair — matches the DB CHECK on segment_coexistences. */
function canonicalPair(a: string, b: string): CoexistencePair {
  return a < b ? { segmentAId: a, segmentBId: b } : { segmentAId: b, segmentBId: a };
}

function pairMapKey(pair: CoexistencePair): string {
  return `${pair.segmentAId} ${pair.segmentBId}`;
}

/** Geometry is written only through validated paths; fall back defensively. */
function toGeometry(value: unknown): SegmentGeometry {
  const parsed = segmentGeometrySchema.safeParse(value);
  return parsed.success ? parsed.data : { x: 0, y: 0, w: 1, h: 1, rotation: 0 };
}

function toJsonGeometry(geometry: SegmentGeometry): Prisma.InputJsonValue {
  return {
    x: geometry.x,
    y: geometry.y,
    w: geometry.w,
    h: geometry.h,
    rotation: geometry.rotation,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function actionFailure<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
    throw error;
  }
  if (error instanceof SegmentActionError) {
    return { success: false, error: error.message };
  }
  return { success: false, error: fallback };
}

function revalidateSegmentationPaths(context: {
  organizationId: string;
  venueId: string;
  slug: string | null;
}) {
  revalidatePath(`/venue-admin/${context.organizationId}/venues/${context.venueId}/surfaces`);
  revalidatePath(`/venue-admin/${context.organizationId}/venues/${context.venueId}/schedule`);
  if (context.slug) {
    revalidatePath(`/rinks/${context.slug}`);
    revalidatePath(`/rinks/${context.slug}/schedule`);
  }
}
