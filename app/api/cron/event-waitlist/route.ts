import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { sweepEventWaitlists } from "@/lib/utils/event-waitlist";
import { env } from "@/lib/env";

/**
 * Waitlist sweep for signup events, called by Vercel Cron every 10 minutes:
 * expires lapsed offers (cascading to the next entries) and issues offers
 * when a registration phase has opened with capacity remaining. This is the
 * backstop — cancellations already cascade offers synchronously, and expired
 * offers stop counting against capacity lazily.
 *
 * Auth mirrors /api/cron/notification-batches: CRON_SECRET is required (the
 * sweep sends offer emails, so it must not run for unauthenticated callers)
 * and the token is compared with Node's constant-time timingSafeEqual.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
    }

    const providedToken = authHeader?.split("Bearer ")[1];
    if (!providedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expected = Buffer.from(cronSecret);
    const actual = Buffer.from(providedToken);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { expired, offered } = await sweepEventWaitlists();

    return NextResponse.json({ success: true, expired, offered });
  } catch (error) {
    console.error("Error sweeping event waitlists:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sweep event waitlists" },
      { status: 500 }
    );
  }
}
