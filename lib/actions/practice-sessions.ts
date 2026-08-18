"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
    requireLeagueRole,
    requireTeamAdmin,
    requireTeamMember,
} from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import {
    createPracticeSessionSchema,
    updatePracticeSessionSchema,
    deletePracticeSessionSchema,
    getPracticeSessionByIdSchema,
    getPracticeSessionsByTeamSchema,
    sharePracticeSessionSchema,
    type CreatePracticeSessionInput,
    type UpdatePracticeSessionInput,
    type DeletePracticeSessionInput,
    type GetPracticeSessionByIdInput,
    type GetPracticeSessionsByTeamInput,
    type SharePracticeSessionInput,
} from "@/lib/utils/validation";
import type { PlayData } from "@/types/practice-planner";
import {
    assignVenueReservation,
    createVenueReservation,
    VenueReservationConflictError,
    VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";
import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

type PracticeReservationFields = {
    reservationId?: string | null;
    overrideReason?: string;
};

type CreatePracticeSessionActionInput =
    CreatePracticeSessionInput & PracticeReservationFields;
type UpdatePracticeSessionActionInput =
    UpdatePracticeSessionInput & PracticeReservationFields;

const practiceReservationFieldsSchema = z.object({
    reservationId: z.string().cuid("Invalid venue reservation ID").nullable().optional(),
    overrideReason: z.string().trim().min(1).max(1000).optional(),
});

type ConfirmedPracticeReservation = {
    id: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    venueId: string;
    surfaceId: string | null;
    segmentId: string | null;
    ownerTeamId: string | null;
    ownerLeagueId: string | null;
    ownerVenueOrganizationId: string | null;
    venue?: { name: string; timezone: string } | null;
};

function reservationFields(input: PracticeReservationFields) {
    return practiceReservationFieldsSchema.parse({
        reservationId: input.reservationId,
        overrideReason: input.overrideReason,
    });
}

async function requirePracticeScheduler(
    teamId: string,
    reservationId?: string | null,
): Promise<string> {
    let teamActorId: string | null = null;
    let teamError: unknown;
    try {
        teamActorId = await requireTeamAdmin(teamId);
    } catch (error) {
        teamError = error;
    }
    if (!reservationId) {
        if (teamActorId) return teamActorId;
        throw teamError;
    }

    const reservation = await prisma.venueReservation.findUnique({
        where: { id: reservationId },
        select: { ownerLeagueId: true },
    });
    if (!reservation?.ownerLeagueId) {
        if (teamActorId) return teamActorId;
        throw teamError;
    }

    const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { leagueId: true },
    });
    if (team?.leagueId !== reservation.ownerLeagueId) {
        throw teamError ?? new Error("Unauthorized");
    }
    return requireLeagueRole(team.leagueId, "LEAGUE_ADMIN");
}

async function loadConfirmedPracticeReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
    teamId: string,
    expectedStart: Date,
    expectedDuration: number,
): Promise<ConfirmedPracticeReservation> {
    const reservation = await tx.venueReservation.findUnique({
        where: { id: reservationId },
        include: { venue: { select: { name: true, timezone: true } } },
    }) as ConfirmedPracticeReservation | null;
    if (!reservation || reservation.status !== "CONFIRMED") {
        throw new VenueReservationLifecycleError(
            "Select a confirmed venue reservation.",
        );
    }

    if (reservation.ownerTeamId) {
        if (reservation.ownerTeamId !== teamId) {
            throw new VenueReservationLifecycleError(
                "The venue reservation is outside this team's scope.",
            );
        }
    } else if (reservation.ownerLeagueId) {
        const team = await tx.team.findUnique({
            where: { id: teamId },
            select: { leagueId: true },
        });
        if (team?.leagueId !== reservation.ownerLeagueId) {
            throw new VenueReservationLifecycleError(
                "The venue reservation is outside this league's scope.",
            );
        }
    } else {
        throw new VenueReservationLifecycleError(
            "Venue-owned inventory cannot be assigned to this practice.",
        );
    }

    const expectedEnd = new Date(
        expectedStart.getTime() + expectedDuration * 60_000,
    );
    if (
        reservation.startsAt.getTime() !== expectedStart.getTime()
        || reservation.endsAt.getTime() !== expectedEnd.getTime()
    ) {
        throw new VenueReservationLifecycleError(
            "The practice time and duration must match the selected venue reservation.",
        );
    }
    return reservation;
}

