"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireTeamMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
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
import {
    validatePlayData,
    VALIDATION_CONSTRAINTS,
    type PlayData,
} from "@/types/practice-planner";

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
 * Maximum length for player labels
 */
const MAX_PLAYER_LABEL_LENGTH = 50;

/**
 * Sanitize PlayData by sanitizing all text annotations and player labels
 * Requirements: 1.5
 */
function sanitizePlayData(playData: PlayData): PlayData {
    return {
        ...playData,
        players: playData.players.map(player => ({
            ...player,
            label: sanitizeText(player.label, MAX_PLAYER_LABEL_LENGTH),
        })),
        annotations: playData.annotations.map(annotation => ({
            ...annotation,
            text: sanitizeText(annotation.text, VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH),
        })),
    };
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

        // Validate PlayData structure
        const playDataValidation = validatePlayData(validated.playData);
        if (!playDataValidation.valid) {
            return {
                success: false,
                error: "Invalid play data",
                details: playDataValidation.errors,
            };
        }

        // Sanitize PlayData
        const sanitizedPlayData = sanitizePlayData(validated.playData as PlayData);

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
        revalidatePath(`/dashboard/team/${validated.teamId}/practice-planner`);
        revalidatePath(`/dashboard/team/${validated.teamId}/practice-planner/library`);

        return {
            success: true,
            data: play,
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
            select: { teamId: true },
        });

        if (!existingPlay) {
            return {
                success: false,
                error: "Play not found",
            };
        }

        // Authorize against the play's actual teamId, not user-provided input
        await requireTeamAdmin(existingPlay.teamId);

        // Verify the teamId in the request matches the play's actual teamId
        if (existingPlay.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Play does not belong to this team",
            };
        }

        // Note: name and description are already sanitized by Zod schema

        // Validate PlayData structure
        const playDataValidation = validatePlayData(validated.playData);
        if (!playDataValidation.valid) {
            return {
                success: false,
                error: "Invalid play data",
                details: playDataValidation.errors,
            };
        }

        // Sanitize PlayData
        const sanitizedPlayData = sanitizePlayData(validated.playData as PlayData);

        // Update play
        const play = await prisma.play.update({
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

        // Revalidate practice planner pages
        revalidatePath(`/dashboard/team/${validated.teamId}/practice-planner`);
        revalidatePath(`/dashboard/team/${validated.teamId}/practice-planner/library`);

        return {
            success: true,
            data: play,
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

        console.error("Error updating play:", error);
        return {
            success: false,
            error: "Failed to update play. Please try again.",
        };
    }
}

/**
 * Delete a play from the library
 * Only ADMIN role can delete plays
 * Note: Cascade delete will also remove play instances from practice sessions (PracticeSessionPlay records)
 * Requirements: 4.5
 */
export async function deletePlay(
    input: DeletePlayInput
): Promise<ActionResult<{ id: string }>> {
    try {
        // Validate input
        const validated = deletePlaySchema.parse(input);

        // First fetch the existing play to get its actual teamId for authorization
        // This prevents authorization bypass by providing a different teamId
        const existingPlay = await prisma.play.findUnique({
            where: { id: validated.id },
            select: { teamId: true },
        });

        if (!existingPlay) {
            return {
                success: false,
                error: "Play not found",
            };
        }

        // Authorize against the play's actual teamId, not user-provided input
        await requireTeamAdmin(existingPlay.teamId);

        // Verify the teamId in the request matches the play's actual teamId
        if (existingPlay.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Play does not belong to this team",
            };
        }

        // Delete play (cascade will remove associated PracticeSessionPlay records)
        await prisma.play.delete({
            where: { id: validated.id },
        });

        // Revalidate practice planner pages
        revalidatePath(`/dashboard/team/${validated.teamId}/practice-planner`);
        revalidatePath(`/dashboard/team/${validated.teamId}/practice-planner/library`);

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

        return {
            success: true,
            data: {
                id: play.id,
                name: play.name,
                description: play.description,
                thumbnail: play.thumbnail,
                playData: play.playData as unknown as PlayData,
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
 * Requirements: 4.1, 4.2
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

        // Build where clause
        const where: {
            teamId: string;
            isTemplate?: boolean;
        } = {
            teamId: validated.teamId,
        };

        if (validated.isTemplate !== undefined) {
            where.isTemplate = validated.isTemplate;
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
