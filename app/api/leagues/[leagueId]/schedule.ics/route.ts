import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

/** Events without an end time export as 2-hour blocks (legacy client behavior). */
const FALLBACK_DURATION_MS = 2 * 60 * 60 * 1000;

/** RFC 5545 UTC date-time, e.g. 20260711T183000Z. */
function formatIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** RFC 5545 §3.3.11 TEXT escaping. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 §3.1 line folding: continuation lines begin with one space. */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  // Split on code points so surrogate pairs are never cut in half.
  const chars = Array.from(line);
  const parts: string[] = [];
  let start = 0;
  let width = 75;
  while (start < chars.length) {
    parts.push(chars.slice(start, start + width).join(""));
    start += width;
    width = 74; // continuation lines lose one column to the leading space
  }
  return parts.join("\r\n ");
}

/**
 * GET /api/leagues/[leagueId]/schedule.ics
 *
 * Streams the league's full schedule as an iCalendar file. League members
 * only — mirrors the league schedule page's access check.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { leagueId } = await params;

    const leagueUser = await prisma.leagueUser.findFirst({
      where: { userId, leagueId, league: { isActive: true } },
      include: { league: { select: { name: true } } },
    });
    if (!leagueUser) {
      // Same as the schedule page's notFound(): non-members can't probe leagues.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const events = await prisma.event.findMany({
      where: { leagueId },
      select: {
        id: true,
        type: true,
        title: true,
        startAt: true,
        endAt: true,
        location: true,
        opponent: true,
        updatedAt: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    });

    const leagueName = leagueUser.league.name;
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//OpenLeague//League Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcsText(`${leagueName} Schedule`)}`,
    ];

    for (const event of events) {
      const end = event.endAt ?? new Date(event.startAt.getTime() + FALLBACK_DURATION_MS);
      const matchup =
        event.homeTeam && event.awayTeam
          ? `${event.homeTeam.name} vs ${event.awayTeam.name}`
          : null;
      const summary = matchup ?? event.title;
      const description = matchup ?? (event.opponent ? `vs ${event.opponent}` : "");

      lines.push(
        "BEGIN:VEVENT",
        `UID:${event.id}@openleague.app`,
        `DTSTAMP:${formatIcsDate(event.updatedAt)}`,
        `DTSTART:${formatIcsDate(event.startAt)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `CATEGORIES:${event.type}`
      );
      if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
      if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const body = `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
    // Header-safe ASCII filename (quotes and control chars fail the whitelist).
    const safeName = leagueName.replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "_") || "league";

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