async function assertExactTeamAdminInTransaction(
    tx: Prisma.TransactionClient,
    input: { teamId: string; actorId: string },
): Promise<void> {
    const teamAdmin = await tx.teamMember.findFirst({
        where: {
            userId: input.actorId,
            teamId: input.teamId,
            role: "ADMIN",
        },
        select: { id: true },
    });
    if (!teamAdmin) {
        throw new VenueReservationLifecycleError(
            "Practice updates require exact team-admin authority.",
        );
    }
}

async function assertPracticeReservationActorInTransaction(
    tx: Prisma.TransactionClient,
    input: {
        reservationId: string;
        teamId: string;
        actorId: string;
    },
): Promise<void> {
    const reservation = await tx.venueReservation.findUnique({
        where: { id: input.reservationId },
        select: { ownerLeagueId: true, ownerTeamId: true },
    });
    if (!reservation) {
        throw new VenueReservationLifecycleError(
            "Venue reservation not found.",
        );
    }
    if (reservation.ownerTeamId) {
        if (reservation.ownerTeamId !== input.teamId) {
            throw new VenueReservationLifecycleError(
                "The venue reservation is outside this team's scope.",
            );
        }
        const teamAdmin = await tx.teamMember.findFirst({
            where: {
                userId: input.actorId,
                teamId: input.teamId,
                role: "ADMIN",
            },
            select: { id: true },
        });
        if (!teamAdmin) {
            throw new VenueReservationLifecycleError(
                "Team-owned reservations require exact team-admin authority.",
            );
        }
        return;
    }
    if (reservation.ownerLeagueId) {
        const team = await tx.team.findUnique({
            where: { id: input.teamId },
            select: { leagueId: true },
        });
        const scheduler = await tx.leagueUser.findFirst({
            where: {
                userId: input.actorId,
                leagueId: reservation.ownerLeagueId,
                role: "LEAGUE_ADMIN",
            },
            select: { id: true },
        });
        if (
            team?.leagueId !== reservation.ownerLeagueId
            || !scheduler
        ) {
            throw new VenueReservationLifecycleError(
                "League-owned reservations require same-league scheduler authority.",
            );
        }
        return;
    }
    throw new VenueReservationLifecycleError(
        "Venue-owned inventory cannot be assigned to this practice.",
    );
}

function practiceDataFromReservation(
    reservation: ConfirmedPracticeReservation,
): PracticeAttachment {
    return {
        venueId: reservation.venueId,
        surfaceId: reservation.surfaceId,
        segmentId: reservation.segmentId,
        startAt: reservation.startsAt,
    };
}

async function createPracticeEventAndRsvps(
    tx: Prisma.TransactionClient,
    input: {
        eventId?: string;
        title: string;
        teamId: string;
        reservation: ConfirmedPracticeReservation;
        actorId: string;
        overrideConflicts?: boolean;
        overrideReason?: string;
        assignEventReservation?: boolean;
    },
): Promise<string> {
    const eventData = {
        type: "PRACTICE" as const,
        title: input.title,
        startAt: input.reservation.startsAt,
        endAt: input.reservation.endsAt,
        timezone:
            input.reservation.timezone
            || input.reservation.venue?.timezone
            || FALLBACK_TIME_ZONE,
        location: input.reservation.venue?.name || "Venue",
        venueId: input.reservation.venueId,
        opponent: null,
        notes: null,
        teamId: input.teamId,
        leagueId: null,
    };
    const event = input.eventId
        ? await tx.event.update({
            where: { id: input.eventId },
            data: eventData,
            select: { id: true },
        })
        : await tx.event.create({
            data: eventData,
            select: { id: true },
        });

    if (input.assignEventReservation !== false) {
        await assignVenueReservation(tx, {
            reservationId: input.reservation.id,
            targetType: "EVENT",
            targetId: event.id,
            actorId: input.actorId,
            overrideConflicts: input.overrideConflicts,
            overrideReason: input.overrideReason,
        });
    }

    const members = await tx.teamMember.findMany({
        where: { teamId: input.teamId },
        select: { userId: true },
    });
    const userIds = [...new Set(members.map(({ userId }) => userId))];
    if (userIds.length > 0) {
        await tx.rSVP.createMany({
            data: userIds.map((userId) => ({
                eventId: event.id,
                userId,
                status: "NO_RESPONSE" as const,
            })),
            skipDuplicates: true,
        });
    }
    return event.id;
}

/**
 * Sanitize text input by removing control characters and trimming
 * Requirements: 2.1
 */
function sanitizeText(text: string | null | undefined, maxLength: number): string {
    if (!text) return "";

    // Remove control characters and trim
    const sanitized = text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim();

    // Truncate to max length
    return sanitized.slice(0, maxLength);
}

/**
 * Validate play sequence integrity
 * Ensures sequences are unique and start from 0
 * Requirements: 2.5
 */
