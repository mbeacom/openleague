"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  PracticeSessionEditor,
  extractBookingConflicts,
  type PracticeSessionSubmitData,
  type PracticeSessionSaveResult,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { createPracticeSession } from "@/lib/actions/practice-sessions";
import type { VenueBookingOptions } from "../venue-booking-options";

interface PracticeSessionEditorWrapperProps {
  teamId: string;
  /** Venue/surface/segment options for the optional ice booking (006, FR-019). */
  bookingOptions: VenueBookingOptions;
}

export function PracticeSessionEditorWrapper({
  teamId,
  bookingOptions,
}: PracticeSessionEditorWrapperProps) {
  const router = useRouter();

  const handleSave = useCallback(
    async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
      const result = await createPracticeSession({
        title: session.title,
        date: session.date,
        duration: session.duration,
        teamId,
        plays: session.plays.map((play) => ({
          playId: play.playId,
          sequence: play.sequence,
          duration: play.duration,
          instructions: play.instructions || "",
        })),
        // Optional venue booking (006, FR-019); omitted fields mean unbooked.
        venueId: session.venueId || undefined,
        surfaceId: session.surfaceId || undefined,
        segmentId: session.segmentId || undefined,
        startAt: session.startAt || undefined,
        overrideConflicts: session.overrideConflicts,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          conflicts: extractBookingConflicts(result.details),
        };
      }

      // Navigate to the newly created session
      router.push(`/practice-planner/${result.data.id}`);
      return { success: true };
    },
    [teamId, router]
  );

  const handleCancel = useCallback(() => {
    router.push("/practice-planner");
  }, [router]);

  return (
    <PracticeSessionEditor
      teamId={teamId}
      venues={bookingOptions.venues}
      surfacesByVenue={bookingOptions.surfacesByVenue}
      segmentsBySurface={bookingOptions.segmentsBySurface}
      wholeLabelBySurface={bookingOptions.wholeLabelBySurface}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
