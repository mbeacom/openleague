import { NextResponse } from "next/server";
import { sweepEventWaitlists } from "@/lib/utils/event-waitlist";

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Waitlist sweep for signup events, called by Vercel Cron every 10 minutes:
 * expires lapsed offers (cascading to the next entries) and issues offers
 * when a registration phase has opened with capacity remaining. This is the
 * backstop — cancellations already cascade offers synchronously, and expired
 * offers stop counting against capacity lazily.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader) {
      const expectedAuth = `Bearer ${cronSecret}`;
      if (!timingSafeEqual(authHeader, expectedAuth)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (cronSecret && !authHeader) {
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
