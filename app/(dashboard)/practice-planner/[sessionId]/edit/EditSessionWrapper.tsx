"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import {
  updatePracticeSession,
  sharePracticeSession,
} from "@/lib/actions/practice-sessions";
import type { PracticeSessionData } from "@/types/practice-planner";

interface EditSessionWrapperProps {
  sessionId: string;
  teamId: string;
  initialData: Partial<PracticeSessionData>;
}

export function EditSessionWrapper({
  sessionId,
  teamId,
  initialData,
}: EditSessionWrapperProps) {
  const router = useRouter();

  const handleSave = useCallback(
    async (session: PracticeSessionData) => {
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
      });

      if (!result.success) {
        throw new Error(result.error);
      }
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
      onSave={handleSave}
      onShare={handleShare}
      onCancel={handleCancel}
    />
  );
}
