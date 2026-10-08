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
import { toSessionRowInputs } from "@/lib/utils/session-rows";
import { toSessionStaffInputs } from "@/lib/utils/session-staff";
import type { RosterOption } from "@/lib/utils/practice-roster";
import type { PlayInSession, StaffOption } from "@/types/practice-planner";
import type { VenueBookingOptions } from "../venue-booking-options";

interface PracticeSessionEditorWrapperProps {
  teamId: string;
  /** Venue/surface/segment options for the optional ice booking (006, FR-019). */
  bookingOptions: VenueBookingOptions;
  /** The team's officials and admins for the Staff picker (spec R4). */
  staffOptions?: StaffOption[];
  /** The team's players for the roster's "Add from team" (roster spec R8). */
  rosterOptions?: RosterOption[];
  /** Rows the new practice starts with (a library drill's "Add to new practice"). */
  initialPlays?: PlayInSession[];
}

export function PracticeSessionEditorWrapper({
  teamId,
  bookingOptions,
  staffOptions = [],
  rosterOptions = [],
  initialPlays,
}: PracticeSessionEditorWrapperProps) {
  const router = useRouter();

  const handleSave = useCallback(
    async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
      const result = await createPracticeSession({
        title: session.title,
        date: session.date,
        duration: session.duration,
        goaliesAttending: session.goaliesAttending ?? null,
        teamId,
        plays: toSessionRowInputs(session.plays),
        // Absent = unchanged: an editor that never loaded or set the gap sends none.
        ...(session.transitionMinutes !== undefined && { transitionMinutes: session.transitionMinutes }),
        // Absent = unchanged: an editor that holds no list sends none.
        ...(session.staff !== undefined && { staff: toSessionStaffInputs(session.staff) }),
        // Absent = unchanged (practice equipment spec R3): an editor that holds no list sends none.
        ...(session.equipment !== undefined && { equipment: session.equipment }),
        // A create without a roster stores none (roster spec R7).
        ...(session.roster !== undefined && { roster: session.roster }),
        reservationId: session.reservationId ?? undefined,
        // Optional venue booking (006, FR-019); omitted fields mean unbooked.
        venueId: session.venueId || undefined,
        surfaceId: session.surfaceId || undefined,
        segmentId: session.segmentId || undefined,
        startAt: session.startAt || undefined,
        overrideConflicts: session.overrideConflicts,
        overrideReason: session.overrideReason || undefined,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          conflicts: extractBookingConflicts(result.details),
        };
      }

      // Diagram editing needs a saved session, so continue on its edit page.
      router.push(`/practice-planner/${result.data.id}/edit`);
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
      reservations={bookingOptions.reservations}
      surfacesByVenue={bookingOptions.surfacesByVenue}
      segmentsBySurface={bookingOptions.segmentsBySurface}
      wholeLabelBySurface={bookingOptions.wholeLabelBySurface}
      staffOptions={staffOptions}
      rosterOptions={rosterOptions}
      {...(initialPlays && { initialData: { plays: initialPlays } })}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
