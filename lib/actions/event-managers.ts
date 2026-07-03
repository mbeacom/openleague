"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSignupEventHostAdmin, requireEventManager } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import { addEventManagerSchema, eventManagerCommandSchema, type AddEventManagerInput, type EventManagerCommandInput } from "@/lib/utils/validation";
import { logSignupEventActivity } from "@/lib/utils/event-activity";

/**
 * Per-event management delegation (FR-028): host-entity admins grant a
 * specific user (mite delegate, event coordinator…) full event-scoped
 * management without entity-wide rights. Entity settings (payment onboarding,
 * staff) remain admin-only. Grants and revocations are audit-logged (FR-029).
 */

async function requireHostAdminForEvent(eventId: string): Promise<string> {
  const event = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: { hostOrganizationId: true, hostLeagueId: true, hostTeamId: true },
  });
  if (!event) {
    throw new Error("Event not found");
  }
  return requireSignupEventHostAdmin({
    organizationId: event.hostOrganizationId,
    leagueId: event.hostLeagueId,
    teamId: event.hostTeamId,
  });
}

/** Grant event management to a platform user by email. Host admins only. */
export async function addEventManager(
  input: AddEventManagerInput
): Promise<ActionResult<{ managerId: string }>> {
  try {
    const validated = addEventManagerSchema.parse(input);
    const actorId = await requireHostAdminForEvent(validated.eventId);

    const user = await prisma.user.findFirst({
      where: { email: { equals: validated.email, mode: "insensitive" } },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      return {
        success: false,
        error: "No account exists for that email — they need to sign up first.",
      };
    }

    const existing = await prisma.eventManager.findUnique({
      where: { eventId_userId: { eventId: validated.eventId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "That person is already a manager of this event." };
    }

    const manager = await prisma.eventManager.create({
      data: { eventId: validated.eventId, userId: user.id, grantedById: actorId },
      select: { id: true },
    });

    await logSignupEventActivity({
      eventId: validated.eventId,
      actorId,
      action: "manager.added",
      summary: `Added ${user.name ?? user.email} as event manager`,
      details: { managerUserId: user.id },
    });

    revalidatePath(`/signup-events/${validated.eventId}`);
    return { success: true, data: { managerId: manager.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && (error.message.startsWith("Unauthorized") || error.message === "Event not found")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to add event manager:", error);
    return { success: false, error: "Failed to add this manager." };
  }
}

/** Revoke an event management grant. Host admins only; takes effect immediately. */
export async function removeEventManager(
  input: EventManagerCommandInput
): Promise<ActionResult<{ managerId: string }>> {
  try {
    const { managerId } = eventManagerCommandSchema.parse(input);

    const manager = await prisma.eventManager.findUnique({
      where: { id: managerId },
      select: { id: true, eventId: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!manager) {
      return { success: false, error: "Manager not found" };
    }
    const actorId = await requireHostAdminForEvent(manager.eventId);

    await prisma.eventManager.delete({ where: { id: manager.id } });

    await logSignupEventActivity({
      eventId: manager.eventId,
      actorId,
      action: "manager.removed",
      summary: `Removed ${manager.user.name ?? manager.user.email} as event manager`,
      details: { managerUserId: manager.user.id },
    });

    revalidatePath(`/signup-events/${manager.eventId}`);
    return { success: true, data: { managerId: manager.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && (error.message.startsWith("Unauthorized") || error.message === "Event not found")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to remove event manager:", error);
    return { success: false, error: "Failed to remove this manager." };
  }
}

/** The event's delegated managers (visible to any event manager). */
export async function listEventManagers(eventId: string) {
  await requireEventManager(eventId);
  return prisma.eventManager.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { name: true, email: true } },
    },
  });
}
