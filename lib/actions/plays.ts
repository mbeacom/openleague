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
import { drillTags } from "@/lib/utils/drill-tags";
import { toAgeGroups, type AgeGroup } from "@/lib/utils/age-groups";
import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import {
    PLAY_DATA_UNREADABLE_CODE,
    PLAY_DATA_UNREADABLE_MESSAGE,
    parseStoredPlayData,
    sanitizePlayDataForWrite,
} from "@/lib/utils/play-data";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

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
    const result = sanitizePlayDataForWrite(playData);
    if (!result.ok) {
        return { ok: false, result: { success: false, error: "Invalid play data", details: result.issues } };
    }
    return { ok: true, data: result.data };
}

/**
 * NO ACTION FK on practice_session_plays.playId: a session referenced the play
 * mid-write. The FK is DEFERRABLE INITIALLY DEFERRED, so inside an interactive
 * $transaction it fails at COMMIT, and Prisma rethrows the driver adapter's raw
 * DriverAdapterError (cause.kind "ForeignKeyConstraintViolation", SQLSTATE
 * 23503) instead of a P2003. Both shapes mean the same thing here.
 */
function isStillReferenced(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2003";
    return (
        error instanceof Error &&
        error.name === "DriverAdapterError" &&
        (error.cause as { kind?: unknown } | undefined)?.kind === "ForeignKeyConstraintViolation"
    );
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
                focus: validated.focus,
                goalies: validated.goalies,
                ageGroups: validated.ageGroups,
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
            select: { teamId: true, sessionId: true },
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

        // Detach-on-write: sessions still pointing at this unowned row (a
        // library drill, or a legacy pre-3a non-template play) keep the
        // version they were planned with. Owned plays were rejected above.
        const play = await prisma.$transaction(async (tx) => {
            await detachLibraryPlay(tx, { playId: validated.id, teamId: existingPlay.teamId, userId });
            return tx.play.update({
                where: { id: validated.id },
                data: {
                    name: validated.name,
                    description: validated.description || null,
                    thumbnail: validated.thumbnail || null,
                    playData: sanitizedPlayData as unknown as Prisma.InputJsonValue,
                    ...(validated.isTemplate !== undefined && { isTemplate: validated.isTemplate }),
                    ...(validated.focus !== undefined && { focus: validated.focus }),
                    ...(validated.goalies !== undefined && { goalies: validated.goalies }),
                    ...(validated.ageGroups !== undefined && { ageGroups: validated.ageGroups }),
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
            select: { teamId: true, sessionId: true },
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

        // A session's private copy is removed from its session (orphan
        // cleanup deletes it), never from the library.
        if (existingPlay.sessionId !== null) {
            return {
                success: false,
                error: "This drill belongs to a practice session. Remove it from that session.",
            };
        }

        // Any unowned play is detached: a library drill, or a legacy pre-3a
        // non-template play a session still references.
        const detachedSessions = await prisma.$transaction(async (tx) => {
            const detached = await detachLibraryPlay(tx, {
                playId: validated.id,
                teamId: existingPlay.teamId,
                userId,
            });
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
    focus: PlayFocus;
    goalies: PlayGoalies;
    ageGroups: AgeGroup[];
    createdAt: Date;
    updatedAt: Date;
}>> {
    try {
        // Validate input
        const validated = getPlayByIdSchema.parse(input);

        // Check authentication and authorization - team members can view plays
        await requireTeamMember(validated.teamId);

        // Fetch play. Only library and unowned plays: a session-owned copy is
        // read through its session (getPracticeSessionForEdit), never by id.
        const play = await prisma.play.findUnique({
            where: { id: validated.id, sessionId: null },
            select: {
                id: true,
                name: true,
                description: true,
                thumbnail: true,
                playData: true,
                isTemplate: true,
                focus: true,
                goalies: true,
                ageGroups: true,
                teamId: true,
                sessionId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!play || play.sessionId != null) {
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
                ...drillTags(play),
                ageGroups: toAgeGroups(play.ageGroups),
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
        focus: PlayFocus;
        goalies: PlayGoalies;
        ageGroups: AgeGroup[];
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

        // Drill-tag filters (spec R8). Applied in the database, so total and pages stay exact.
        if (validated.focus) where.focus = validated.focus;
        if (validated.goalies) where.goalies = validated.goalies;

        // Age filter (age-group templates R3): an untagged drill suits every age.
        // AND, not OR: the search below already owns where.OR.
        if (validated.ageGroup) {
            where.AND = [{ OR: [{ ageGroups: { isEmpty: true } }, { ageGroups: { has: validated.ageGroup } }] }];
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
                    focus: true,
                    goalies: true,
                    ageGroups: true,
                    createdAt: true,
                    updatedAt: true,
                },
                // id breaks createdAt ties, so offset pages never skip or repeat a drill
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip,
                take: validated.limit,
            }),
            prisma.play.count({ where }),
        ]);

        return {
            success: true,
            data: {
                plays: plays.map((play) => ({ ...play, ...drillTags(play), ageGroups: toAgeGroups(play.ageGroups) })),
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
