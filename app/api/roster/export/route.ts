import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId, isTeamAdmin } from "@/lib/auth/session";
import { toCsvContent } from "@/lib/utils/csv";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return new Response("Bad Request", { status: 400 });
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const admin = await isTeamAdmin(userId, teamId);
    if (!admin) {
      return new Response("Forbidden", { status: 403 });
    }

    // Fetch team name for filename
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true },
    });

    if (!team) {
      return new Response("Not Found", { status: 404 });
    }

    // Fetch players and team officials in parallel
    const [players, officials] = await Promise.all([
      prisma.player.findMany({
        where: { teamId },
        orderBy: [{ jerseyNumber: "asc" }, { name: "asc" }],
        select: {
          name: true,
          email: true,
          phone: true,
          jerseyNumber: true,
          usahMemberId: true,
          emergencyContact: true,
          emergencyPhone: true,
        },
      }),
      prisma.teamMember.findMany({
        where: { teamId, role: "ADMIN" },
        orderBy: { user: { name: "asc" } },
        select: {
          role: true,
          usahMemberId: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    const headers = [
      "Role",
      "Name",
      "Email",
      "Phone",
      "Jersey #",
      "USA Hockey Member ID",
      "Emergency Contact",
      "Emergency Phone",
    ];

    const playerRows = players.map((p) => [
      "Player",
      p.name,
      p.email,
      p.phone,
      p.jerseyNumber,
      p.usahMemberId,
      p.emergencyContact,
      p.emergencyPhone,
    ]);

    const officialRows = officials.map((o) => [
      "Team Official",
      o.user.name || o.user.email,
      o.user.email,
      null,
      null,
      o.usahMemberId,
      null,
      null,
    ]);

    const csvContent = toCsvContent(headers, [...officialRows, ...playerRows]);

    const teamSlug = team.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `roster-${teamSlug}-${date}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting roster:", error);
    return new Response("Failed to export roster", { status: 500 });
  }
}
