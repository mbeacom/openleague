"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireEventManager } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  sendEventInvitationsSchema,
  eventInvitationCommandSchema,
  type SendEventInvitationsInput,
  type EventInvitationCommandInput,
} from "@/lib/utils/validation";
import { sendEventInvitationEmail } from "@/lib/email/templates";
import { formatDateTime } from "@/lib/utils/date";

function generateInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

type InvitableEvent = {
  id: string;
  title: string;
  startAt: Date;
  status: string;
  hostOrganization: { name: string } | null;
  hostLeague: { name: string } | null;
  hostTeam: { name: string } | null;
};

async function loadInvitableEvent(eventId: string): Promise<InvitableEvent | null> {
  return prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      startAt: true,
      status: true,
      hostOrganization: { select: { name: true } },
      hostLeague: { select: { name: true } },
      hostTeam: { select: { name: true } },
    },
  });
}

/**
 * Invite people to an event by email. Existing members are linked straight to
 * the event; everyone else gets a signup invitation. Re-inviting an address
 * refreshes its token and re-sends. For INVITE_ONLY events these invitations
 * are the access list.
 */
export async function sendEventInvitations(
  input: SendEventInvitationsInput
): Promise<ActionResult<{ sent: number; skipped: string[] }>> {
  try {
    const validated = sendEventInvitationsSchema.parse(input);
    const userId = await requireEventManager(validated.eventId);

    const event = await loadInvitableEvent(validated.eventId);
    if (!event) {
      return { success: false, error: "Event not found" };
    }
    if (event.status === "CANCELED") {
      return { success: false, error: "Canceled events cannot send invitations." };
    }
    if (event.startAt <= new Date()) {
      return { success: false, error: "This event has already started." };
    }

    const hostName =
      event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "the organizer";
    const uniqueEmails = [...new Set(validated.emails)];
    const skipped: string[] = [];
    let sent = 0;

    for (const email of uniqueEmails) {
      const existingUser = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });

      const token = generateInvitationToken();
      const invitation = await prisma.eventInvitation.upsert({
        where: { eventId_email: { eventId: event.id, email } },
        create: {
          eventId: event.id,
          email,
          token,
          status: "PENDING",
          expiresAt: event.startAt,
          invitedUserId: existingUser?.id ?? null,
          invitedById: userId,
        },
        update: {
          token,
          status: "PENDING",
          expiresAt: event.startAt,
          sentAt: new Date(),
          revokedAt: null,
          invitedUserId: existingUser?.id ?? null,
        },
        select: { id: true, token: true },
      });

      try {
        await sendEventInvitationEmail({
          to: email,
          eventTitle: event.title,
          hostName,
          startAtFormatted: formatDateTime(event.startAt),
          token: invitation.token,
          isExistingUser: Boolean(existingUser),
        });
        sent += 1;
      } catch (emailError) {
        console.error(`Failed to send event invitation to ${email}:`, emailError);
        skipped.push(email);
      }
    }

    revalidatePath(`/signup-events/${event.id}`);
    return { success: true, data: { sent, skipped } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to send event invitations:", error);
    return { success: false, error: "Failed to send invitations." };
  }
}

/** Revoke an invitation — the address immediately loses INVITE_ONLY access. */
export async function revokeEventInvitation(
  input: EventInvitationCommandInput
): Promise<ActionResult<{ invitationId: string }>> {
  try {
    const { invitationId } = eventInvitationCommandSchema.parse(input);

    const invitation = await prisma.eventInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, eventId: true, status: true },
    });
    if (!invitation) {
      return { success: false, error: "Invitation not found" };
    }
    await requireEventManager(invitation.eventId);

    if (invitation.status === "REVOKED") {
      return { success: false, error: "This invitation is already revoked." };
    }

    await prisma.eventInvitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    revalidatePath(`/signup-events/${invitation.eventId}`);
    return { success: true, data: { invitationId: invitation.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to revoke event invitation:", error);
    return { success: false, error: "Failed to revoke this invitation." };
  }
}

/** Re-send an invitation with a fresh token (invalidates the old link). */
export async function resendEventInvitation(
  input: EventInvitationCommandInput
): Promise<ActionResult<{ invitationId: string }>> {
  try {
    const { invitationId } = eventInvitationCommandSchema.parse(input);

    const invitation = await prisma.eventInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, eventId: true, email: true, invitedUserId: true },
    });
    if (!invitation) {
      return { success: false, error: "Invitation not found" };
    }
    await requireEventManager(invitation.eventId);

    const event = await loadInvitableEvent(invitation.eventId);
    if (!event || event.status === "CANCELED" || event.startAt <= new Date()) {
      return { success: false, error: "This event is no longer accepting invitations." };
    }

    const token = generateInvitationToken();
    await prisma.eventInvitation.update({
      where: { id: invitation.id },
      data: { token, status: "PENDING", sentAt: new Date(), revokedAt: null, expiresAt: event.startAt },
    });

    try {
      await sendEventInvitationEmail({
        to: invitation.email,
        eventTitle: event.title,
        hostName:
          event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "the organizer",
        startAtFormatted: formatDateTime(event.startAt),
        token,
        isExistingUser: Boolean(invitation.invitedUserId),
      });
    } catch (emailError) {
      console.error("Failed to re-send event invitation:", emailError);
      return { success: false, error: "The invitation was refreshed but the email failed to send." };
    }

    revalidatePath(`/signup-events/${invitation.eventId}`);
    return { success: true, data: { invitationId: invitation.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to resend event invitation:", error);
    return { success: false, error: "Failed to resend this invitation." };
  }
}

/** Organizer view of an event's invitation list. */
export async function listEventInvitations(eventId: string) {
  await requireEventManager(eventId);
  return prisma.eventInvitation.findMany({
    where: { eventId },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      email: true,
      status: true,
      sentAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedUser: { select: { id: true, name: true } },
    },
  });
}
