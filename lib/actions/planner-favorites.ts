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
    MAX_PLANNER_FAVORITES,
    PLANNER_FAVORITE_LOAD_FAILED,
    PLANNER_FAVORITE_SAVE_FAILED,
    isStarterDrillId,
    listPlannerFavoritesSchema,
    plannerFavoriteLimitMessage,
    setPlannerFavoriteSchema,
} from "@/lib/utils/planner-favorites";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

/** Rows per read when listing; the list itself is complete (bounded by MAX_PLANNER_FAVORITES at write time). */
const LIST_PAGE_SIZE = 500;

/** Ids of the signed-in user's favorites of one kind, newest first. Every row, never a truncated list. */
export async function listPlannerFavorites(input: PlannerFavoriteQuery): Promise<ActionResult<string[]>> {
    const userId = await requireUserId();
    try {
        const { kind } = listPlannerFavoritesSchema.parse(input);
        const ids: string[] = [];
        // Keyset pages over a total order (createdAt, then id), so no row is skipped or repeated between
        // reads, even when the previous page's last row is unstarred in the meantime.
        let after: { createdAt: Date; id: string } | undefined;
        for (;;) {
            const rows = await prisma.plannerFavorite.findMany({
                where: {
                    userId,
                    kind,
                    ...(after && {
                        OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
                    }),
                },
                select: { id: true, targetId: true, createdAt: true },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: LIST_PAGE_SIZE,
            });
            for (const row of rows) ids.push(row.targetId);
            if (rows.length < LIST_PAGE_SIZE) break;
            const last = rows[rows.length - 1];
            after = { createdAt: last.createdAt, id: last.id };
        }
        return { success: true, data: ids };
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

        // The per-user limit applies only to a new star; re-starring a starred target stays idempotent.
        if ((await prisma.plannerFavorite.count({ where: { userId, kind } })) >= MAX_PLANNER_FAVORITES) {
            const existing = await prisma.plannerFavorite.findUnique({
                where: { userId_kind_targetId: { userId, kind, targetId } },
                select: { id: true },
            });
            if (!existing) return { success: false, error: plannerFavoriteLimitMessage(kind) };
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
