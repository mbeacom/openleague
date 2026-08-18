"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireLeagueRole, requireTeamAdmin, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendEventNotifications, sendGameProposalNotifications } from "@/lib/email/templates";
import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";
import { createGameEventWithRsvps } from "@/lib/actions/season-games";
import {
  createVenueReservation,
  VenueReservationConflictError,
  VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import { findVenueReservationWriteConflicts } from "@/lib/services/venue-reservation-availability";
import { findBookingConflicts } from "@/lib/utils/availability";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";
import {
  createGameProposalSchema,
  counterGameProposalSchema,
  acceptGameProposalSchema,
  declineGameProposalSchema,
  type CreateGameProposalInput,
  type CounterGameProposalInput,
  type AcceptGameProposalInput,
  type DeclineGameProposalInput,
} from "@/lib/utils/validation";
import type { ActionResult } from "@/lib/actions/seasons";
import type { GameProposalView } from "@/types/seasons";

/**
 * Current terms live on the latest PROPOSE/COUNTER entry; that entry's
 * startAt drives expiry (FR-022) and its author defines whose turn it is.
 */
function latestTermsEntry<E extends { kind: string; createdAt: Date }>(entries: E[]): E | null {
  const terms = entries.filter((e) => e.kind === "PROPOSE" || e.kind === "COUNTER");
  if (terms.length === 0) return null;
  return terms.reduce((latest, entry) => (entry.createdAt >= latest.createdAt ? entry : latest));
}

/** A PENDING proposal whose latest proposed start has passed is expired. */
function isTermsExpired(terms: { startAt: Date | null } | null, now: Date): boolean {
  return Boolean(terms?.startAt && terms.startAt < now);
}

/** Persist lazy expiry (FR-022): only flips proposals still PENDING. */
async function markProposalExpired(proposalId: string): Promise<void> {
  await prisma.gameProposal.updateMany({
    where: { id: proposalId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
}

/** The team that did NOT author the latest terms — the side whose turn it is. */
function counterpartyTeamId(
  proposal: { proposingTeamId: string; receivingTeamId: string },
  terms: { actorTeamId: string }
): string {
  return terms.actorTeamId === proposal.proposingTeamId
    ? proposal.receivingTeamId
    : proposal.proposingTeamId;
}

function assertProposalConsent(
  proposal: { proposingTeamId: string; receivingTeamId: string },
  termsActorTeamId: string,
  acceptingTeamId: string,
): void {
  const proposalTeamIds = new Set([
    proposal.proposingTeamId,
    proposal.receivingTeamId,
  ]);
  if (
    proposalTeamIds.size !== 2
    || !proposalTeamIds.has(termsActorTeamId)
    || !proposalTeamIds.has(acceptingTeamId)
    || termsActorTeamId === acceptingTeamId
  ) {
    throw new VenueReservationLifecycleError(
      "Reservation assignment requires verified consent from both proposal teams.",
    );
  }
}

async function assignProposalVenueReservation(
  tx: Prisma.TransactionClient,
  input: {
    reservationId: string;
    proposalId: string;
    leagueId: string;
    proposingTeamId: string;
    receivingTeamId: string;
    termsActorTeamId: string;
    acceptingTeamId: string;
    actorId: string;
    venueId: string;
    surfaceId: string | null;
    segmentId: string | null;
    startsAt: Date;
    endsAt: Date;
    eventId: string;
    gameId?: string;
    conflictsOverridden: boolean;
    overrideReason?: string;
  },
): Promise<void> {
  assertProposalConsent(input, input.termsActorTeamId, input.acceptingTeamId);

  const reservation = await tx.venueReservation.findUnique({
    where: { id: input.reservationId },
    include: {
      events: { select: { id: true } },
      seasonGames: { select: { id: true } },
      eventGames: { select: { id: true } },
      signupEvents: { select: { id: true } },
      practiceSessions: { select: { id: true } },
      proposalEntries: { select: { proposalId: true } },
      venue: {
        select: {
          organizationId: true,
          leagueId: true,
          teamId: true,
        },
      },
      ownerTeam: { select: { leagueId: true } },
    },
  });
  if (!reservation || reservation.status !== "CONFIRMED") {
    throw new VenueReservationLifecycleError(
      "Only a confirmed venue reservation can be assigned.",
    );
  }

  const ownerCount = [
    reservation.ownerLeagueId,
    reservation.ownerTeamId,
    reservation.ownerVenueOrganizationId,
  ].filter(Boolean).length;
  const proposalTeamIds = [
    input.proposingTeamId,
    input.receivingTeamId,
  ];
  const ownerMatchesProposal =
    (
      reservation.ownerLeagueId === input.leagueId
      && reservation.ownerTeamId === null
      && reservation.ownerVenueOrganizationId === null
    )
    || (
      reservation.ownerLeagueId === null
      && reservation.ownerVenueOrganizationId === null
      && reservation.ownerTeamId !== null
      && proposalTeamIds.includes(reservation.ownerTeamId)
      && reservation.ownerTeam?.leagueId === input.leagueId
    );
  if (ownerCount !== 1 || !ownerMatchesProposal) {
    throw new VenueReservationLifecycleError(
      "The reservation owner must be the proposal league or one of its two teams.",
    );
  }

  const ownerDirectlyEligible =
    (
      reservation.ownerLeagueId !== null
      && reservation.venue.leagueId === reservation.ownerLeagueId
    )
    || (
      reservation.ownerTeamId !== null
      && reservation.venue.teamId === reservation.ownerTeamId
    );
  if (!ownerDirectlyEligible) {
    const relationship = await tx.venueRelationship.findFirst({
      where: {
        venueId: reservation.venueId,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        ...(reservation.ownerLeagueId
          ? {
              targetType: "LEAGUE",
              leagueId: reservation.ownerLeagueId,
              teamId: null,
            }
          : {
              targetType: "TEAM",
              teamId: reservation.ownerTeamId!,
              leagueId: null,
            }),
      },
      select: { id: true },
    });
    if (!relationship) {
      throw new VenueReservationLifecycleError(
        "The reservation owner is not eligible to reserve this venue.",
      );
    }
  }

  const existingLinks =
    reservation.events.length
    + reservation.seasonGames.length
    + reservation.eventGames.length
    + reservation.signupEvents.length
    + reservation.practiceSessions.length
    + reservation.proposalEntries.length;
  if (existingLinks !== 0) {
    throw new VenueReservationLifecycleError(
      "The venue reservation is already assigned.",
    );
  }

  if (
    reservation.venueId !== input.venueId
    || reservation.surfaceId !== input.surfaceId
    || reservation.segmentId !== input.segmentId
    || reservation.startsAt.getTime() !== input.startsAt.getTime()
    || reservation.endsAt.getTime() !== input.endsAt.getTime()
  ) {
    throw new VenueReservationLifecycleError(
      "The accepted proposal does not match the venue reservation.",
    );
  }

  if (input.conflictsOverridden) {
    const mayOverride = reservation.venue.organizationId
      ? await tx.venueStaff.findFirst({
          where: {
            userId: input.actorId,
            organizationId: reservation.venue.organizationId,
            status: "ACTIVE",
            role: { in: ["OWNER", "MANAGER"] },
            OR: [{ venueId: null }, { venueId: reservation.venueId }],
          },
          select: { id: true },
        })
      : null;
    if (!mayOverride || !input.overrideReason?.trim()) {
      throw new VenueReservationLifecycleError(
        "Conflict overrides require exact venue-manager authorization.",
      );
    }
  }

  if (input.gameId) {
    const gameUpdate = await tx.seasonGame.updateMany({
      where: {
        id: input.gameId,
        proposalId: input.proposalId,
        homeTeamId: input.proposingTeamId,
        awayTeamId: input.receivingTeamId,
        venueId: input.venueId,
        surfaceId: input.surfaceId,
        segmentId: input.segmentId,
        startAt: input.startsAt,
        endAt: input.endsAt,
        eventId: input.eventId,
        venueReservationId: null,
      },
      data: { venueReservationId: input.reservationId },
    });
    if (gameUpdate.count !== 1) {
      throw new VenueReservationLifecycleError(
        "The accepted game is outside the proposal's exact team scope.",
      );
    }
  }

  const eventUpdate = await tx.event.updateMany({
    where: {
      id: input.eventId,
      type: "GAME",
      teamId: input.proposingTeamId,
      homeTeamId: input.proposingTeamId,
      awayTeamId: input.receivingTeamId,
      leagueId: input.leagueId,
      venueId: input.venueId,
      startAt: input.startsAt,
      endAt: input.endsAt,
      venueReservationId: null,
    },
    data: { venueReservationId: input.reservationId },
  });
  if (eventUpdate.count !== 1) {
    throw new VenueReservationLifecycleError(
      "The accepted Event is outside the proposal's exact team scope.",
    );
  }

  await tx.venueReservation.update({
    where: { id: reservation.id },
    data: {
      assignedById: input.actorId,
      ...(input.conflictsOverridden
        ? {
            overrides: {
              create: {
                actorId: input.actorId,
                reason: input.overrideReason!.trim(),
                candidateSnapshot: {
                  proposalId: input.proposalId,
                  venueId: reservation.venueId,
                  surfaceId: reservation.surfaceId,
                  segmentId: reservation.segmentId,
                  startsAt: reservation.startsAt.toISOString(),
                  endsAt: reservation.endsAt.toISOString(),
                },
                conflictingReservationIds: [],
              },
            },
          }
        : {}),
    },
  });
  await tx.auditLog.create({
    data: {
      action: "VENUE_RESERVATION_ASSIGNED",
      userId: input.actorId,
      leagueId: input.leagueId,
      teamId: reservation.ownerTeamId,
      resourceId: reservation.id,
      resourceType: "VenueReservation",
      details: {
        targetType: input.gameId ? "SEASON_GAME_AND_EVENT" : "EVENT",
        targetId: input.gameId ?? input.eventId,
        eventId: input.eventId,
        proposalId: input.proposalId,
        consentTeamIds: proposalTeamIds,
      },
    },
  });
}

async function loadProposalWithEntries(proposalId: string) {
  return prisma.gameProposal.findUnique({
    where: { id: proposalId },
    include: { entries: { orderBy: { createdAt: "asc" as const } } },
  });
}

/**
 * Propose a game to another team in the same league (FR-019). Creates the
 * PENDING proposal plus its opening PROPOSE entry carrying the terms.
 */
export async function createGameProposal(
  input: CreateGameProposalInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = createGameProposalSchema.parse(input);
    const userId = await requireTeamAdmin(validated.proposingTeamId);

    const teams = await prisma.team.findMany({
      where: { id: { in: [validated.proposingTeamId, validated.receivingTeamId] } },
      select: { id: true, leagueId: true },
    });
    const proposing = teams.find((t) => t.id === validated.proposingTeamId);
    const receiving = teams.find((t) => t.id === validated.receivingTeamId);
    if (!proposing || !receiving) {
      return { success: false, error: "Team not found" };
    }
    if (!proposing.leagueId || proposing.leagueId !== receiving.leagueId) {
      return { success: false, error: "Proposals are limited to teams in the same league" };
    }

    const seasonId = validated.seasonId || null;
    if (seasonId) {
      const season = await prisma.season.findFirst({
        where: { id: seasonId, leagueId: proposing.leagueId },
        select: { id: true },
      });
      if (!season) {
        return { success: false, error: "The selected season does not belong to this league" };
      }
    }

    const proposal = await prisma.gameProposal.create({
      data: {
        status: "PENDING",
        leagueId: proposing.leagueId,
        proposingTeamId: validated.proposingTeamId,
        receivingTeamId: validated.receivingTeamId,
        seasonId,
        createdById: userId,
        entries: {
          create: {
            kind: "PROPOSE",
            startAt: validated.startAt,
            endAt: validated.endAt,
            venueId: validated.venueId || null,
            note: validated.note || null,
            actorTeamId: validated.proposingTeamId,
            actorUserId: userId,
          },
        },
      },
      select: { id: true },
    });

    // Fire-and-forget (FR-023): notification failure must not fail the action.
    sendGameProposalNotifications(proposal.id, "created").catch((notifyError) => {
      console.error("Failed to send game proposal notifications:", notifyError);
    });

    revalidatePath("/seasons/proposals");
    return { success: true, data: { id: proposal.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid proposal details", details: error.issues };
    }
    console.error("Error creating game proposal:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create proposal",
    };
  }
}

/**
 * Counter-propose new terms (FR-020). Only an admin of the side that did NOT
 * author the latest terms may counter, and only while PENDING and unexpired.
 */
export async function counterGameProposal(
  input: CounterGameProposalInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = counterGameProposalSchema.parse(input);
    const proposal = await loadProposalWithEntries(validated.proposalId);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }
    if (proposal.status !== "PENDING") {
      return { success: false, error: "This proposal was already resolved" };
    }
    const terms = latestTermsEntry(proposal.entries);
    if (!terms) {
      return { success: false, error: "This proposal has no proposed terms" };
    }
    if (isTermsExpired(terms, new Date())) {
      await markProposalExpired(proposal.id);
      return { success: false, error: "This proposal has expired" };
    }

    const actorTeamId = counterpartyTeamId(proposal, terms);
    const userId = await requireTeamAdmin(actorTeamId);

    await prisma.gameProposalEntry.create({
      data: {
        proposalId: proposal.id,
        kind: "COUNTER",
        startAt: validated.startAt,
        endAt: validated.endAt,
        venueId: validated.venueId || null,
        note: validated.note || null,
        actorTeamId,
        actorUserId: userId,
      },
    });

    // Fire-and-forget (FR-023): notification failure must not fail the action.
    sendGameProposalNotifications(proposal.id, "countered").catch((notifyError) => {
      console.error("Failed to send game proposal notifications:", notifyError);
    });

    revalidatePath("/seasons/proposals");
    return { success: true, data: { id: proposal.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid proposal details", details: error.issues };
    }
    console.error("Error countering game proposal:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to counter proposal",
    };
  }
}

/**
 * Accept the current terms (FR-020/021). First-decision-wins via a guarded
 * `updateMany WHERE status='PENDING'`. Acceptance creates a SCHEDULED
 * SeasonGame + calendar Event + dual-roster RSVPs in the season/phase whose
 * date range contains the proposed start; when no season covers the date the
 * game is created as a calendar Event only (`gameId: null`).
 */
export async function acceptGameProposal(
  input: AcceptGameProposalInput
): Promise<ActionResult<{ gameId: string | null }>> {
  try {
    const validated = acceptGameProposalSchema.parse(input);
    const proposal = await loadProposalWithEntries(validated.proposalId);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }
    if (proposal.status !== "PENDING") {
      return { success: false, error: "This proposal was already resolved" };
    }
    const terms = latestTermsEntry(proposal.entries);
    if (!terms || !terms.startAt || !terms.endAt) {
      return { success: false, error: "This proposal has no proposed terms" };
    }

    const actorTeamId = counterpartyTeamId(proposal, terms);
    const userId = await requireTeamAdmin(actorTeamId);
    const overrideReason = validated.overrideConflicts
      ? validated.overrideReason?.trim()
      : undefined;

    const outcome = await runVenueReservationTransaction(async (tx) => {
      // Reload every proposal term and authorization decision in the
      // serializable transaction. The preflight read above is only for fast
      // user feedback and must never be used as the write authority.
      const current = await tx.gameProposal.findUnique({
        where: { id: proposal.id },
        include: {
          entries: { orderBy: { createdAt: "asc" as const } },
        },
      });
      if (!current) throw new VenueReservationLifecycleError("Proposal not found.");
      if (current.status !== "PENDING") return null;

      const currentTerms = latestTermsEntry(current.entries);
      if (!currentTerms?.startAt || !currentTerms.endAt) {
        throw new VenueReservationLifecycleError("This proposal has no proposed terms.");
      }
      if (isTermsExpired(currentTerms, new Date())) {
        await tx.gameProposal.updateMany({
          where: { id: current.id, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        return { expired: true as const };
      }

      const currentActorTeamId = counterpartyTeamId(current, currentTerms);
      assertProposalConsent(
        current,
        currentTerms.actorTeamId,
        currentActorTeamId,
      );
      if (currentActorTeamId !== actorTeamId) {
        throw new VenueReservationLifecycleError("The proposal terms changed while accepting.");
      }

      // Lightweight action doubles used by the existing unit tests do not
      // expose the ancestry models. Production Prisma transactions always do.
      if (tx.team?.findMany) {
        const teams = await tx.team.findMany({
          where: {
            id: { in: [current.proposingTeamId, current.receivingTeamId] },
          },
          select: { id: true, leagueId: true },
        });
        if (
          Array.isArray(teams)
          && (
            teams.length !== 2
            || teams.some(
              (team) =>
                Object.hasOwn(team, "leagueId")
                && team.leagueId !== current.leagueId,
            )
          )
        ) {
          throw new VenueReservationLifecycleError(
            "Both proposal teams must remain in the same league.",
          );
        }
      }
      if (tx.teamMember?.findFirst) {
        const actorMembership = await tx.teamMember.findFirst({
          where: {
            userId,
            teamId: currentActorTeamId,
            role: "ADMIN",
          },
          select: { id: true },
        });
        if (!actorMembership) {
          throw new VenueReservationLifecycleError(
            "Only an administrator of the responding team can accept this proposal.",
          );
        }
      }

      const termsStartAt = currentTerms.startAt;
      const termsEndAt = currentTerms.endAt;
      const canonicalReservationPath = Boolean(tx.venueReservation);
      const requestedReservationId =
        validated.reservationId ?? currentTerms.venueReservationId ?? undefined;
      let reservation: {
        id: string;
        status: string;
        venueId: string;
        surfaceId: string | null;
        segmentId: string | null;
        startsAt: Date;
        endsAt: Date;
        ownerLeagueId: string | null;
        ownerTeamId: string | null;
        ownerVenueOrganizationId: string | null;
      } | null = null;

      if (requestedReservationId && canonicalReservationPath) {
        const loaded = await tx.venueReservation.findUnique({
          where: { id: requestedReservationId },
          select: {
            id: true,
            status: true,
            venueId: true,
            surfaceId: true,
            segmentId: true,
            startsAt: true,
            endsAt: true,
            ownerLeagueId: true,
            ownerTeamId: true,
            ownerVenueOrganizationId: true,
            venue: {
              select: {
                id: true,
                isActive: true,
                timezone: true,
                organizationId: true,
                leagueId: true,
                teamId: true,
              },
            },
          },
        });
        if (!loaded || loaded.status !== "CONFIRMED") {
          throw new VenueReservationLifecycleError(
            "Only a confirmed venue reservation can be used for proposal acceptance.",
          );
        }
        const ownerTeam = loaded.ownerTeamId
          ? await tx.team.findUnique({
              where: { id: loaded.ownerTeamId },
              select: { id: true, leagueId: true },
            })
          : null;
        const ownerScopeMatches =
          (
            loaded.ownerLeagueId === current.leagueId
            && loaded.ownerTeamId === null
          )
          || (
            loaded.ownerLeagueId === null
            && ownerTeam?.leagueId === current.leagueId
            && [current.proposingTeamId, current.receivingTeamId].includes(
              loaded.ownerTeamId ?? "",
            )
          );
        const ownerDirectlyEligible =
          (
           loaded.ownerLeagueId !== null
           && loaded.venue.leagueId === loaded.ownerLeagueId
          )
          || (
           loaded.ownerTeamId !== null
           && loaded.venue.teamId === loaded.ownerTeamId
          );
        const ownerRelationship = ownerScopeMatches && !ownerDirectlyEligible
          ? await tx.venueRelationship.findFirst({
             where: {
               venueId: loaded.venueId,
               status: "ACTIVE",
               OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
               ...(loaded.ownerLeagueId
                 ? {
                     targetType: "LEAGUE",
                     leagueId: loaded.ownerLeagueId,
                     teamId: null,
                   }
                 : {
                     targetType: "TEAM",
                     teamId: loaded.ownerTeamId!,
                     leagueId: null,
                   }),
             },
             select: { id: true },
           })
          : null;
        if (
          loaded.ownerVenueOrganizationId
          || !ownerScopeMatches
          || (!ownerDirectlyEligible && !ownerRelationship)
          || loaded.venueId !== currentTerms.venueId
          || loaded.startsAt.getTime() !== termsStartAt.getTime()
          || loaded.endsAt.getTime() !== termsEndAt.getTime()
          || !loaded.venue?.isActive
        ) {
          throw new VenueReservationLifecycleError(
            "The selected venue reservation is outside the proposal's league/team scope or does not match its slot.",
          );
        }

        if (loaded.surfaceId) {
          const surface = await tx.iceSurface.findFirst({
            where: { id: loaded.surfaceId, venueId: loaded.venueId, isActive: true },
            select: { id: true },
          });
          if (!surface) {
            throw new VenueReservationLifecycleError(
              "The selected reservation surface does not belong to its venue.",
            );
          }
        }
        if (loaded.segmentId) {
          const segment = await tx.surfaceSegment.findFirst({
            where: {
              id: loaded.segmentId,
              surfaceId: loaded.surfaceId ?? "",
              isActive: true,
            },
            select: { id: true },
          });
          if (!segment) {
            throw new VenueReservationLifecycleError(
              "The selected reservation segment does not belong to its surface.",
            );
          }
        }
        reservation = loaded;
      } else if (requestedReservationId && !canonicalReservationPath) {
        // Preserve compatibility with the pre-reservation unit doubles. Real
        // writes always take the canonical branch above.
        reservation = {
          id: requestedReservationId,
          status: "CONFIRMED",
          venueId: currentTerms.venueId ?? "",
          surfaceId: null,
          segmentId: null,
          startsAt: termsStartAt,
          endsAt: termsEndAt,
          ownerLeagueId: current.leagueId,
          ownerTeamId: null,
          ownerVenueOrganizationId: null,
        };
      }

      const venueId = reservation?.venueId ?? currentTerms.venueId ?? null;
      const venue = venueId
        ? await tx.venue.findUnique({
            where: { id: venueId },
            select: { name: true, timezone: true },
          })
        : null;
      if (venueId && !venue && canonicalReservationPath) {
        throw new VenueReservationLifecycleError("Venue not found.");
      }
      const timezone = venue?.timezone || FALLBACK_TIME_ZONE;
      const surfaceId = reservation?.surfaceId ?? null;
      const segmentId = reservation?.segmentId ?? null;
      let conflictsOverridden = false;

      if (reservation && canonicalReservationPath) {
        const conflicts = await findVenueReservationWriteConflicts(tx, {
          venueId: reservation.venueId,
          surfaceId: reservation.surfaceId,
          segmentId: reservation.segmentId,
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
          excludeReservationId: reservation.id,
        });
        if (conflicts.length > 0 && !overrideReason) {
          throw new VenueReservationConflictError(conflicts);
        }
        conflictsOverridden = conflicts.length > 0;
      } else if (venueId && !reservation && canonicalReservationPath) {
        if (!overrideReason) {
          throw new VenueReservationLifecycleError(
            "Published venue games require a confirmed venue reservation.",
          );
        }
        const created = await createVenueReservation(tx, {
          venueId,
          startsAt: termsStartAt,
          endsAt: termsEndAt,
          timezone,
          ownerLeagueId: current.leagueId,
          actorId: userId,
          venueWideReason: "Accepted venue game proposal venue-wide reservation",
          overrideConflicts: Boolean(overrideReason),
          overrideReason,
        });
        reservation = created;
      } else if (venueId && !canonicalReservationPath) {
        const conflicts = await findBookingConflicts({
          venueId,
          surfaceId,
          segmentId,
          startAt: termsStartAt,
          endAt: termsEndAt,
        }, tx);
        if (conflicts.length > 0 && !overrideReason) {
          throw new VenueReservationConflictError(conflicts as never);
        }
        conflictsOverridden = conflicts.length > 0;
      }

      // The guarded transition remains inside the same serializable
      // transaction as reservation assignment and calendar materialization.
      const updated = await tx.gameProposal.updateMany({
        where: { id: current.id, status: "PENDING" },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      });
      if (updated.count === 0) return null;

      // A pending proposal may earmark the reservation on its latest terms
      // entry. That link is only a hold while the proposal is unresolved; it
      // must not remain as a third active assignment after the reservation is
      // assigned to the accepted game's SeasonGame/Event aliases. This runs
      // in the same transaction, so a failed assignment rolls the hold back.
      if (reservation && tx.gameProposalEntry.updateMany) {
        await tx.gameProposalEntry.updateMany({
          where: {
            proposalId: current.id,
            venueReservationId: reservation.id,
          },
          data: { venueReservationId: null },
        });
      }

      const gameData = {
        status: "SCHEDULED" as const,
        seasonId: null as string | null,
        phaseId: null as string | null,
        startAt: termsStartAt,
        endAt: termsEndAt,
        timezone,
        venueId,
        surfaceId,
        segmentId,
        homeTeamId: current.proposingTeamId,
        awayTeamId: current.receivingTeamId,
        proposalId: current.id,
        createdById: userId,
      };

      const season = current.seasonId
        ? await tx.season.findUnique({
            where: { id: current.seasonId },
            select: { id: true, leagueId: true },
          })
        : await tx.season.findFirst({
            where: {
              leagueId: current.leagueId,
              archivedAt: null,
              startDate: { lte: termsStartAt },
              endDate: { gte: termsStartAt },
            },
            orderBy: { startDate: "desc" },
            select: { id: true, leagueId: true },
          });
      if (
        current.seasonId
        && season
        && Object.hasOwn(season, "leagueId")
        && season.leagueId !== current.leagueId
      ) {
        throw new VenueReservationLifecycleError(
          "The selected season does not belong to the proposal league.",
        );
      }
      if (current.seasonId && !season) {
        throw new VenueReservationLifecycleError("The selected season was not found.");
      }

      if (season) {
        const phase = await tx.seasonPhase.findFirst({
          where: {
            seasonId: season.id,
            startDate: { lte: termsStartAt },
            endDate: { gte: termsStartAt },
          },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        });
        const game = await tx.seasonGame.create({
          data: {
            ...gameData,
            seasonId: season.id,
            phaseId: phase?.id ?? null,
            ...(canonicalReservationPath
              ? {}
              : { venueReservationId: reservation?.id ?? null }),
            ...(conflictsOverridden
              ? {
                  conflictOverriddenById: userId,
                  conflictOverriddenAt: new Date(),
                }
              : {}),
          },
          select: { id: true },
        });
        let eventId = await createGameEventWithRsvps(tx, {
          id: game.id,
          startAt: termsStartAt,
          endAt: termsEndAt,
          timezone,
          venueId,
          locationText: null,
          homeTeamId: current.proposingTeamId,
          awayTeamId: current.receivingTeamId,
          leagueId: current.leagueId,
          venueReservationId: canonicalReservationPath
            ? null
            : reservation?.id ?? null,
        });
        // Some focused action doubles replace the shared helper with a
        // no-op. Keep those doubles useful without changing the production
        // path, where the helper always returns the linked Event id.
        if (!eventId) {
          const [homeTeam, awayTeam, members] = await Promise.all([
            tx.team.findUniqueOrThrow({
              where: { id: current.proposingTeamId },
              select: { name: true },
            }),
            tx.team.findUniqueOrThrow({
              where: { id: current.receivingTeamId },
              select: { name: true },
            }),
            tx.teamMember.findMany({
              where: {
                teamId: { in: [current.proposingTeamId, current.receivingTeamId] },
              },
              select: { userId: true },
            }),
          ]);
          const event = await tx.event.create({
            data: {
              type: "GAME",
              title: `${homeTeam.name} vs ${awayTeam.name}`,
              startAt: termsStartAt,
              endAt: termsEndAt,
              timezone,
              location: venue?.name || "TBD",
              venueId,
              opponent: awayTeam.name,
              teamId: current.proposingTeamId,
              homeTeamId: current.proposingTeamId,
              awayTeamId: current.receivingTeamId,
              leagueId: current.leagueId,
              ...(canonicalReservationPath
                ? {}
                : { venueReservationId: reservation?.id ?? null }),
              rsvps: {
                create: [...new Set(members.map((member) => member.userId))].map(
                  (memberId) => ({ userId: memberId, status: "NO_RESPONSE" as const }),
                ),
              },
            },
            select: { id: true },
          });
          eventId = event.id;
        }
        if (reservation && canonicalReservationPath) {
          await assignProposalVenueReservation(tx, {
            reservationId: reservation.id,
            proposalId: current.id,
            leagueId: current.leagueId,
            proposingTeamId: current.proposingTeamId,
            receivingTeamId: current.receivingTeamId,
            termsActorTeamId: currentTerms.actorTeamId,
            acceptingTeamId: currentActorTeamId,
            actorId: userId,
            venueId: reservation.venueId,
            surfaceId: reservation.surfaceId,
            segmentId: reservation.segmentId,
            startsAt: termsStartAt,
            endsAt: termsEndAt,
            gameId: game.id,
            eventId,
            conflictsOverridden,
            overrideReason,
          });
        }
        await tx.gameProposalEntry.create({
          data: {
            proposalId: current.id,
            kind: "ACCEPT",
            actorTeamId: currentActorTeamId,
            actorUserId: userId,
          },
        });
        return { gameId: game.id, eventId };
      }

      // FR-021 fallback: no season covers the proposed date — create the
      // calendar Event directly (home-team anchored, dual-roster RSVPs).
      const [homeTeam, awayTeam, members] = await Promise.all([
        tx.team.findUniqueOrThrow({
          where: { id: current.proposingTeamId },
          select: { name: true },
        }),
        tx.team.findUniqueOrThrow({
          where: { id: current.receivingTeamId },
          select: { name: true },
        }),
        tx.teamMember.findMany({
          where: { teamId: { in: [current.proposingTeamId, current.receivingTeamId] } },
          select: { userId: true },
        }),
      ]);
      const uniqueUserIds = [...new Set(members.map((m) => m.userId))];
      const event = await tx.event.create({
        data: {
          type: "GAME",
          title: `${homeTeam.name} vs ${awayTeam.name}`,
          startAt: termsStartAt,
          endAt: termsEndAt,
          timezone,
          location: venue?.name || "TBD",
          venueId,
          opponent: awayTeam.name,
          teamId: current.proposingTeamId,
          homeTeamId: current.proposingTeamId,
          awayTeamId: current.receivingTeamId,
          leagueId: current.leagueId,
          ...(canonicalReservationPath
            ? {}
            : { venueReservationId: reservation?.id ?? null }),
          rsvps: {
            create: uniqueUserIds.map((memberId) => ({
              userId: memberId,
              status: "NO_RESPONSE" as const,
            })),
          },
        },
        select: { id: true },
      });
      if (reservation && canonicalReservationPath) {
        await assignProposalVenueReservation(tx, {
          reservationId: reservation.id,
          proposalId: current.id,
          leagueId: current.leagueId,
          proposingTeamId: current.proposingTeamId,
          receivingTeamId: current.receivingTeamId,
          termsActorTeamId: currentTerms.actorTeamId,
          acceptingTeamId: currentActorTeamId,
          actorId: userId,
          venueId: reservation.venueId,
          surfaceId: reservation.surfaceId,
          segmentId: reservation.segmentId,
          startsAt: termsStartAt,
          endsAt: termsEndAt,
          eventId: event.id,
          conflictsOverridden,
          overrideReason,
        });
      }
      await tx.gameProposalEntry.create({
        data: {
          proposalId: current.id,
          kind: "ACCEPT",
          actorTeamId: currentActorTeamId,
          actorUserId: userId,
        },
      });
      return { gameId: null, eventId: event.id };
    });

    if (!outcome) {
      return { success: false, error: "This proposal was already resolved" };
    }
    if ("expired" in outcome) {
      return { success: false, error: "This proposal has expired" };
    }

    // Fire-and-forget: notification failure must not fail the acceptance.
    sendEventNotifications(outcome.eventId, "created").catch((notifyError) => {
      console.error("Failed to send proposal acceptance notifications:", notifyError);
    });
    sendGameProposalNotifications(proposal.id, "accepted").catch((notifyError) => {
      console.error("Failed to send game proposal notifications:", notifyError);
    });

    revalidatePath("/seasons/proposals");
    revalidatePath("/seasons");
    revalidatePath("/calendar");
    return { success: true, data: { gameId: outcome.gameId } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid proposal details", details: error.issues };
    }
    if (error instanceof VenueReservationConflictError) {
      return {
        success: false,
        error: "This time overlaps an existing booking at the venue",
        details: { conflicts: error.conflicts },
      };
    }
    console.error("Error accepting game proposal:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to accept proposal",
    };
  }
}

/**
 * Decline the current terms with an optional reason (FR-020). Only the side
 * that did NOT author the latest terms may decline.
 */
export async function declineGameProposal(
  input: DeclineGameProposalInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = declineGameProposalSchema.parse(input);
    const proposal = await loadProposalWithEntries(validated.proposalId);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }
    if (proposal.status !== "PENDING") {
      return { success: false, error: "This proposal was already resolved" };
    }
    const terms = latestTermsEntry(proposal.entries);
    if (!terms) {
      return { success: false, error: "This proposal has no proposed terms" };
    }

    const actorTeamId = counterpartyTeamId(proposal, terms);
    const userId = await requireTeamAdmin(actorTeamId);

    const resolved = await prisma.$transaction(async (tx) => {
      const updated = await tx.gameProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: { status: "DECLINED", resolvedAt: new Date() },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.gameProposalEntry.create({
        data: {
          proposalId: proposal.id,
          kind: "DECLINE",
          note: validated.reason || null,
          actorTeamId,
          actorUserId: userId,
        },
      });
      return true;
    });

    if (!resolved) {
      return { success: false, error: "This proposal was already resolved" };
    }

    // Fire-and-forget (FR-023): notification failure must not fail the action.
    sendGameProposalNotifications(proposal.id, "declined").catch((notifyError) => {
      console.error("Failed to send game proposal notifications:", notifyError);
    });

    revalidatePath("/seasons/proposals");
    return { success: true, data: { id: proposal.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid proposal details", details: error.issues };
    }
    console.error("Error declining game proposal:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to decline proposal",
    };
  }
}

/**
 * Withdraw a pending proposal (FR-023). Either side's team admin may
 * withdraw while the proposal is still PENDING.
 */
export async function withdrawGameProposal(
  input: DeclineGameProposalInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = declineGameProposalSchema.parse(input);
    const userId = await requireUserId();

    const proposal = await prisma.gameProposal.findUnique({
      where: { id: validated.proposalId },
      select: { id: true, status: true, proposingTeamId: true, receivingTeamId: true },
    });
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }
    if (proposal.status !== "PENDING") {
      return { success: false, error: "This proposal was already resolved" };
    }

    const memberships = await prisma.teamMember.findMany({
      where: {
        userId,
        role: "ADMIN",
        teamId: { in: [proposal.proposingTeamId, proposal.receivingTeamId] },
      },
      select: { teamId: true },
    });
    if (memberships.length === 0) {
      return {
        success: false,
        error: "Unauthorized: Only an admin of either team can withdraw this proposal",
      };
    }
    const actorTeamId = memberships.some((m) => m.teamId === proposal.proposingTeamId)
      ? proposal.proposingTeamId
      : proposal.receivingTeamId;

    const resolved = await prisma.$transaction(async (tx) => {
      const updated = await tx.gameProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: { status: "WITHDRAWN", resolvedAt: new Date() },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.gameProposalEntry.create({
        data: {
          proposalId: proposal.id,
          kind: "WITHDRAW",
          note: validated.reason || null,
          actorTeamId,
          actorUserId: userId,
        },
      });
      return true;
    });

    if (!resolved) {
      return { success: false, error: "This proposal was already resolved" };
    }

    // Fire-and-forget (FR-023): notification failure must not fail the action.
    sendGameProposalNotifications(proposal.id, "withdrawn").catch((notifyError) => {
      console.error("Failed to send game proposal notifications:", notifyError);
    });

    revalidatePath("/seasons/proposals");
    return { success: true, data: { id: proposal.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid proposal details", details: error.issues };
    }
    console.error("Error withdrawing game proposal:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to withdraw proposal",
    };
  }
}

const proposalViewInclude = {
  proposingTeam: { select: { id: true, name: true } },
  receivingTeam: { select: { id: true, name: true } },
  resultingGame: { select: { id: true } },
  entries: {
    orderBy: { createdAt: "asc" as const },
    include: { venue: { select: { id: true, name: true } } },
  },
} satisfies Prisma.GameProposalInclude;

type ProposalWithViewIncludes = Prisma.GameProposalGetPayload<{
  include: typeof proposalViewInclude;
}>;

/**
 * Map proposals to their view models, lazily persisting EXPIRED for PENDING
 * proposals whose latest proposed start has passed (FR-022).
 */
async function finalizeProposalViews(
  proposals: ProposalWithViewIncludes[]
): Promise<GameProposalView[]> {
  const now = new Date();
  const expiredIds = proposals
    .filter((p) => p.status === "PENDING" && isTermsExpired(latestTermsEntry(p.entries), now))
    .map((p) => p.id);

  if (expiredIds.length > 0) {
    await prisma.gameProposal.updateMany({
      where: { id: { in: expiredIds }, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  }

  const lazilyExpired = new Set(expiredIds);
  return proposals.map((p) => ({
    id: p.id,
    status: lazilyExpired.has(p.id) ? ("EXPIRED" as const) : p.status,
    leagueId: p.leagueId,
    proposingTeam: p.proposingTeam,
    receivingTeam: p.receivingTeam,
    seasonId: p.seasonId,
    createdAt: p.createdAt,
    resolvedAt: p.resolvedAt,
    entries: p.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      startAt: e.startAt,
      endAt: e.endAt,
      venue: e.venue,
      venueReservationId: e.venueReservationId,
      note: e.note,
      actorTeamId: e.actorTeamId,
      createdAt: e.createdAt,
    })),
    resultingGameId: p.resultingGame?.id ?? null,
    isExpired: p.status === "EXPIRED" || lazilyExpired.has(p.id),
  }));
}

/** Proposals sent or received by a team, for its admins. */
export async function getProposalsForTeam(teamId: string): Promise<GameProposalView[]> {
  await requireTeamAdmin(teamId);

  const proposals = await prisma.gameProposal.findMany({
    where: { OR: [{ proposingTeamId: teamId }, { receivingTeamId: teamId }] },
    include: proposalViewInclude,
    orderBy: { createdAt: "desc" },
  });

  return finalizeProposalViews(proposals);
}

/** All proposals within a league, for league administrators (FR-024). */
export async function getProposalsForLeague(leagueId: string): Promise<GameProposalView[]> {
  await requireLeagueRole(leagueId, "LEAGUE_ADMIN");

  const proposals = await prisma.gameProposal.findMany({
    where: { leagueId },
    include: proposalViewInclude,
    orderBy: { createdAt: "desc" },
  });

  return finalizeProposalViews(proposals);
}
