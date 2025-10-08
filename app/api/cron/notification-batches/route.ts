import { NextRequest, NextResponse } from "next/server";
import { notificationService } from "@/lib/services/notification";
import { env } from "@/lib/env";

/**
 * Cron job endpoint to process pending notification batches
 * This should be called daily (e.g., at 8 AM) by a cron service like Vercel Cron
 */
export async function GET(request: NextRequest) {
  try {
    // Verify the request is from a cron service
    const authHeader = request.headers.get("authorization");
    const cronSecret = env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron secret not configured" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error("Unauthorized cron request");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("Processing pending notification batches...");
    
    // Process pending batches
    await notificationService.processPendingBatches();
    
    console.log("Notification batch processing completed");

    return NextResponse.json({
      success: true,
      message: "Notification batches processed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing notification batches:", error);
    
    return NextResponse.json(
      {
        error: "Failed to process notification batches",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}