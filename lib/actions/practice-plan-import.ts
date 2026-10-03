"use server";

/**
 * Import a portable practice plan (ADR-0020) as a new session. The document
 * is re-parsed here: the client's parse is never trusted. Every drill becomes
 * a session-owned Play copy (3a); "add to library" adds separate library
 * copies. Prisma only (ADR-0003), one transaction.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { isTeamAdmin, requireUserId } from "@/lib/auth/session";
import { newPlayId } from "@/lib/services/play-ids";
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";
import { parsePlan } from "@/lib/plan-document";
import type { PlayData } from "@/types/practice-planner";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

// Not exported: a "use server" file may export only async functions.
const NOT_SCHEDULER_MESSAGE = "You can't schedule practices for this team.";
const IMPORT_FAILED_MESSAGE = "Failed to import the practice plan. Please try again.";

const importPracticePlanSchema = z.object({
    teamId: z.string().cuid("Invalid team ID format"),
    /** The plan's local date + start time, combined in the coach's browser zone. */
    date: z.iso.datetime({ offset: true, message: "Valid date is required" }),
    addToLibrary: z.boolean().default(false),
    document: z.unknown(),
});

export type ImportPracticePlanInput = z.input<typeof importPracticePlanSchema>;

export async function importPracticePlan(
    input: ImportPracticePlanInput,
): Promise<ActionResult<{ sessionId: string }>> {
    // Outside the try: a signed-out caller is redirected by a thrown signal,
    // which a catch would swallow.
    const userId = await requireUserId();

    try {
        const validated = importPracticePlanSchema.safeParse(input);
        if (!validated.success) {
            return { success: false, error: "Invalid input", details: validated.error.issues };
        }
        const { teamId, addToLibrary } = validated.data;

        const parsed = parsePlan(validated.data.document);
        if (!parsed.ok) {
            return { success: false, error: parsed.error.message, details: parsed.error.issues };
        }
        const { session: planSession } = parsed.plan;

        // createPracticeSession's requirePracticeScheduler without a reservation.
        // A lookup failure throws to the generic import error below.
        if (!(await isTeamAdmin(userId, teamId))) {
            return { success: false, error: NOT_SCHEDULER_MESSAGE };
        }

        const diagrams: PlayData[] = [];
        for (const drill of planSession.drills) {
            const clean = sanitizePlayDataForWrite(drill.drill.playData);
            if (!clean.ok) {
                return {
                    success: false,
                    error: `Drill ${drill.sequence + 1} ("${drill.drill.name}") has a diagram that can't be saved.`,
                    details: clean.issues,
                };
            }
            diagrams.push(clean.data);
        }

        const sessionId = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.create({
                data: {
                    title: planSession.title,
                    date: new Date(validated.data.date),
                    duration: planSession.durationMinutes,
                    isShared: false,
                    teamId,
                    createdById: userId,
                },
                select: { id: true },
            });
            if (planSession.drills.length === 0) return session.id;

            const drillFields = planSession.drills.map((drill, index) => ({
                name: drill.drill.name,
                description: drill.drill.description || null,
                thumbnail: null,
                playData: diagrams[index] as unknown as Prisma.InputJsonValue,
                teamId,
                createdById: userId,
                sourcePlayId: null,
            }));

            // Ids first, so the rows can point at their copies.
            const ownedIds = planSession.drills.map(() => newPlayId());
            await tx.play.createMany({
                data: drillFields.map((fields, index) => ({
                    id: ownedIds[index],
                    ...fields,
                    isTemplate: false,
                    sessionId: session.id,
                })),
            });
            await tx.practiceSessionPlay.createMany({
                data: planSession.drills.map((drill, index) => ({
                    sessionId: session.id,
                    playId: ownedIds[index],
                    sequence: drill.sequence,
                    duration: drill.durationMinutes,
                    instructions: drill.instructions || null,
                    runsWithPrevious: drill.runsWithPrevious,
                })),
            });
            if (addToLibrary) {
                await tx.play.createMany({
                    data: drillFields.map((fields) => ({ ...fields, isTemplate: true, sessionId: null })),
                });
            }
            return session.id;
        });

        revalidatePath("/practice-planner");
        revalidatePath("/calendar");
        if (addToLibrary) revalidatePath("/practice-planner/library");

        return { success: true, data: { sessionId } };
    } catch (error) {
        console.error("Error importing practice plan:", error);
        return { success: false, error: IMPORT_FAILED_MESSAGE };
    }
}
