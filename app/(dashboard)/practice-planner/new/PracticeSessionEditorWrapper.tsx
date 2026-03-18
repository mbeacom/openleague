"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createPracticeSession } from "@/lib/actions/practice-sessions";
import type { PracticeSessionData } from "@/types/practice-planner";

interface PracticeSessionEditorWrapperProps {
  teamId: string;
}

export function PracticeSessionEditorWrapper({ teamId }: PracticeSessionEditorWrapperProps) {
  const router = useRouter();

  const handleSave = useCallback(
    async (session: PracticeSessionData) => {
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
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Navigate to the newly created session
      router.push(`/practice-planner/${result.data.id}`);
    },
    [teamId, router]
  );

  const handleCancel = useCallback(() => {
    router.push("/practice-planner");
  }, [router]);

  return (
    <PracticeSessionEditor
      teamId={teamId}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
