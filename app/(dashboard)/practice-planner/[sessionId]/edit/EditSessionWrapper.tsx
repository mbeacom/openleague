"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  PracticeSessionEditor,
  extractBookingConflicts,
  type PracticeSessionSubmitData,
  type PracticeSessionSaveResult,
  type PracticeVenueAttachment,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import {
  updatePracticeSession,
  sharePracticeSession,
} from "@/lib/actions/practice-sessions";
import type { PracticeSessionData } from "@/types/practice-planner";
import type { VenueBookingOptions } from "../../venue-booking-options";

interface EditSessionWrapperProps {
  sessionId: string;
  teamId: string;
  initialData: Partial<PracticeSessionData> & Partial<PracticeVenueAttachment>;
  /** Venue/surface/segment options for the optional ice booking (006, FR-019). */
  bookingOptions: VenueBookingOptions;
}

export function EditSessionWrapper({
  sessionId,
  teamId,
  initialData,
  bookingOptions,
}: EditSessionWrapperProps) {
  const router = useRouter();

  const handleSave = useCallback(
    async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
      const result = await updatePracticeSession({
        id: sessionId,
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
        // Optional venue booking (006, FR-019); the attachment is replaced
        // wholesale — omitting venueId detaches the practice.
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

      return { success: true };
    },
    [sessionId, teamId]
  );

  const handleShare = useCallback(
    async (id: string) => {
      const result = await sharePracticeSession({
        id,
        teamId,
        isShared: true,
      });

      if (!result.success) {
        throw new Error(result.error);
      }
    },
    [teamId]
  );

  const handleCancel = useCallback(() => {
    router.push(`/practice-planner/${sessionId}`);
  }, [router, sessionId]);

  return (
    <PracticeSessionEditor
      sessionId={sessionId}
      teamId={teamId}
      initialData={initialData}
      venues={bookingOptions.venues}
      surfacesByVenue={bookingOptions.surfacesByVenue}
      segmentsBySurface={bookingOptions.segmentsBySurface}
      wholeLabelBySurface={bookingOptions.wholeLabelBySurface}
      onSave={handleSave}
      onShare={handleShare}
      onCancel={handleCancel}
    />
  );
}
