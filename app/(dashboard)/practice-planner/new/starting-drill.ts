import { getPlayById } from "@/lib/actions/plays";
import { libraryDrillRow } from "@/lib/utils/drill-details";
import type { PlayInSession } from "@/types/practice-planner";

/**
 * The new practice's first row when it starts from a library drill
 * (`?drill=<playId>`). getPlayById validates the id and the team; a missing,
 * repeated or unreadable drill starts an empty practice instead. So does a
 * legacy unowned play that isn't a library template: a new practice only
 * accepts library drills, so its save would reject the row.
 */
export async function startingDrillRows(drill: string | string[] | undefined, teamId: string): Promise<PlayInSession[]> {
  if (typeof drill !== "string" || drill.length === 0) return [];
  const result = await getPlayById({ id: drill, teamId });
  if (!result.success || !result.data.isTemplate) return [];
  return [libraryDrillRow(result.data, `play-start-${result.data.id}`)];
}
