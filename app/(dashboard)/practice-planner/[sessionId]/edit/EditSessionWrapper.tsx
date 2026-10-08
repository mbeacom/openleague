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
import type { PracticeSessionData, SessionStaffMember, StaffOption } from "@/types/practice-planner";
import { toSessionRowInputs } from "@/lib/utils/session-rows";
import { toSessionStaffInputs } from "@/lib/utils/session-staff";
import type { VenueBookingOptions } from "../../venue-booking-options";

interface EditSessionWrapperProps {
  sessionId: string;
  teamId: string;
  /**
   * transitionMinutes and staff are required: the editor sends what it loaded
   * on every save. The gap tells updatePracticeSession the payload comes from
   * an editor that knows block rows; the staff list means a current editor
   * never relies on the server carrying assignments across the row rewrite.
   */
  initialData: Partial<PracticeSessionData> & Partial<PracticeVenueAttachment> & { transitionMinutes: number; staff: SessionStaffMember[] };
  /** The team's officials and admins for the Staff picker (spec R4). */
  staffOptions?: StaffOption[];
  /** Venue/surface/segment options for the optional ice booking (006, FR-019). */
  bookingOptions: VenueBookingOptions;
}

export function EditSessionWrapper({
  sessionId,
  teamId,
  initialData,
  bookingOptions,
  staffOptions = [],
}: EditSessionWrapperProps) {
  const router = useRouter();

  const handleSave = useCallback(
    async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
      const result = await updatePracticeSession({
        id: sessionId,
        title: session.title,
        date: session.date,
        duration: session.duration,
        // Absent = unchanged: the editor may not set it; only an explicit null clears.
        ...(session.goaliesAttending !== undefined && { goaliesAttending: session.goaliesAttending }),
        teamId,
        plays: toSessionRowInputs(session.plays),
        // Absent = unchanged: an editor that never loaded or set the gap sends none.
        ...(session.transitionMinutes !== undefined && { transitionMinutes: session.transitionMinutes }),
        // Absent = unchanged: an editor that holds no list sends none.
        ...(session.staff !== undefined && { staff: toSessionStaffInputs(session.staff) }),
        // Absent = unchanged (practice equipment spec R3): an editor that holds no list sends none.
        ...(session.equipment !== undefined && { equipment: session.equipment }),
        reservationId: session.reservationId ?? undefined,
        // Optional venue booking (006, FR-019); the attachment is replaced
        // wholesale — omitting venueId detaches the practice.
        venueId: session.venueId || undefined,
        surfaceId: session.surfaceId || undefined,
        segmentId: session.segmentId || undefined,
        startAt: session.startAt || undefined,
        overrideConflicts: session.overrideConflicts,
        overrideReason: session.overrideReason || undefined,
        notify: session.notify,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          conflicts: extractBookingConflicts(result.details),
        };
      }

      // The editor swaps drill keys and staff keys to the ids this save stored.
      return { success: true, plays: result.data.plays, staff: result.data.staff };
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
      initialData={{
        ...initialData,
        reservationId: bookingOptions.currentReservationId,
      }}
      venues={bookingOptions.venues}
      reservations={bookingOptions.reservations}
      surfacesByVenue={bookingOptions.surfacesByVenue}
      segmentsBySurface={bookingOptions.segmentsBySurface}
      wholeLabelBySurface={bookingOptions.wholeLabelBySurface}
      staffOptions={staffOptions}
      onSave={handleSave}
      onShare={handleShare}
      onCancel={handleCancel}
    />
  );
}
