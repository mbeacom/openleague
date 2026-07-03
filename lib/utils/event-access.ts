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
