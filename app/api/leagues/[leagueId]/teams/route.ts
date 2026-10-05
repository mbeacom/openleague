import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parseId } from "@/lib/utils/ids";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const leagueId = parseId((await params).leagueId);
    if (!leagueId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    const userId = await requireUserId();

    // Verify user has access to this league
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId,
        league: { isActive: true },
      },
    });

    if (!leagueUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Fetch teams in the league
    const teams = await prisma.team.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        division: {
          select: {
            id: true,
            name: true,
            ageGroup: true,
            skillLevel: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(teams);
  } catch (error) {
    console.error("Error fetching league teams:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}