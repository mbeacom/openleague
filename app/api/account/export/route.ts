import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/session";

/**
 * Self-serve personal-data export (GDPR/CCPA-style access request): returns
 * the caller's own account data as a downloadable JSON file. Scope is the
 * account itself — profile, memberships, roster links, RSVPs, registrations,
 * preferences — never other users' data.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        teamMembers: {
          select: {
            role: true,
            joinedAt: true,
            team: { select: { name: true, sport: true, season: true } },
          },
        },
        leagueUsers: {
          select: {
            role: true,
            joinedAt: true,
            league: { select: { name: true } },
          },
        },
        players: {
          select: {
            name: true,
            email: true,
            phone: true,
            jerseyNumber: true,
            position: true,
            team: { select: { name: true } },
          },
        },
        playerGuardians: {
          select: {
            relationship: true,
            canRsvp: true,
            createdAt: true,
            player: { select: { name: true, team: { select: { name: true } } } },
          },
        },
        rsvps: {
          select: {
            status: true,
            updatedAt: true,
            event: { select: { title: true, type: true, startAt: true } },
          },
        },
        eventRegistrations: {
          select: {
            status: true,
            createdAt: true,
            event: { select: { title: true } },
          },
        },
        notificationPreferences: true,
        venueStaffMemberships: {
          select: {
            role: true,
            status: true,
            joinedAt: true,
            organization: { select: { name: true } },
          },
        },
      },
    });

    if (!user) {
      return new Response("Not Found", { status: 404 });
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      format: "openleague-account-export/v1",
      account: user,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="openleague-account-export.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting account data:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
