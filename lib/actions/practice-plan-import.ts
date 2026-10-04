"use server";

/**
 * Import a portable practice plan (ADR-0020) as a new session. The document
 * is re-parsed here: the client's parse is never trusted. Every drill becomes
 * a session-owned Play copy (3a); a warm-up, break, transition or cool-down
 * is a row with no play; the plan's staff becomes typed names (never linked).
 * "add to library" adds separate library copies of the drills. Prisma only (ADR-0003), one transaction.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { isTeamAdmin, requireUserId } from "@/lib/auth/session";
import { newPlayId } from "@/lib/services/play-ids";
import { writeRowStaff } from "@/lib/services/practice-session-staff";
import { staffNameKey } from "@/lib/utils/session-staff";
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";
import { parsePlan, type PlanDrill } from "@/lib/plan-document";
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

        // Only drill rows have diagrams and copies; block rows are written as they are.
        const drillEntries = planSession.drills.filter((entry): entry is PlanDrill => entry.kind === "drill");
        const diagrams = new Map<number, PlayData>();
        for (const entry of drillEntries) {
            const clean = sanitizePlayDataForWrite(entry.drill.playData);
            if (!clean.ok) {
                return {
                    success: false,
                    error: `Drill ${entry.sequence + 1} ("${entry.drill.name}") has a diagram that can't be saved.`,
                    details: clean.issues,
                };
            }
            diagrams.set(entry.sequence, clean.data);
        }

        const sessionId = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.create({
                data: {
                    title: planSession.title,
                    date: new Date(validated.data.date),
                    duration: planSession.durationMinutes,
                    goaliesAttending: planSession.goaliesAttending,
                    transitionMinutes: planSession.transitionMinutes,
                    isShared: false,
                    teamId,
                    createdById: userId,
                },
                select: { id: true },
            });
            // Staff (spec R5, R6): typed names from the file, never linked; ids made here so rows can name them.
            const staffIds = planSession.staff.map(() => newPlayId());
            if (planSession.staff.length > 0) {
                await tx.practiceSessionStaff.createMany({
                    data: planSession.staff.map((name, position) => ({
                        id: staffIds[position],
                        sessionId: session.id,
                        name,
                        position,
                        teamOfficialId: null,
                        userId: null,
                    })),
                });
            }
            const staffByName = new Map(planSession.staff.map((name, index) => [staffNameKey(name), staffIds[index]]));
            if (planSession.drills.length === 0) return session.id;

            const drillFields = drillEntries.map((entry) => ({
                name: entry.drill.name,
                description: entry.drill.description || null,
                thumbnail: null,
                playData: diagrams.get(entry.sequence) as unknown as Prisma.InputJsonValue,
                focus: entry.drill.focus,
                goalies: entry.drill.goalies,
                teamId,
                createdById: userId,
                sourcePlayId: null,
            }));

            // Ids first, so the rows can point at their copies; matched by sequence, never by position.
            const ownedIds = drillEntries.map(() => newPlayId());
            const ownedBySequence = new Map(drillEntries.map((entry, index) => [entry.sequence, ownedIds[index]]));
            if (drillEntries.length > 0) {
                await tx.play.createMany({
                    data: drillFields.map((fields, index) => ({ id: ownedIds[index], ...fields, isTemplate: false, sessionId: session.id })),
                });
            }
            const ownedCopy = (sequence: number): string => {
                const id = ownedBySequence.get(sequence);
                if (id === undefined) throw new Error(`No drill copy for row ${sequence}`);
                return id;
            };
            await tx.practiceSessionPlay.createMany({
                data: planSession.drills.map((entry) =>
                    entry.kind === "drill"
                        ? {
                              sessionId: session.id,
                              playId: ownedCopy(entry.sequence),
                              kind: "drill",
                              label: null,
                              sequence: entry.sequence,
                              duration: entry.durationMinutes,
                              instructions: entry.instructions || null,
                              runsWithPrevious: entry.runsWithPrevious,
                              stays: entry.stays,
                              rotateEveryMinutes: entry.rotateEveryMinutes,
                          }
                        : {
                              sessionId: session.id,
                              playId: null,
                              kind: entry.kind,
                              label: entry.label,
                              sequence: entry.sequence,
                              duration: entry.durationMinutes,
                              instructions: entry.instructions || null,
                              runsWithPrevious: false,
                              stays: false,
                              rotateEveryMinutes: null,
                          },
                ),
            });
            // parsePlan checked that every row's names are on the list (ignoring case).
            await writeRowStaff(
                tx,
                session.id,
                planSession.drills.map((entry) => ({
                    sequence: entry.sequence,
                    staffIds: entry.staff.map((name) => {
                        const staffId = staffByName.get(staffNameKey(name));
                        if (staffId === undefined) throw new Error(`No staff member named in row ${entry.sequence}`);
                        return staffId;
                    }),
                })),
            );
            if (addToLibrary && drillFields.length > 0) {
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
