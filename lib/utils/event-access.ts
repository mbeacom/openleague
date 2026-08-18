import type { SignupEventStatus, SignupEventVisibility } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type SignupEventGate = {
  id: string;
  status: SignupEventStatus;
  visibility: SignupEventVisibility;
  linkToken: string | null;
};

/**
 * Visibility gate for signup events (managers are handled by the caller and
 * bypass this):
 * - PUBLIC: anyone, once out of DRAFT
 * - LINK: anyone presenting the current link token
 * - INVITE_ONLY: signed-in users holding a non-revoked invitation
 * - PRIVATE / DRAFT: no one
 */
export async function canViewSignupEvent(
  gate: SignupEventGate,
  viewer: { userId: string | null; linkToken?: string }
): Promise<boolean> {
  if (gate.status === "DRAFT") {
    return false;
  }

  switch (gate.visibility) {
    case "PUBLIC":
      return true;
    case "LINK":
      return Boolean(viewer.linkToken && gate.linkToken === viewer.linkToken);
    case "INVITE_ONLY": {
      if (!viewer.userId) return false;
      const user = await prisma.user.findUnique({
        where: { id: viewer.userId },
        select: { email: true },
      });
      const invitation = await prisma.eventInvitation.findFirst({
        where: {
          eventId: gate.id,
          status: { not: "REVOKED" },
          OR: [
            { invitedUserId: viewer.userId },
            ...(user?.email
              ? [{ email: { equals: user.email, mode: "insensitive" as const } }]
              : []),
          ],
        },
        select: { id: true },
      });
      return Boolean(invitation);
    }
    case "PRIVATE":
    default:
      return false;
  }
}

/** Management access for server readers that already have the viewer id. */
export async function isSignupEventManager(userId: string, eventId: string): Promise<boolean> {
  const event = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: { hostOrganizationId: true, hostLeagueId: true, hostTeamId: true },
  });
  if (!event) return false;

  const [grant, leagueAdmin, teamAdmin, venueAdmin] = await Promise.all([
    prisma.eventManager.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true },
    }),
    event.hostLeagueId
      ? prisma.leagueUser.findFirst({
        where: { userId, leagueId: event.hostLeagueId, role: "LEAGUE_ADMIN" },
        select: { id: true },
      })
      : null,
    event.hostTeamId
      ? prisma.teamMember.findFirst({
        where: { userId, teamId: event.hostTeamId, role: "ADMIN" },
        select: { id: true },
      })
      : null,
    event.hostOrganizationId
      ? prisma.venueStaff.findFirst({
        where: {
          userId,
          organizationId: event.hostOrganizationId,
          status: "ACTIVE",
          role: { in: ["OWNER", "MANAGER", "SCHEDULER"] },
        },
        select: { id: true },
      })
      : null,
  ]);

  return Boolean(grant || leagueAdmin || teamAdmin || venueAdmin);
}

/** Confirmed registrant (contact of record) on the event — gallery contributor. */
export async function isConfirmedEventRegistrant(eventId: string, userId: string): Promise<boolean> {
  const count = await prisma.eventRegistration.count({
    where: { eventId, registrantId: userId, status: "CONFIRMED" },
  });
  return count > 0;
}

export type GalleryGate = SignupEventGate & {
  galleryEnabled: boolean;
  galleryVisibility: "PARTICIPANTS" | "EVENT_AUDIENCE";
};

/**
 * Gallery viewing gate. Managers are handled by callers and bypass this.
 * - PARTICIPANTS (default): confirmed registrants only — protects images of
 *   minors from non-participants.
 * - EVENT_AUDIENCE: whoever can view the event per its visibility tier.
 */
export async function canViewEventGallery(
  gate: GalleryGate,
  viewer: { userId: string | null; linkToken?: string }
): Promise<boolean> {
  if (!gate.galleryEnabled) return false;
  if (gate.galleryVisibility === "PARTICIPANTS") {
    if (!viewer.userId) return false;
    return isConfirmedEventRegistrant(gate.id, viewer.userId);
  }
  return canViewSignupEvent(gate, viewer);
}