function validatePlaySequence(plays: Array<{ sequence: number }>): { valid: boolean; error?: string } {
    if (plays.length === 0) {
        return { valid: true };
    }

    // Check for unique sequences
    const sequences = plays.map(p => p.sequence);
    const uniqueSequences = new Set(sequences);
    if (sequences.length !== uniqueSequences.size) {
        return { valid: false, error: "Play sequences must be unique" };
    }

    // Check sequences are consecutive starting from 0
    const sortedSequences = [...sequences].sort((a, b) => a - b);
    for (let i = 0; i < sortedSequences.length; i++) {
        if (sortedSequences[i] !== i) {
            return { valid: false, error: "Play sequences must be consecutive starting from 0" };
        }
    }

    return { valid: true };
}

/**
 * Validate total duration against session duration
 * Requirements: 2.3
 */
function validateTotalDuration(
    sessionDuration: number,
    plays: Array<{ duration: number }>
): { valid: boolean; error?: string; totalDuration?: number } {
    const totalDuration = plays.reduce((sum, play) => sum + play.duration, 0);

    if (totalDuration > sessionDuration) {
        return {
            valid: false,
            error: `Total play duration (${totalDuration} minutes) exceeds session duration (${sessionDuration} minutes)`,
            totalDuration,
        };
    }

    return { valid: true, totalDuration };
}

/**
 * Optional venue attachment for a practice (feature 006, FR-019).
 * A practice with no venue has no availability footprint; attaching a venue
 * requires a start time (schema refine) and the slot is startAt + duration.
 */
type PracticeAttachment = {
    venueId: string | null;
    surfaceId: string | null;
    segmentId: string | null;
    startAt: Date | null;
};

/**
 * Normalize the attachment fields from validated input. Detaching
 * (venueId empty/absent) clears surface/segment/startAt so the practice
 * behaves exactly as before feature 006.
 */
function normalizePracticeAttachment(validated: {
    venueId?: string;
    surfaceId?: string;
    segmentId?: string;
    startAt?: Date;
}): PracticeAttachment {
    const venueId = validated.venueId || null;
    if (!venueId) {
        return { venueId: null, surfaceId: null, segmentId: null, startAt: null };
    }
    return {
        venueId,
        surfaceId: validated.surfaceId || null,
        segmentId: validated.segmentId || null,
        startAt: validated.startAt ?? null,
    };
}

/**
 * Create a new practice session
 * Only ADMIN role can create sessions
 * Requirements: 2.1, 2.2, 2.5
 */
