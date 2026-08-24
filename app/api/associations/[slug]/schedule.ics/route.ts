import { NextRequest, NextResponse } from "next/server";

import {
  buildScheduleIcs,
  getPublicAssociationScheduleItems,
} from "@/lib/data/schedule-items";
import { resolvePublicAssociation } from "@/lib/actions/association-profile";
import { prisma } from "@/lib/db/prisma";
import { publicPublishedAssociationWhere } from "@/lib/utils/public-associations";

/**
 * GET /api/associations/[slug]/schedule.ics
 *
 * Public export. The lookup and selector deliberately expose only the
 * published association identity; schedule-items applies the public source
 * allowlist and never selects participant, roster, payment, or audit data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const resolved = await resolvePublicAssociation(slug);
    if (!resolved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (resolved.redirected) {
      const canonicalUrl = request.nextUrl.clone();
      canonicalUrl.pathname =
        `/api/associations/${resolved.canonicalSlug}/schedule.ics`;
      return NextResponse.redirect(canonicalUrl, 308);
    }

    const association = await prisma.league.findFirst({
      where: { ...publicPublishedAssociationWhere, id: resolved.id },
      select: { id: true, name: true },
    });
    if (!association) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const items = await getPublicAssociationScheduleItems(association.id);
    const body = buildScheduleIcs(items, {
      calendarName: `${association.name} Schedule`,
      prodId: "-//OpenLeague//Association Calendar//EN",
    });
    const safeName =
      association.name.replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "_")
      || "association";

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}_schedule.ics"`,
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error exporting public association schedule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
