"use server";

/**
 * Session-owned drills (practice planner 3a): edit a drill's diagram for one
 * session, add a session drill to the library, duplicate a session.
 * No action here sends email.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin } from "@/lib/auth/session";
import {
    copySessionDrillToLibrarySchema,
    duplicatePracticeSessionSchema,
    saveSessionDrillSchema,
    type CopySessionDrillToLibraryInput,
    type DuplicatePracticeSessionInput,
    type SaveSessionDrillInput,
} from "@/lib/utils/validation";
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";
import {
    CLONE_SOURCE_SELECT,
    SessionDrillError,
    cloneDrillsIntoSession,
    copySessionPlayScalars,
    duplicateSessionTitle,
} from "@/lib/services/practice-session-drills";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

function failure(error: unknown, fallback: string): { success: false; error: string; details?: unknown } {
    if (error instanceof z.ZodError) {
        const isPlayData = error.issues.some((issue) => issue.path[0] === "playData");
        return { success: false, error: isPlayData ? "Invalid play data" : "Invalid input", details: error.issues };
    }
    if (error instanceof SessionDrillError) {
        return { success: false, error: error.message };
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
        return { success: false, error: error.message };
    }
    console.error(fallback, error);
    return { success: false, error: fallback };
}

/**
 * Save a drill's diagram for one session.
 * - playId owned by the session: updated in place.
 * - playId is a library play, or an unowned play this session references (pre-3a data):
 *   forked into a new owned copy (sourcePlayId = provenance).
 * - no playId: a brand-new owned drill.
 * Does not touch the session's plays: the editor's next session save
 * references the returned id.
 */
export async function saveSessionDrill(
    input: SaveSessionDrillInput,
): Promise<ActionResult<{ playId: string }>> {
    try {
        const validated = saveSessionDrillSchema.parse(input);
        const userId = await requireTeamAdmin(validated.teamId);

        const sanitized = sanitizePlayDataForWrite(validated.playData);
        if (!sanitized.ok) {
            return { success: false, error: "Invalid play data", details: sanitized.issues };
        }
        // Tags: absent = keep (owned drill) / inherit (fork) / default (new drill) (spec R3).
        const tags = {
            ...(validated.focus !== undefined && { focus: validated.focus }),
            ...(validated.goalies !== undefined && { goalies: validated.goalies }),
        };
        const fields = {
            name: validated.name,
            description: validated.description || null,
            thumbnail: validated.thumbnail || null,
            playData: sanitized.data as unknown as Prisma.InputJsonValue,
            ...tags,
        };

        const playId = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.findUnique({
                where: { id: validated.sessionId },
                select: { teamId: true },
            });
            if (!session || session.teamId !== validated.teamId) {
                throw new SessionDrillError("Practice session not found");
            }

            const ownedCopy = {
                isTemplate: false,
                teamId: validated.teamId,
                createdById: userId,
                sessionId: validated.sessionId,
            };

            if (!validated.playId) {
                const created = await tx.play.create({
                    data: { ...fields, ...ownedCopy, sourcePlayId: null },
                    select: { id: true },
                });
                return created.id;
            }

            const play = await tx.play.findFirst({
                where: { id: validated.playId, teamId: validated.teamId },
                select: { id: true, sessionId: true, isTemplate: true, sourcePlayId: true, focus: true, goalies: true },
            });
            if (!play) throw new SessionDrillError();

            if (play.sessionId === validated.sessionId) {
                await tx.play.update({ where: { id: play.id }, data: fields });
                return play.id;
            }
            if (play.sessionId !== null) throw new SessionDrillError();
            if (!play.isTemplate) {
                const reference = await tx.practiceSessionPlay.findFirst({
                    where: { sessionId: validated.sessionId, playId: play.id },
                    select: { id: true },
                });
                if (!reference) throw new SessionDrillError();
            }

            const forked = await tx.play.create({
                data: { focus: play.focus, goalies: play.goalies, ...fields, ...ownedCopy, sourcePlayId: play.sourcePlayId ?? play.id },
                select: { id: true },
            });
            return forked.id;
        });

        revalidatePath(`/practice-planner/${validated.sessionId}`);
        return { success: true, data: { playId } };
    } catch (error) {
        return failure(error, "Failed to save drill. Please try again.");
    }
}

/** Add a session's private drill to the team library as a new template. */
export async function copySessionDrillToLibrary(
    input: CopySessionDrillToLibraryInput,
): Promise<ActionResult<{ playId: string }>> {
    try {
        const validated = copySessionDrillToLibrarySchema.parse(input);
        const userId = await requireTeamAdmin(validated.teamId);

        const play = await prisma.play.findFirst({
            where: { id: validated.playId, teamId: validated.teamId, session: { teamId: validated.teamId } },
            select: { name: true, description: true, thumbnail: true, playData: true, sessionId: true, focus: true, goalies: true },
        });
        if (!play || play.sessionId === null) {
            return { success: false, error: "Drill not found in this session" };
        }

        const created = await prisma.play.create({
            data: {
                name: play.name,
                description: play.description,
                thumbnail: play.thumbnail,
                playData: play.playData as Prisma.InputJsonValue,
                focus: play.focus,
                goalies: play.goalies,
                isTemplate: true,
                teamId: validated.teamId,
                createdById: userId,
            },
            select: { id: true },
        });

        revalidatePath("/practice-planner/library");
        return { success: true, data: { playId: created.id } };
    } catch (error) {
        return failure(error, "Failed to add drill to the library. Please try again.");
    }
}

/**
 * Duplicate a session onto a new date: same duration and drills (each cloned
 * into the new session), same per-drill duration/instructions and every other
 * session-play column. Unshared, and never booked: no venue, surface,
 * segment, start time, reservation, or Event (ADR-0007).
 */
export async function duplicatePracticeSession(
    input: DuplicatePracticeSessionInput,
): Promise<ActionResult<{ id: string }>> {
    try {
        const validated = duplicatePracticeSessionSchema.parse(input);
        const userId = await requireTeamAdmin(validated.teamId);

        const source = await prisma.practiceSession.findUnique({
            where: { id: validated.id },
            select: {
                teamId: true,
                title: true,
                duration: true,
                goaliesAttending: true,
                plays: {
                    orderBy: { sequence: "asc" },
                    include: { play: { select: CLONE_SOURCE_SELECT } },
                },
            },
        });
        if (!source || source.teamId !== validated.teamId) {
            return { success: false, error: "Practice session not found" };
        }

        const created = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.create({
                data: {
                    title: duplicateSessionTitle(source.title),
                    date: validated.date,
                    duration: source.duration,
                    goaliesAttending: source.goaliesAttending ?? null,
                    isShared: false,
                    teamId: validated.teamId,
                    createdById: userId,
                },
                select: { id: true },
            });

            const playIds = await cloneDrillsIntoSession(tx, {
                sessionId: session.id,
                teamId: validated.teamId,
                userId,
                sources: source.plays.map((row) => row.play),
            });
            if (source.plays.length > 0) {
                await tx.practiceSessionPlay.createMany({
                    data: source.plays.map((row, index) => ({
                        ...copySessionPlayScalars(row),
                        sessionId: session.id,
                        playId: playIds[index],
                    })),
                });
            }
            return session;
        });

        revalidatePath("/practice-planner");
        return { success: true, data: { id: created.id } };
    } catch (error) {
        return failure(error, "Failed to duplicate practice session. Please try again.");
    }
}