export async function createPracticeSession(
    input: CreatePracticeSessionActionInput
): Promise<ActionResult<{ id: string; title: string; date: Date; conflictsOverridden: boolean }>> {
    try {
        const validated = createPracticeSessionSchema.parse(input);
        const reservationInput = reservationFields(input);
        const userId = await requirePracticeScheduler(
            validated.teamId,
            reservationInput.reservationId,
        );

        if (validated.plays && validated.plays.length > 0) {
            const sequenceValidation = validatePlaySequence(validated.plays);
            if (!sequenceValidation.valid) {
                return {
                    success: false,
                    error: sequenceValidation.error || "Invalid play sequence",
                };
            }

            const durationValidation = validateTotalDuration(validated.duration, validated.plays);
            if (!durationValidation.valid) {
                return {
                    success: false,
                    error: durationValidation.error || "Invalid total duration",
                };
            }

            const playIds = validated.plays.map(p => p.playId);
            const plays = await prisma.play.findMany({
                where: {
                    id: { in: playIds },
                    teamId: validated.teamId,
                },
                select: { id: true },
            });

            if (plays.length !== playIds.length) {
                return {
                    success: false,
                    error: "One or more plays not found or do not belong to this team",
                };
            }
        }

        const requestedAttachment = normalizePracticeAttachment(validated);
        if (
            !reservationInput.reservationId
            && requestedAttachment.venueId
            && validated.overrideConflicts
            && !reservationInput.overrideReason
        ) {
            return {
                success: false,
                error: "Explain why this venue conflict should be overridden.",
            };
        }

        const session = await runVenueReservationTransaction(async (tx) => {
            let reservation: ConfirmedPracticeReservation | null = null;

            if (reservationInput.reservationId) {
                reservation = await loadConfirmedPracticeReservation(
                    tx,
                    reservationInput.reservationId,
                    validated.teamId,
                    validated.date,
                    validated.duration,
                );
            } else if (requestedAttachment.venueId && requestedAttachment.startAt) {
                const venue = await tx.venue.findUnique({
                    where: { id: requestedAttachment.venueId },
                    select: { name: true, timezone: true },
                });
                if (!venue) {
                    throw new VenueReservationLifecycleError(
                        "Venue not found or unavailable.",
                    );
                }
                const created = await createVenueReservation(tx, {
                    venueId: requestedAttachment.venueId,
                    surfaceId: requestedAttachment.surfaceId,
                    segmentId: requestedAttachment.segmentId,
                    startsAt: requestedAttachment.startAt,
                    endsAt: new Date(
                        requestedAttachment.startAt.getTime()
                            + validated.duration * 60_000,
                    ),
                    timezone: venue.timezone,
                    ownerTeamId: validated.teamId,
                    actorId: userId,
                    status: "CONFIRMED",
                    overrideConflicts: validated.overrideConflicts,
                    overrideReason: reservationInput.overrideReason,
                });
                reservation = {
                    ...created,
                    startsAt: requestedAttachment.startAt,
                    endsAt: new Date(
                        requestedAttachment.startAt.getTime()
                            + validated.duration * 60_000,
                    ),
                    timezone: venue.timezone,
                    venueId: requestedAttachment.venueId,
                    surfaceId: requestedAttachment.surfaceId,
                    segmentId: requestedAttachment.segmentId,
                    ownerTeamId: validated.teamId,
                    ownerLeagueId: null,
                    ownerVenueOrganizationId: null,
                    venue,
                };
            }

            const canonical = reservation
                ? practiceDataFromReservation(reservation)
                : requestedAttachment;
            const createdSession = await tx.practiceSession.create({
                data: {
                    title: validated.title,
                    date: reservation ? reservation.startsAt : validated.date,
                    duration: reservation
                        ? Math.round(
                            (
                                reservation.endsAt.getTime()
                                - reservation.startsAt.getTime()
                            ) / 60_000,
                        )
                        : validated.duration,
                    isShared: false,
                    teamId: validated.teamId,
                    createdById: userId,
                    venueId: canonical.venueId,
                    surfaceId: canonical.surfaceId,
                    segmentId: canonical.segmentId,
                    startAt: canonical.startAt,
                    plays: validated.plays.length > 0 ? {
                        create: validated.plays.map(play => ({
                            playId: play.playId,
                            sequence: play.sequence,
                            duration: play.duration,
                            instructions: play.instructions
                                ? sanitizeText(play.instructions, 2000)
                                : null,
                        })),
                    } : undefined,
                },
                select: { id: true, title: true, date: true },
            });

            if (reservation) {
                await assignVenueReservation(tx, {
                    reservationId: reservation.id,
                    targetType: "PRACTICE",
                    targetId: createdSession.id,
                    actorId: userId,
                    overrideConflicts: validated.overrideConflicts,
                    overrideReason: reservationInput.overrideReason,
                });
                await createPracticeEventAndRsvps(tx, {
                    title: validated.title,
                    teamId: validated.teamId,
                    reservation,
                    actorId: userId,
                    overrideConflicts: validated.overrideConflicts,
                    overrideReason: reservationInput.overrideReason,
                });
            }
            return createdSession;
        });

        revalidatePath("/practice-planner");
        revalidatePath("/calendar");

        return {
            success: true,
            data: {
                ...session,
                conflictsOverridden: Boolean(reservationInput.overrideReason),
            },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (
            error instanceof VenueReservationConflictError
            || error instanceof VenueReservationLifecycleError
        ) {
            return {
                success: false,
                error: error.message,
                ...(
                    error instanceof VenueReservationConflictError
                        ? { details: { conflicts: error.conflicts } }
                        : {}
                ),
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error creating practice session:", error);
        return {
            success: false,
            error: "Failed to create practice session. Please try again.",
        };
    }
}

/**
 * Update an existing practice session
 * Only ADMIN role can update sessions
 * Requirements: 2.1, 2.2, 2.5
 */
export async function updatePracticeSession(
    input: UpdatePracticeSessionActionInput
): Promise<ActionResult<{ id: string; title: string; date: Date; conflictsOverridden: boolean }>> {
    try {
        const validated = updatePracticeSessionSchema.parse(input);
        const parsedReservation = reservationFields(input);
        const reservationWasSubmitted = Object.hasOwn(input, "reservationId");

        const existingSession = await prisma.practiceSession.findUnique({
            where: { id: validated.id },
            select: {
                teamId: true,
                isShared: true,
                venueReservationId: true,
            },
        });

        if (!existingSession) {
            return {
                success: false,
                error: "Practice session not found",
            };
        }

        if (existingSession.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Practice session does not belong to this team",
            };
        }
        const selectedReservationId = reservationWasSubmitted
            ? parsedReservation.reservationId ?? null
            : existingSession.venueReservationId;
        const requestedAttachment = normalizePracticeAttachment(validated);
        const createsDirectReservation =
            !selectedReservationId
            && Boolean(
                requestedAttachment.venueId
                && requestedAttachment.startAt,
            );
        const reservationRelationChanged =
            selectedReservationId !== existingSession.venueReservationId
            || createsDirectReservation;
        let userId: string;
        if (!reservationRelationChanged) {
            userId = await requireTeamAdmin(existingSession.teamId);
        } else {
            const actorIds: string[] = [];
            if (existingSession.venueReservationId) {
                actorIds.push(await requirePracticeScheduler(
                    existingSession.teamId,
                    existingSession.venueReservationId,
                ));
            }
            if (selectedReservationId) {
                actorIds.push(await requirePracticeScheduler(
                    existingSession.teamId,
                    selectedReservationId,
                ));
            }
            if (createsDirectReservation) {
                actorIds.push(await requireTeamAdmin(existingSession.teamId));
            }
            userId = actorIds[actorIds.length - 1]
                ?? await requireTeamAdmin(existingSession.teamId);
        }

        if (validated.plays && validated.plays.length > 0) {
            const sequenceValidation = validatePlaySequence(validated.plays);
            if (!sequenceValidation.valid) {
                return {
                    success: false,
                    error: sequenceValidation.error || "Invalid play sequence",
                };
            }

            const durationValidation = validateTotalDuration(validated.duration, validated.plays);
            if (!durationValidation.valid) {
                return {
                    success: false,
                    error: durationValidation.error || "Invalid total duration",
                };
            }

            const playIds = validated.plays.map(p => p.playId);
            const plays = await prisma.play.findMany({
                where: {
                    id: { in: playIds },
                    teamId: validated.teamId,
                },
                select: { id: true },
            });

            if (plays.length !== playIds.length) {
                return {
                    success: false,
                    error: "One or more plays not found or do not belong to this team",
                };
            }
        }

        if (
            !selectedReservationId
            && requestedAttachment.venueId
            && validated.overrideConflicts
            && !parsedReservation.overrideReason
        ) {
            return {
                success: false,
                error: "Explain why this venue conflict should be overridden.",
            };
        }

        const session = await runVenueReservationTransaction(async (tx) => {
            const current = await tx.practiceSession.findUnique({
                where: { id: validated.id },
                select: {
                    id: true,
                    teamId: true,
                    venueReservationId: true,
                },
            });
            if (!current || current.teamId !== validated.teamId) {
                throw new VenueReservationLifecycleError(
                    "Practice session not found.",
                );
            }
            if (!reservationRelationChanged) {
                if (
                    current.venueReservationId
                    !== existingSession.venueReservationId
                ) {
                    throw new VenueReservationLifecycleError(
                        "The practice reservation changed while the update was in progress.",
                    );
                }
                await assertExactTeamAdminInTransaction(tx, {
                    teamId: current.teamId,
                    actorId: userId,
                });
            } else if (current.venueReservationId) {
                await assertPracticeReservationActorInTransaction(tx, {
                    reservationId: current.venueReservationId,
                    teamId: current.teamId,
                    actorId: userId,
                });
            }
            if (createsDirectReservation) {
                await assertExactTeamAdminInTransaction(tx, {
                    teamId: current.teamId,
                    actorId: userId,
                });
            }

            const oldEvent = current.venueReservationId
                ? await tx.event.findUnique({
                    where: { venueReservationId: current.venueReservationId },
                    select: { id: true },
                })
                : null;

            let reservation: ConfirmedPracticeReservation | null = null;
            if (selectedReservationId) {
                reservation = await loadConfirmedPracticeReservation(
                    tx,
                    selectedReservationId,
                    validated.teamId,
                    validated.date,
                    validated.duration,
                );
                if (reservationRelationChanged) {
                    await assertPracticeReservationActorInTransaction(tx, {
                        reservationId: reservation.id,
                        teamId: validated.teamId,
                        actorId: userId,
                    });
                }
            } else if (requestedAttachment.venueId && requestedAttachment.startAt) {
                const venue = await tx.venue.findUnique({
                    where: { id: requestedAttachment.venueId },
                    select: { name: true, timezone: true },
                });
                if (!venue) {
                    throw new VenueReservationLifecycleError(
                        "Venue not found or unavailable.",
                    );
                }
                const created = await createVenueReservation(tx, {
                    venueId: requestedAttachment.venueId,
                    surfaceId: requestedAttachment.surfaceId,
                    segmentId: requestedAttachment.segmentId,
                    startsAt: requestedAttachment.startAt,
                    endsAt: new Date(
                        requestedAttachment.startAt.getTime()
                            + validated.duration * 60_000,
                    ),
                    timezone: venue.timezone,
                    ownerTeamId: validated.teamId,
                    actorId: userId,
                    status: "CONFIRMED",
                    overrideConflicts: validated.overrideConflicts,
                    overrideReason: parsedReservation.overrideReason,
                });
                reservation = {
                    ...created,
                    startsAt: requestedAttachment.startAt,
                    endsAt: new Date(
                        requestedAttachment.startAt.getTime()
                            + validated.duration * 60_000,
                    ),
                    timezone: venue.timezone,
                    venueId: requestedAttachment.venueId,
                    surfaceId: requestedAttachment.surfaceId,
                    segmentId: requestedAttachment.segmentId,
                    ownerTeamId: validated.teamId,
                    ownerLeagueId: null,
                    ownerVenueOrganizationId: null,
                    venue,
                };
            }

            if (
                current.venueReservationId
                && current.venueReservationId !== reservation?.id
            ) {
                if (oldEvent) {
                    await tx.event.update({
                        where: { id: oldEvent.id },
                        data: { venueReservationId: null },
                    });
                }
                await tx.practiceSession.update({
                    where: { id: current.id },
                    data: { venueReservationId: null },
                });
            }

            await tx.practiceSessionPlay.deleteMany({
                where: { sessionId: validated.id },
            });

            const canonical = reservation
                ? practiceDataFromReservation(reservation)
                : requestedAttachment;
            const updated = await tx.practiceSession.update({
                where: { id: validated.id },
                data: {
                    title: validated.title,
                    date: reservation ? reservation.startsAt : validated.date,
                    duration: reservation
                        ? Math.round(
                            (
                                reservation.endsAt.getTime()
                                - reservation.startsAt.getTime()
                            ) / 60_000,
                        )
                        : validated.duration,
                    venueId: canonical.venueId,
                    surfaceId: canonical.surfaceId,
                    segmentId: canonical.segmentId,
                    startAt: canonical.startAt,
                    conflictOverriddenById: parsedReservation.overrideReason
                        ? userId
                        : null,
                    conflictOverriddenAt: parsedReservation.overrideReason
                        ? new Date()
                        : null,
                    plays: validated.plays.length > 0 ? {
                        create: validated.plays.map(play => ({
                            playId: play.playId,
                            sequence: play.sequence,
                            duration: play.duration,
                            instructions: play.instructions ? sanitizeText(play.instructions, 2000) : null,
                        })),
                    } : undefined,
                },
                select: {
                    id: true,
                    title: true,
                    date: true,
                },
            });

            if (!reservation) {
                if (oldEvent) {
                    await tx.event.delete({ where: { id: oldEvent.id } });
                }
                return updated;
            }

            if (reservationRelationChanged) {
                await assignVenueReservation(tx, {
                    reservationId: reservation.id,
                    targetType: "PRACTICE",
                    targetId: updated.id,
                    actorId: userId,
                    overrideConflicts: validated.overrideConflicts,
                    overrideReason: parsedReservation.overrideReason,
                });
            }
            await createPracticeEventAndRsvps(tx, {
                eventId: oldEvent?.id,
                title: validated.title,
                teamId: validated.teamId,
                reservation,
                actorId: userId,
                overrideConflicts: validated.overrideConflicts,
                overrideReason: parsedReservation.overrideReason,
                assignEventReservation:
                    reservationRelationChanged || !oldEvent,
            });
            return updated;
        });

        revalidatePath("/practice-planner");
        revalidatePath(`/practice-planner/${validated.id}`);
        revalidatePath("/calendar");

        // Send update notifications if session is shared (Requirements: 6.3)
        if (existingSession.isShared) {
            const { sendPracticePlanNotifications } = await import("@/lib/email/templates");

            sendPracticePlanNotifications(validated.id, validated.teamId, "updated").catch((error) => {
                console.error("Failed to send practice plan update notification emails:", error);
            });
        }

        return {
            success: true,
            data: {
                ...session,
                conflictsOverridden: Boolean(parsedReservation.overrideReason),
            },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (
            error instanceof VenueReservationConflictError
            || error instanceof VenueReservationLifecycleError
        ) {
            return {
                success: false,
                error: error.message,
                ...(
                    error instanceof VenueReservationConflictError
                        ? { details: { conflicts: error.conflicts } }
                        : {}
                ),
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error updating practice session:", error);
        return {
            success: false,
            error: "Failed to update practice session. Please try again.",
        };
    }
}

/**
 * Delete a practice session
 * Only ADMIN role can delete sessions
 * Requirements: 2.1
 */
export async function deletePracticeSession(
    input: DeletePracticeSessionInput
): Promise<ActionResult<{ id: string }>> {
    try {
        // Validate input
        const validated = deletePracticeSessionSchema.parse(input);

        // First fetch the existing session to get its actual teamId for authorization
        const existingSession = await prisma.practiceSession.findUnique({
            where: { id: validated.id },
            select: { teamId: true, venueReservationId: true },
        });

        if (!existingSession) {
            return {
                success: false,
                error: "Practice session not found",
            };
        }

        // Verify the teamId in the request matches the session's actual teamId
        if (existingSession.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Practice session does not belong to this team",
            };
        }

        const actorId = await requirePracticeScheduler(
            existingSession.teamId,
            existingSession.venueReservationId,
        );

        await runVenueReservationTransaction(async (tx) => {
            const practice = await tx.practiceSession.findUnique({
                where: { id: validated.id },
                select: {
                    id: true,
                    teamId: true,
                    venueReservationId: true,
                },
            });
            if (!practice || practice.teamId !== validated.teamId) {
                throw new VenueReservationLifecycleError(
                    "Practice session not found.",
                );
            }
            if (practice.venueReservationId) {
                await assertPracticeReservationActorInTransaction(tx, {
                    reservationId: practice.venueReservationId,
                    teamId: practice.teamId,
                    actorId,
                });
                const participantEvent = await tx.event.findUnique({
                    where: {
                        venueReservationId: practice.venueReservationId,
                    },
                    select: { id: true, type: true, teamId: true },
                });
                if (
                    participantEvent?.type === "PRACTICE"
                    && participantEvent.teamId === practice.teamId
                ) {
                    // Event deletion cascades its participant RSVP rows.
                    await tx.event.delete({
                        where: { id: participantEvent.id },
                    });
                }
            }
            // The confirmed reservation remains valid, unassigned inventory.
            await tx.practiceSession.delete({
                where: { id: practice.id },
            });
        });

        // Revalidate practice planner pages
        revalidatePath("/practice-planner");
        revalidatePath("/calendar");

        return {
            success: true,
            data: { id: validated.id },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error deleting practice session:", error);
        return {
            success: false,
            error: "Failed to delete practice session. Please try again.",
        };
    }
}

/**
 * Get a practice session by ID
 * Team members can view sessions
 * Requirements: 2.1, 2.2
 */
export async function getPracticeSessionById(input: GetPracticeSessionByIdInput): Promise<ActionResult<{
    id: string;
    title: string;
    date: Date;
    duration: number;
    isShared: boolean;
    createdAt: Date;
    updatedAt: Date;
    // Optional venue attachment (FR-019, feature 006)
    venueId: string | null;
    venueName: string | null;
    surfaceId: string | null;
    surfaceName: string | null;
    segmentId: string | null;
    segmentName: string | null;
    startAt: Date | null;
    plays: Array<{
        id: string;
        sequence: number;
        duration: number;
        instructions: string | null;
        play: {
            id: string;
            name: string;
            description: string | null;
            thumbnail: string | null;
            playData: PlayData;
        };
    }>;
}>> {
    try {
        // Validate input
        const validated = getPracticeSessionByIdSchema.parse(input);

        // Check authentication and authorization - team members can view sessions
        await requireTeamMember(validated.teamId);

        // Fetch session
        const session = await prisma.practiceSession.findUnique({
            where: { id: validated.id },
            select: {
                id: true,
                title: true,
                date: true,
                duration: true,
                isShared: true,
                teamId: true,
                createdAt: true,
                updatedAt: true,
                venueId: true,
                venue: { select: { name: true } },
                surfaceId: true,
                surface: { select: { name: true } },
                segmentId: true,
                segment: { select: { name: true } },
                startAt: true,
                plays: {
                    orderBy: { sequence: "asc" },
                    select: {
                        id: true,
                        sequence: true,
                        duration: true,
                        instructions: true,
                        play: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                thumbnail: true,
                                playData: true,
                            },
                        },
                    },
                },
            },
        });

        if (!session) {
            return {
                success: false,
                error: "Practice session not found",
            };
        }

        // Verify session belongs to the team
        if (session.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Practice session does not belong to this team",
            };
        }

        return {
            success: true,
            data: {
                id: session.id,
                title: session.title,
                date: session.date,
                duration: session.duration,
                isShared: session.isShared,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                venueId: session.venueId,
                venueName: session.venue?.name ?? null,
                surfaceId: session.surfaceId,
                surfaceName: session.surface?.name ?? null,
                segmentId: session.segmentId,
                segmentName: session.segment?.name ?? null,
                startAt: session.startAt,
                plays: session.plays.map(p => ({
                    id: p.id,
                    sequence: p.sequence,
                    duration: p.duration,
                    instructions: p.instructions,
                    play: {
                        id: p.play.id,
                        name: p.play.name,
                        description: p.play.description,
                        thumbnail: p.play.thumbnail,
                        playData: p.play.playData as unknown as PlayData,
                    },
                })),
            },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error fetching practice session:", error);
        return {
            success: false,
            error: "Failed to fetch practice session. Please try again.",
        };
    }
}

/**
 * Get practice sessions by team with optional filtering
 * Team members can view sessions
 * Requirements: 2.1
 */
export async function getPracticeSessionsByTeam(input: GetPracticeSessionsByTeamInput): Promise<ActionResult<{
    sessions: Array<{
        id: string;
        title: string;
        date: Date;
        duration: number;
        isShared: boolean;
        createdAt: Date;
        updatedAt: Date;
        _count: {
            plays: number;
        };
    }>;
    total: number;
    page: number;
    limit: number;
}>> {
    try {
        // Validate input
        const validated = getPracticeSessionsByTeamSchema.parse(input);

        // Check authentication and authorization - team members can view sessions
        await requireTeamMember(validated.teamId);

        // Build where clause with search and date filter support
        const where: Prisma.PracticeSessionWhereInput = {
            teamId: validated.teamId,
        };

        // Apply search filter (search by title)
        if (validated.search && validated.search.trim()) {
            const searchTerm = validated.search.trim();
            where.title = { contains: searchTerm, mode: "insensitive" };
        }

        // Apply date filter
        if (validated.dateFilter && validated.dateFilter !== "all") {
            const now = new Date();

            switch (validated.dateFilter) {
                case "upcoming":
                    where.date = { gte: now };
                    break;
                case "past":
                    where.date = { lt: now };
                    break;
            }
        }

        // Calculate pagination
        const skip = (validated.page - 1) * validated.limit;

        // Fetch sessions with pagination
        const [sessions, total] = await Promise.all([
            prisma.practiceSession.findMany({
                where,
                select: {
                    id: true,
                    title: true,
                    date: true,
                    duration: true,
                    isShared: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: {
                            plays: true,
                        },
                    },
                },
                orderBy: {
                    date: "desc",
                },
                skip,
                take: validated.limit,
            }),
            prisma.practiceSession.count({ where }),
        ]);

        return {
            success: true,
            data: {
                sessions,
                total,
                page: validated.page,
                limit: validated.limit,
            },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error fetching practice sessions:", error);
        return {
            success: false,
            error: "Failed to fetch practice sessions. Please try again.",
        };
    }
}

/**
 * Share or unshare a practice session
 * Only ADMIN role can share sessions
 * Triggers notification sending when sharing
 * Requirements: 3.1
 */
export async function sharePracticeSession(
    input: SharePracticeSessionInput
): Promise<ActionResult<{ id: string; isShared: boolean }>> {
    try {
        // Validate input
        const validated = sharePracticeSessionSchema.parse(input);

        // First fetch the existing session to get its actual teamId for authorization
        const existingSession = await prisma.practiceSession.findUnique({
            where: { id: validated.id },
            select: { teamId: true, isShared: true },
        });

        if (!existingSession) {
            return {
                success: false,
                error: "Practice session not found",
            };
        }

        // Authorize against the session's actual teamId - only ADMIN can share
        await requireTeamAdmin(existingSession.teamId);

        // Verify the teamId in the request matches the session's actual teamId
        if (existingSession.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Practice session does not belong to this team",
            };
        }

        // Update isShared flag
        const session = await prisma.practiceSession.update({
            where: { id: validated.id },
            data: {
                isShared: validated.isShared,
            },
            select: {
                id: true,
                isShared: true,
            },
        });

        // Revalidate practice planner pages
        revalidatePath("/practice-planner");
        revalidatePath(`/practice-planner/${validated.id}`);

        // Send notifications if sharing (not unsharing)
        if (validated.isShared && !existingSession.isShared) {
            // Import email templates dynamically to avoid circular dependencies
            const { sendPracticePlanNotifications } = await import("@/lib/email/templates");

            // Send notifications asynchronously (don't block response)
            sendPracticePlanNotifications(validated.id, validated.teamId, "shared").catch((error) => {
                console.error("Failed to send practice plan notification emails:", error);
            });
        }

        return {
            success: true,
            data: session,
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error sharing practice session:", error);
        return {
            success: false,
            error: "Failed to share practice session. Please try again.",
        };
    }
}
