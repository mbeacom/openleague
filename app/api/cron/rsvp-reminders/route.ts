import { NextResponse } from "next/server";
import { sendRSVPReminders } from "@/lib/email/templates";

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
 * API route for sending RSVP reminders
 * This should be called by a cron job (e.g., Vercel Cron) every hour
 *
 * To set up Vercel Cron:
 * 1. Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/rsvp-reminders",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 *
 * Or use an external cron service to call this endpoint
 */
export async function GET(request: Request) {
  try {
    // Optional: Add authorization header check for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader) {
      const expectedAuth = `Bearer ${cronSecret}`;
      if (!timingSafeEqual(authHeader, expectedAuth)) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    } else if (cronSecret && !authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Send RSVP reminders
    await sendRSVPReminders();

    return NextResponse.json({
      success: true,
      message: "RSVP reminders sent successfully",
    });
  } catch (error) {
    console.error("Error sending RSVP reminders:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to send RSVP reminders",
      },
      { status: 500 }
    );
  }
}
