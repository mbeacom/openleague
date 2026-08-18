import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import { getLeagueScheduleItems, buildScheduleIcs } from "@/lib/data/schedule-items";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/leagues/[leagueId]/schedule.ics
 *
 * Private league export. Authorization is intentionally checked against the
 * exact league resource before the canonical reader is invoked.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { leagueId } = await params;
    const leagueUser = await prisma.leagueUser.findFirst({
      where: { userId, leagueId, league: { isActive: true } },
      select: { role: true, league: { select: { id: true, name: true } } },
    });
    if (!leagueUser?.league || leagueUser.league.id !== leagueId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const items = await getLeagueScheduleItems(leagueId, {
      userId,
      leagueRole: leagueUser.role,
    });
    const body = buildScheduleIcs(items, {
      calendarName: `${leagueUser.league.name} Schedule`,
      prodId: "-//OpenLeague//League Calendar//EN",
    });
    const safeName =
      leagueUser.league.name.replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "_")
      || "league";

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}_schedule.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting league schedule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
