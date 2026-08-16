import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processGearOutbox } from "@/lib/services/gear-outbox-worker";
import { queueGearCustodyReminders } from "@/lib/services/gear-reminders";

function authorized(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !provided) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function run(request: NextRequest) {
  if (!env.CRON_SECRET) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const reminders = await queueGearCustodyReminders();
    const delivery = await processGearOutbox();
    return NextResponse.json({ success: true, reminders, delivery });
  } catch (error) {
    console.error("Gear notification cron failed", {
      message: error instanceof Error ? error.message.slice(0, 200) : "Unknown error",
    });
    return NextResponse.json({ error: "Gear notification processing failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
