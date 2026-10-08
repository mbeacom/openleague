"use server";

/**
 * Practice planner favorites (practice favorites spec): per user. The user
 * always comes from the session, never the input, so a caller only ever
 * reads and writes their own rows. No revalidatePath: stars render from
 * client state (spec R5).
 */
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getUserTeamRole, requireUserId } from "@/lib/auth/session";
import type { PlannerFavoriteChange, PlannerFavoriteQuery } from "@/lib/planner-store/types";
import {
    FAVORITE_DRILL_NOT_FOUND,
    FAVORITE_PRACTICE_NOT_FOUND,
    PLANNER_FAVORITE_LOAD_FAILED,
    PLANNER_FAVORITE_SAVE_FAILED,
    isStarterDrillId,
    listPlannerFavoritesSchema,
    setPlannerFavoriteSchema,
} from "@/lib/utils/planner-favorites";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

/** Far more than anyone stars; bounds the read. */
const MAX_LISTED = 2000;

/** Ids of the signed-in user's favorites of one kind, newest first. */
export async function listPlannerFavorites(input: PlannerFavoriteQuery): Promise<ActionResult<string[]>> {
    const userId = await requireUserId();
    try {
        const { kind } = listPlannerFavoritesSchema.parse(input);
        const rows = await prisma.plannerFavorite.findMany({
            where: { userId, kind },
            select: { targetId: true },
            orderBy: { createdAt: "desc" },
            take: MAX_LISTED,
        });
        return { success: true, data: rows.map((row) => row.targetId) };
    } catch (error) {
        if (error instanceof z.ZodError) return { success: false, error: "Invalid input", details: error.issues };
        console.error("Error loading planner favorites:", error);
        return { success: false, error: PLANNER_FAVORITE_LOAD_FAILED };
    }
}

/** Whether the user may see the drill: a starter, or a library drill of one of their teams. */
async function canSeeDrill(userId: string, targetId: string): Promise<boolean> {
    if (isStarterDrillId(targetId)) return true;
    // Session-owned copies are never listed, so they can't be starred.
    const play = await prisma.play.findFirst({ where: { id: targetId, sessionId: null }, select: { teamId: true } });
    return Boolean(play && (await getUserTeamRole(userId, play.teamId)));
}

/** Whether the user may see the practice: admins see all of a team's practices, members only shared ones. */
async function canSeePractice(userId: string, targetId: string): Promise<boolean> {
    const session = await prisma.practiceSession.findUnique({ where: { id: targetId }, select: { teamId: true, isShared: true } });
    if (!session) return false;
    const role = await getUserTeamRole(userId, session.teamId);
    return role === "ADMIN" || (role === "MEMBER" && session.isShared);
}

/** Stars or unstars one drill or practice. Idempotent: it sets the state asked for. */
export async function setPlannerFavorite(input: PlannerFavoriteChange): Promise<ActionResult<PlannerFavoriteChange>> {
    const userId = await requireUserId();
    try {
        const { kind, targetId, favorite } = setPlannerFavoriteSchema.parse(input);

        if (!favorite) {
            // Only the caller's own row, so no visibility check: an orphan can always be removed.
            await prisma.plannerFavorite.deleteMany({ where: { userId, kind, targetId } });
            return { success: true, data: { kind, targetId, favorite } };
        }

        if (kind === "DRILL" ? !(await canSeeDrill(userId, targetId)) : !(await canSeePractice(userId, targetId))) {
            // The same answer as a missing target, so the action never reveals what exists.
            return { success: false, error: kind === "DRILL" ? FAVORITE_DRILL_NOT_FOUND : FAVORITE_PRACTICE_NOT_FOUND };
        }

        await prisma.plannerFavorite.upsert({
            where: { userId_kind_targetId: { userId, kind, targetId } },
            create: { userId, kind, targetId },
            update: {},
        });
        return { success: true, data: { kind, targetId, favorite } };
    } catch (error) {
        if (error instanceof z.ZodError) return { success: false, error: "Invalid input", details: error.issues };
        console.error("Error saving a planner favorite:", error);
        return { success: false, error: PLANNER_FAVORITE_SAVE_FAILED };
    }
}
