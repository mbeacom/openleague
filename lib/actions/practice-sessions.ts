"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireTeamMember } from "@/lib/auth/session";
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
import { findBookingConflicts } from "@/lib/utils/availability";
import type { BookingConflict } from "@/types/segments";
import type { PlayData } from "@/types/practice-planner";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

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
 * Verify attachment references: the venue exists, the surface is active and
 * belongs to the venue, and the segment is active and belongs to the surface
 * (same checks as season-games, 006 FR). Returns an error message or null.
 */
async function validatePracticeAttachment(
    attachment: PracticeAttachment
): Promise<string | null> {
    const { venueId, surfaceId, segmentId } = attachment;
    if (!venueId) return null;

    const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { id: true },
    });
    if (!venue) {
        return "Venue not found";
    }

    if (surfaceId) {
        const surface = await prisma.iceSurface.findFirst({
            where: { id: surfaceId, venueId, isActive: true },
            select: { id: true },
        });
        if (!surface) {
            return "Select an active surface at the chosen venue";
        }
    }

    if (segmentId) {
        if (!surfaceId) {
            return "Pick a surface before choosing a segment";
        }
        const segment = await prisma.surfaceSegment.findFirst({
            where: { id: segmentId, surfaceId, isActive: true },
            select: { id: true },
        });
        if (!segment) {
            return "Select an active segment on the chosen surface";
        }
    }

    return null;
}

function practiceConflictFailure(conflicts: BookingConflict[]): {
    success: false;
    error: string;
    details: { conflicts: BookingConflict[] };
} {
    return {
        success: false,
        error: `This time overlaps ${conflicts.length} existing booking${conflicts.length > 1 ? "s" : ""} at the venue`,
        details: { conflicts },
    };
}

/**
 * Run the unified availability check for an attached practice (FR-019).
 * Returns the conflicts found; the caller decides warn-vs-proceed based on
 * overrideConflicts. Unattached practices (no venue/startAt) never conflict.
 */
async function findPracticeConflicts(
    attachment: PracticeAttachment,
    duration: number,
    excludePracticeId?: string
): Promise<BookingConflict[]> {
    if (!attachment.venueId || !attachment.startAt) return [];
    const endAt = new Date(attachment.startAt.getTime() + duration * 60_000);
    return findBookingConflicts({
        venueId: attachment.venueId,
        surfaceId: attachment.surfaceId,
        segmentId: attachment.segmentId,
        startAt: attachment.startAt,
        endAt,
        excludePracticeId,
    });
}

/**
 * Create a new practice session
 * Only ADMIN role can create sessions
 * Requirements: 2.1, 2.2, 2.5
 */
