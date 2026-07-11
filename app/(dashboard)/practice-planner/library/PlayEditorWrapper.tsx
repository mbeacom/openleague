"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { createPlay, updatePlay } from "@/lib/actions/plays";
import type { SavedPlay } from "@/types/practice-planner";

interface PlayEditorWrapperProps {
  teamId: string;
  /** When provided, the wrapper edits an existing play; otherwise it creates a new one. */
  play?: SavedPlay;
}

export function PlayEditorWrapper({ teamId, play }: PlayEditorWrapperProps) {
  const router = useRouter();

  const handleSave = useCallback(
    async (saved: SavedPlay) => {
      // Empty strings are normalized to undefined: the thumbnail Zod schema
      // rejects "", and createPlay/updatePlay both store falsy description/
      // thumbnail values as null — so clearing a description still persists.
      const result = play
        ? await updatePlay({
            id: play.id,
            name: saved.name,
            description: saved.description || undefined,
            thumbnail: saved.thumbnail || undefined,
            playData: saved.playData,
            // Preserve the play's library status; the checkbox is locked in this flow.
            isTemplate: play.isTemplate,
            teamId,
          })
        : await createPlay({
            name: saved.name,
            description: saved.description || undefined,
            thumbnail: saved.thumbnail || undefined,
            playData: saved.playData,
            // Library-created plays must be templates or they won't appear in the library.
            isTemplate: true,
            teamId,
          });

      if (!result.success) {
        // PlayEditor catches this and surfaces the message in its error alert.
        throw new Error(result.error);
      }

      if (!play) {
        // Creation only happens via the explicit Save button — return to the library.
        // Edits stay on the page because PlayEditor auto-saves existing plays.
        router.push("/practice-planner/library");
        router.refresh();
      }
    },
    [play, teamId, router]
  );

  const handleCancel = useCallback(() => {
    router.push("/practice-planner/library");
  }, [router]);

  return (
    <PlayEditor
      teamId={teamId}
      playId={play?.id}
      initialData={play ?? { isTemplate: true }}
      lockTemplate
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
