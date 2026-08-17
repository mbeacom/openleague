import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getGearOutboxHealth, processGearOutbox } from "@/lib/services/gear-outbox-worker";
import { cancelStaleGearCustodyReminders, queueGearCustodyReminders } from "@/lib/services/gear-reminders";

function authorized(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !provided) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function failure(stage: string, error: unknown): { stage: string; error: string } {
  const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
  console.error("Gear notification cron stage failed", { stage, message });
  return { stage, error: message };
}

/**
 * Runs the three gear notification stages independently.
 *
 * Reminder materialization and outbox delivery share a schedule but not a fate:
 * a reminder query that fails must not stop messages already sitting in the
 * outbox from going out, and vice versa. Each stage is attempted, its failure
 * recorded, and the response is only a 500 when nothing at all succeeded — so
 * a partial outage still drains what it can and still reports honestly.
 */
async function run(request: NextRequest) {
  if (!env.CRON_SECRET) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const errors: Array<{ stage: string; error: string }> = [];
  const now = new Date();

  let canceled = null;
  try {
    // Stale reminders are retired before new ones are queued, so a due-soon
    // notice overtaken by an overdue one never reaches an inbox behind it.
    canceled = await cancelStaleGearCustodyReminders(now);
  } catch (error) {
    errors.push(failure("cancel-stale-reminders", error));
  }

  let reminders = null;
  try {
    reminders = await queueGearCustodyReminders(now);
  } catch (error) {
    errors.push(failure("queue-reminders", error));
  }

  let delivery = null;
  try {
    delivery = await processGearOutbox();
  } catch (error) {
    errors.push(failure("deliver-outbox", error));
  }

  let health = null;
  try {
    health = await getGearOutboxHealth();
  } catch (error) {
    errors.push(failure("health", error));
  }

  const succeeded = canceled !== null || reminders !== null || delivery !== null;
  if (!succeeded) {
    return NextResponse.json(
      { error: "Gear notification processing failed", errors },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: errors.length === 0,
    reminders,
    canceled,
    delivery,
    health,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

export const GET = run;
export const POST = run;
