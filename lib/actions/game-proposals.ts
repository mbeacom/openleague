"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireLeagueRole, requireTeamAdmin, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendEventNotifications, sendGameProposalNotifications } from "@/lib/email/templates";
import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";
import { findGameConflicts } from "@/lib/utils/game-conflicts";
import { createGameEventWithRsvps } from "@/lib/actions/season-games";
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
    if (isTermsExpired(terms, new Date())) {
      await markProposalExpired(proposal.id);
      return { success: false, error: "This proposal has expired" };
    }

    const actorTeamId = counterpartyTeamId(proposal, terms);
    const userId = await requireTeamAdmin(actorTeamId);

    const termsStartAt = terms.startAt;
    const termsEndAt = terms.endAt;
    const termsVenueId = terms.venueId;

    // Venue availability applies to accepted proposals the same as any other
    // scheduling path (FR-012/013): warn, and require an explicit override.
    let conflictsOverridden = false;
    if (termsVenueId) {
      const conflicts = await findGameConflicts({
        venueId: termsVenueId,
        startAt: termsStartAt,
        endAt: termsEndAt,
      });
      if (conflicts.length > 0 && !validated.overrideConflicts) {
        return {
          success: false,
          error: `This time overlaps ${conflicts.length} existing booking${conflicts.length > 1 ? "s" : ""} at the venue`,
          details: { conflicts },
        };
      }
      conflictsOverridden = conflicts.length > 0;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      // Race-safe transition: whoever flips PENDING first wins.
      const updated = await tx.gameProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      });
      if (updated.count === 0) {
        return null;
      }

      await tx.gameProposalEntry.create({
        data: {
          proposalId: proposal.id,
          kind: "ACCEPT",
          actorTeamId,
          actorUserId: userId,
        },
      });

      // Resolve the target season (FR-021): the proposal's chosen season, else
      // the league's non-archived season covering the proposed start.
      const season = proposal.seasonId
        ? await tx.season.findUnique({
            where: { id: proposal.seasonId },
            select: { id: true },
          })
        : await tx.season.findFirst({
            where: {
              leagueId: proposal.leagueId,
              archivedAt: null,
              startDate: { lte: termsStartAt },
              endDate: { gte: termsStartAt },
            },
            orderBy: { startDate: "desc" },
            select: { id: true },
          });

      const venue = termsVenueId
        ? await tx.venue.findUnique({
            where: { id: termsVenueId },
            select: { name: true, timezone: true },
          })
        : null;
      const timezone = venue?.timezone || FALLBACK_TIME_ZONE;

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
            status: "SCHEDULED",
            seasonId: season.id,
            phaseId: phase?.id ?? null,
            startAt: termsStartAt,
            endAt: termsEndAt,
            timezone,
            venueId: termsVenueId,
            homeTeamId: proposal.proposingTeamId,
            awayTeamId: proposal.receivingTeamId,
            proposalId: proposal.id,
            createdById: userId,
            ...(conflictsOverridden && {
              conflictOverriddenById: userId,
              conflictOverriddenAt: new Date(),
            }),
          },
          select: { id: true },
        });

        const eventId = await createGameEventWithRsvps(tx, {
          id: game.id,
          startAt: termsStartAt,
          endAt: termsEndAt,
          timezone,
          venueId: termsVenueId,
          locationText: null,
          homeTeamId: proposal.proposingTeamId,
          awayTeamId: proposal.receivingTeamId,
          leagueId: proposal.leagueId,
        });

        return { gameId: game.id, eventId };
      }

      // FR-021 fallback: no season covers the proposed date — create the
      // calendar Event directly (home-team anchored, dual-roster RSVPs).
      const [homeTeam, awayTeam, members] = await Promise.all([
        tx.team.findUniqueOrThrow({
          where: { id: proposal.proposingTeamId },
          select: { name: true },
        }),
        tx.team.findUniqueOrThrow({
          where: { id: proposal.receivingTeamId },
          select: { name: true },
        }),
        tx.teamMember.findMany({
          where: { teamId: { in: [proposal.proposingTeamId, proposal.receivingTeamId] } },
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
          venueId: termsVenueId,
          opponent: awayTeam.name,
          teamId: proposal.proposingTeamId,
          homeTeamId: proposal.proposingTeamId,
          awayTeamId: proposal.receivingTeamId,
          leagueId: proposal.leagueId,
          rsvps: {
            create: uniqueUserIds.map((memberId) => ({
              userId: memberId,
              status: "NO_RESPONSE" as const,
            })),
          },
        },
        select: { id: true },
      });

      return { gameId: null, eventId: event.id };
    });

    if (!outcome) {
      return { success: false, error: "This proposal was already resolved" };
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
