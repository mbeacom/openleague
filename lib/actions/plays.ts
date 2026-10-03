"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireTeamMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { detachLibraryPlay } from "@/lib/services/practice-session-drills";
import {
    createPlaySchema,
    updatePlaySchema,
    deletePlaySchema,
    getPlayByIdSchema,
    getPlaysByTeamSchema,
    type CreatePlayInput,
    type UpdatePlayInput,
    type DeletePlayInput,
    type GetPlayByIdInput,
    type GetPlaysByTeamInput,
} from "@/lib/utils/validation";
import { VALIDATION_CONSTRAINTS, type PlayData } from "@/types/practice-planner";
import {
    PLAY_DATA_UNREADABLE_CODE,
    PLAY_DATA_UNREADABLE_MESSAGE,
    parseStoredPlayData,
    playDataSchema,
} from "@/lib/utils/play-data";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

/**
 * Sanitize text input by removing control characters and trimming
 * Requirements: 1.5
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
 * Sanitize PlayData by sanitizing all text annotations and player labels
 * Requirements: 1.5
 */
function sanitizePlayData(playData: PlayData): PlayData {
    return {
        ...playData,
        players: playData.players.map(player => ({
            ...player,
            label: sanitizeText(player.label, VALIDATION_CONSTRAINTS.MAX_PLAYER_LABEL_LENGTH),
        })),
        annotations: playData.annotations.map(annotation => ({
            ...annotation,
            text: sanitizeText(annotation.text, VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH),
        })),
    };
}

/**
 * Sanitizes PlayData, then re-validates the result: sanitizing can empty a
 * field the schema checked as non-blank (e.g. annotation text "\u0001"), and
 * storing that would leave a play the strict read path rejects. Rejecting
 * (rather than silently dropping the element) keeps the action a single,
 * predictable rule: what is stored always passes the schema.
 */
function sanitizeAndRevalidate(
    playData: PlayData
): { ok: true; data: PlayData } | { ok: false; result: { success: false; error: string; details: unknown } } {
    const sanitized = sanitizePlayData(playData);
    const check = playDataSchema.safeParse(sanitized);
    if (!check.success) {
        return { ok: false, result: { success: false, error: "Invalid play data", details: check.error.issues } };
    }
    return { ok: true, data: sanitized };
}

