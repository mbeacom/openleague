import { prisma } from "@/lib/db/prisma";
import { isTeamAdmin, hasVenueStaffRole } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";
import { isUserIdString, parseId } from "@/lib/utils/ids";
import { isBrandableEntity, type BrandableEntity } from "@/lib/media/blob";

const VENUE_BRANDING_ROLES = ["OWNER", "MANAGER"] as const;

/**
 * Whether the user may change how this entity presents itself.
 *
 * Shared by the branding server actions and the upload token route so both
 * ask exactly the same question — a token issued on a weaker check would be a
 * way to write a URL the action itself would refuse. Not a server action: it
 * takes the user id from its caller.
 */
export async function canBrandEntity(
  userId: string,
  entity: BrandableEntity,
  entityId: string,
): Promise<boolean> {
  if (!isUserIdString(userId) || typeof entity !== "string" || !isBrandableEntity(entity)) {
    return false;
  }
  const id = parseId(entityId);
  if (!id) return false;

  switch (entity) {
    case "team": {
      if (await isTeamAdmin(userId, id)) return true;
      const team = await prisma.team.findUnique({
        where: { id },
        select: { leagueId: true },
      });
      // A standalone team has no association to delegate from, so team
      // admin is the whole answer for it.
      if (!team?.leagueId) return false;
      return hasCapability({
        userId,
        leagueId: team.leagueId,
        teamId: id,
        capability: Capability.MANAGE_TEAM,
      });
    }
    case "league":
      return hasCapability({
        userId,
        leagueId: id,
        capability: Capability.ADMINISTER_ASSOCIATION,
      });
    case "venue": {
      const venue = await prisma.venue.findUnique({
        where: { id },
        select: { organizationId: true },
      });
      // A venue with no owning organization has no staff to authorize against.
      if (!venue?.organizationId) return false;
      return hasVenueStaffRole(
        userId,
        venue.organizationId,
        VENUE_BRANDING_ROLES,
        id,
      );
    }
  }
}