export async function createPracticeSession(
    input: CreatePracticeSessionInput
): Promise<ActionResult<{ id: string; title: string; date: Date; conflictsOverridden: boolean }>> {
    try {
        // Validate input
        const validated = createPracticeSessionSchema.parse(input);

        // Check authentication and authorization - only ADMIN can create sessions
        const userId = await requireTeamAdmin(validated.teamId);

        // Optional venue attachment (FR-019, feature 006)
        const attachment = normalizePracticeAttachment(validated);
        const attachmentError = await validatePracticeAttachment(attachment);
        if (attachmentError) {
            return { success: false, error: attachmentError };
        }

        // Validate play sequence integrity
        if (validated.plays && validated.plays.length > 0) {
            const sequenceValidation = validatePlaySequence(validated.plays);
            if (!sequenceValidation.valid) {
                return {
                    success: false,
                    error: sequenceValidation.error || "Invalid play sequence",
                };
            }

            // Validate total duration
            const durationValidation = validateTotalDuration(validated.duration, validated.plays);
            if (!durationValidation.valid) {
                return {
                    success: false,
                    error: durationValidation.error || "Invalid total duration",
                };
            }

            // Verify all plays exist and belong to the team
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

        // Venue availability (FR-019): warn on conflicts and require an
        // explicit override to proceed. PracticeSession has no
        // conflictOverriddenBy/At columns (unlike SeasonGame/EventGame), so
        // the override is applied without being recorded on the row.
        const conflicts = await findPracticeConflicts(attachment, validated.duration);
        if (conflicts.length > 0 && !validated.overrideConflicts) {
            return practiceConflictFailure(conflicts);
        }
        const conflictsOverridden = conflicts.length > 0;

        // Create practice session with plays
        const session = await prisma.practiceSession.create({
            data: {
                title: validated.title,
                date: validated.date,
                duration: validated.duration,
                isShared: false,
                teamId: validated.teamId,
                createdById: userId,
                venueId: attachment.venueId,
                surfaceId: attachment.surfaceId,
                segmentId: attachment.segmentId,
                startAt: attachment.startAt,
                plays: validated.plays && validated.plays.length > 0 ? {
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

        // Revalidate practice planner pages
        revalidatePath("/practice-planner");

        return {
            success: true,
            data: { ...session, conflictsOverridden },
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
    input: UpdatePracticeSessionInput
): Promise<ActionResult<{ id: string; title: string; date: Date; conflictsOverridden: boolean }>> {
    try {
        // Validate input
        const validated = updatePracticeSessionSchema.parse(input);

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

        // Authorize against the session's actual teamId
        await requireTeamAdmin(existingSession.teamId);

        // Verify the teamId in the request matches the session's actual teamId
        if (existingSession.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Practice session does not belong to this team",
            };
        }

        // Optional venue attachment (FR-019, feature 006). The editor submits
        // the full session state, so the attachment is replaced wholesale:
        // omitting/clearing venueId detaches the practice (clears surface,
        // segment, and startAt — no availability footprint).
        const attachment = normalizePracticeAttachment(validated);
        const attachmentError = await validatePracticeAttachment(attachment);
        if (attachmentError) {
            return { success: false, error: attachmentError };
        }

        // Venue availability (FR-019): warn on conflicts and require an
        // explicit override to proceed, excluding this practice's own slot.
        // PracticeSession has no conflictOverriddenBy/At columns (unlike
        // SeasonGame/EventGame), so the override is applied without being
        // recorded on the row.
        const conflicts = await findPracticeConflicts(
            attachment,
            validated.duration,
            validated.id
        );
        if (conflicts.length > 0 && !validated.overrideConflicts) {
            return practiceConflictFailure(conflicts);
        }
        const conflictsOverridden = conflicts.length > 0;

        // Validate play sequence integrity
        if (validated.plays && validated.plays.length > 0) {
            const sequenceValidation = validatePlaySequence(validated.plays);
            if (!sequenceValidation.valid) {
                return {
                    success: false,
                    error: sequenceValidation.error || "Invalid play sequence",
                };
            }

            // Validate total duration
            const durationValidation = validateTotalDuration(validated.duration, validated.plays);
            if (!durationValidation.valid) {
                return {
                    success: false,
                    error: durationValidation.error || "Invalid total duration",
                };
            }

            // Verify all plays exist and belong to the team
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

        // Update session - delete existing plays and recreate
        const session = await prisma.$transaction(async (tx) => {
            // Delete existing plays
            await tx.practiceSessionPlay.deleteMany({
                where: { sessionId: validated.id },
            });

            // Update session with new plays
            return await tx.practiceSession.update({
                where: { id: validated.id },
                data: {
                    title: validated.title,
                    date: validated.date,
                    duration: validated.duration,
                    venueId: attachment.venueId,
                    surfaceId: attachment.surfaceId,
                    segmentId: attachment.segmentId,
                    startAt: attachment.startAt,
                    plays: validated.plays && validated.plays.length > 0 ? {
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
        });

        // Revalidate practice planner pages
        revalidatePath("/practice-planner");
        revalidatePath(`/practice-planner/${validated.id}`);

        // Send update notifications if session is shared (Requirements: 6.3)
        if (existingSession.isShared) {
            const { sendPracticePlanNotifications } = await import("@/lib/email/templates");

            sendPracticePlanNotifications(validated.id, validated.teamId, "updated").catch((error) => {
                console.error("Failed to send practice plan update notification emails:", error);
            });
        }

        return {
            success: true,
            data: { ...session, conflictsOverridden },
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
            select: { teamId: true },
        });

        if (!existingSession) {
            return {
                success: false,
                error: "Practice session not found",
            };
        }

        // Authorize against the session's actual teamId
        await requireTeamAdmin(existingSession.teamId);

        // Verify the teamId in the request matches the session's actual teamId
        if (existingSession.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Practice session does not belong to this team",
            };
        }

        // Delete session (cascade will remove associated PracticeSessionPlay records)
        await prisma.practiceSession.delete({
            where: { id: validated.id },
        });

        // Revalidate practice planner pages
        revalidatePath("/practice-planner");

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