/** NO ACTION FK on practice_session_plays.playId: a session referenced the play mid-write. */
function isStillReferenced(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/**
 * Create a new play
 * Only ADMIN role can create plays
 * Requirements: 1.5, 4.1
 */
export async function createPlay(
    input: CreatePlayInput
): Promise<ActionResult<{ id: string; name: string; isTemplate: boolean }>> {
    try {
        // Validate input
        const validated = createPlaySchema.parse(input);

        // Check authentication and authorization - only ADMIN can create plays
        const userId = await requireTeamAdmin(validated.teamId);

        // Note: name and description are already sanitized by Zod schema
        // (sanitizedStringWithMin and optionalSanitizedString)

        // Sanitize PlayData, then confirm it still passes the schema
        const sanitizedResult = sanitizeAndRevalidate(validated.playData);
        if (!sanitizedResult.ok) return sanitizedResult.result;
        const sanitizedPlayData = sanitizedResult.data;

        // Create play
        const play = await prisma.play.create({
            data: {
                name: validated.name,
                description: validated.description || null,
                thumbnail: validated.thumbnail || null,
                playData: sanitizedPlayData as unknown as Prisma.InputJsonValue,
                isTemplate: validated.isTemplate,
                teamId: validated.teamId,
                createdById: userId,
            },
            select: {
                id: true,
                name: true,
                isTemplate: true,
            },
        });

        // Revalidate practice planner pages
        revalidatePath("/practice-planner");
        revalidatePath("/practice-planner/library");

        return {
            success: true,
            data: play,
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const isPlayData = error.issues.some((issue) => issue.path[0] === "playData");
            return {
                success: false,
                error: isPlayData ? "Invalid play data" : "Invalid input",
                details: error.issues,
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error creating play:", error);
        return {
            success: false,
            error: "Failed to create play. Please try again.",
        };
    }
}

/**
 * Update an existing play
 * Only ADMIN role can update plays
 * Requirements: 1.5, 4.1
 */
export async function updatePlay(
    input: UpdatePlayInput
): Promise<ActionResult<{ id: string; name: string; isTemplate: boolean }>> {
    try {
        // Validate input
        const validated = updatePlaySchema.parse(input);

        // First fetch the existing play to get its actual teamId for authorization
        // This prevents authorization bypass by providing a different teamId
        const existingPlay = await prisma.play.findUnique({
            where: { id: validated.id },
            select: { teamId: true, sessionId: true, isTemplate: true },
        });

        if (!existingPlay) {
            return {
                success: false,
                error: "Play not found",
            };
        }

        // Authorize against the play's actual teamId, not user-provided input
        const userId = await requireTeamAdmin(existingPlay.teamId);

        // Verify the teamId in the request matches the play's actual teamId
        if (existingPlay.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Play does not belong to this team",
            };
        }

        // A session's private copy is edited from its session (SessionDrillDialog),
        // never from the library editor, which would also let it become a template.
        if (existingPlay.sessionId) {
            return {
                success: false,
                error: "This drill belongs to a practice session. Edit it from that session.",
            };
        }

        // Note: name and description are already sanitized by Zod schema

        // Sanitize PlayData, then confirm it still passes the schema
        const sanitizedResult = sanitizeAndRevalidate(validated.playData);
        if (!sanitizedResult.ok) return sanitizedResult.result;
        const sanitizedPlayData = sanitizedResult.data;

        // Detach-on-write: sessions still pointing at this library row keep
        // the version they were planned with.
        const play = await prisma.$transaction(async (tx) => {
            if (existingPlay.isTemplate) {
                await detachLibraryPlay(tx, { playId: validated.id, teamId: existingPlay.teamId, userId });
            }
            return tx.play.update({
                where: { id: validated.id },
                data: {
                    name: validated.name,
                    description: validated.description || null,
                    thumbnail: validated.thumbnail || null,
                    playData: sanitizedPlayData as unknown as Prisma.InputJsonValue,
                    ...(validated.isTemplate !== undefined && { isTemplate: validated.isTemplate }),
                },
                select: {
                    id: true,
                    name: true,
                    isTemplate: true,
                },
            });
        });

        // Revalidate practice planner pages
        revalidatePath("/practice-planner");
        revalidatePath("/practice-planner/library");

        return {
            success: true,
            data: play,
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const isPlayData = error.issues.some((issue) => issue.path[0] === "playData");
            return {
                success: false,
                error: isPlayData ? "Invalid play data" : "Invalid input",
                details: error.issues,
            };
        }

        if (isStillReferenced(error)) {
            return { success: false, error: "This drill is still used by a session" };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error updating play:", error);
        return {
            success: false,
            error: "Failed to update play. Please try again.",
        };
    }
}

/**
 * Delete a play from the library.
 * Only ADMIN role can delete plays.
 * Detach-on-write: every session that still references the play first gets
 * its own copy (one per session) and is repointed to it; then the library
 * row is really deleted, all in one transaction. PracticeSessionPlay.play is
 * ON DELETE NO ACTION, so a reference that appears mid-transaction fails the
 * delete (P2003) instead of removing the drill from that session.
 */
export async function deletePlay(
    input: DeletePlayInput
): Promise<ActionResult<{ id: string; detachedSessions: number }>> {
    try {
        const validated = deletePlaySchema.parse(input);

        // Fetch the play first to authorize against its actual teamId
        const existingPlay = await prisma.play.findUnique({
            where: { id: validated.id },
            select: { teamId: true, sessionId: true, isTemplate: true },
        });

        if (!existingPlay) {
            return {
                success: false,
                error: "Play not found",
            };
        }

        // Authorize against the play's actual teamId, not user-provided input
        const userId = await requireTeamAdmin(existingPlay.teamId);

        if (existingPlay.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Play does not belong to this team",
            };
        }

        const isLibraryPlay = existingPlay.isTemplate && existingPlay.sessionId === null;
        const detachedSessions = await prisma.$transaction(async (tx) => {
            const detached = isLibraryPlay
                ? await detachLibraryPlay(tx, {
                    playId: validated.id,
                    teamId: existingPlay.teamId,
                    userId,
                })
                : 0;
            await tx.play.delete({ where: { id: validated.id } });
            return detached;
        });

        revalidatePath("/practice-planner");
        revalidatePath("/practice-planner/library");

        return {
            success: true,
            data: { id: validated.id, detachedSessions },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (isStillReferenced(error)) {
            return {
                success: false,
                error: "This drill is still used by a session",
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error deleting play:", error);
        return {
            success: false,
            error: "Failed to delete play. Please try again.",
        };
    }
}

/**
 * Get a play by ID
 * Team members can view plays
 * Requirements: 4.1
 */
export async function getPlayById(input: GetPlayByIdInput): Promise<ActionResult<{
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: PlayData;
    isTemplate: boolean;
    createdAt: Date;
    updatedAt: Date;
}>> {
    try {
        // Validate input
        const validated = getPlayByIdSchema.parse(input);

        // Check authentication and authorization - team members can view plays
        await requireTeamMember(validated.teamId);

        // Fetch play
        const play = await prisma.play.findUnique({
            where: { id: validated.id },
            select: {
                id: true,
                name: true,
                description: true,
                thumbnail: true,
                playData: true,
                isTemplate: true,
                teamId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!play) {
            return {
                success: false,
                error: "Play not found",
            };
        }

        // Verify play belongs to the team
        if (play.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Play does not belong to this team",
            };
        }

        const parsed = parseStoredPlayData(play.playData);
        if (!parsed.ok) {
            console.error(`Unreadable playData for play ${play.id}:`, parsed.error);
            return {
                success: false,
                error: PLAY_DATA_UNREADABLE_MESSAGE,
                details: { code: PLAY_DATA_UNREADABLE_CODE },
            };
        }

        return {
            success: true,
            data: {
                id: play.id,
                name: play.name,
                description: play.description,
                thumbnail: play.thumbnail,
                playData: parsed.data,
                isTemplate: play.isTemplate,
                createdAt: play.createdAt,
                updatedAt: play.updatedAt,
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

        console.error("Error fetching play:", error);
        return {
            success: false,
            error: "Failed to fetch play. Please try again.",
        };
    }
}

/**
 * Get plays by team with optional filtering
 * Team members can view plays
 * Requirements: 4.1, 4.2, 8.4
 */
export async function getPlaysByTeam(input: GetPlaysByTeamInput): Promise<ActionResult<{
    plays: Array<{
        id: string;
        name: string;
        description: string | null;
        thumbnail: string | null;
        isTemplate: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
}>> {
    try {
        // Validate input
        const validated = getPlaysByTeamSchema.parse(input);

        // Check authentication and authorization - team members can view plays
        await requireTeamMember(validated.teamId);

        // Build where clause with search and date filter support
        // Requirements: 8.4 - Server-side search and date filtering
        const where: Prisma.PlayWhereInput = {
            teamId: validated.teamId,
            // Session-owned copies never appear in any listing.
            sessionId: null,
        };

        if (validated.isTemplate !== undefined) {
            where.isTemplate = validated.isTemplate;
        }

        // Apply search filter (search by name or description)
        if (validated.search && validated.search.trim()) {
            const searchTerm = validated.search.trim();
            where.OR = [
                { name: { contains: searchTerm, mode: "insensitive" } },
                { description: { contains: searchTerm, mode: "insensitive" } },
            ];
        }

        // Apply date filter
        if (validated.dateFilter && validated.dateFilter !== "all") {
            const now = new Date();
            let startDate: Date;

            switch (validated.dateFilter) {
                case "today":
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case "week":
                    // Start of current week (Sunday)
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - now.getDay());
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case "month":
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                default:
                    startDate = new Date(0); // All time
            }

            where.createdAt = { gte: startDate };
        }

        // Calculate pagination
        const skip = (validated.page - 1) * validated.limit;

        // Fetch plays with pagination
        const [plays, total] = await Promise.all([
            prisma.play.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    thumbnail: true,
                    isTemplate: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
                skip,
                take: validated.limit,
            }),
            prisma.play.count({ where }),
        ]);

        return {
            success: true,
            data: {
                plays,
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

        console.error("Error fetching plays:", error);
        return {
            success: false,
            error: "Failed to fetch plays. Please try again.",
        };
    }
}
