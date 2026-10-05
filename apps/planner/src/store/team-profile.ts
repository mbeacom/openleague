/**
 * "Your team" (practice logo spec R4): one device-level record in the meta
 * store. Validated on write (teamProfileError) and read leniently
 * (readTeamProfile), so a damaged record never breaks a practice. Screens
 * subscribe to hear about changes made in this tab.
 */
import type { ActionResult } from "@/lib/planner-store";
import { readTeamProfile, teamProfileError, toTeamProfile, type TeamProfileInput } from "@/lib/utils/team-mark";
import type { TeamProfile } from "@/types/practice-planner";
import { META_TEAM_PROFILE } from "./records";
import { attempt, ok, write, type StoreContext } from "./shared";

export const TEAM_PROFILE_LOAD_FAILED = "Couldn't load your team. Please try again.";
export const TEAM_PROFILE_SAVE_FAILED = "Couldn't save your team. Please try again.";

export interface TeamProfileOps {
    getTeamProfile: () => Promise<ActionResult<TeamProfile | null>>;
    saveTeamProfile: (input: TeamProfileInput) => Promise<ActionResult<TeamProfile>>;
    clearTeamProfile: () => Promise<ActionResult<null>>;
    subscribeTeamProfile: (listener: () => void) => () => void;
    teamProfileVersion: () => number;
}

export function createTeamProfileOps(ctx: StoreContext): TeamProfileOps {
    const listeners = new Set<() => void>();
    let version = 0;
    // Runs after the write has committed and outside `attempt`: a listener that
    // throws can't turn a saved profile into a reported failure, or stop the others.
    const notify = <T>(result: ActionResult<T>): ActionResult<T> => {
        if (!result.success) return result;
        version += 1;
        for (const listener of [...listeners]) {
            try {
                listener();
            } catch (error) {
                console.error("A team profile listener failed:", error instanceof Error ? error.name : "unknown error");
            }
        }
        return result;
    };
    return {
        getTeamProfile: () =>
            attempt(TEAM_PROFILE_LOAD_FAILED, async () => ok(readTeamProfile(await ctx.repo.read((tx) => tx.getMeta(META_TEAM_PROFILE))))),

        saveTeamProfile: async (input) =>
            notify(
                await attempt(TEAM_PROFILE_SAVE_FAILED, async () => {
                    const error = teamProfileError(input);
                    if (error) return { success: false, error };
                    const profile = toTeamProfile(input);
                    await write(ctx, (tx) => tx.putMeta(META_TEAM_PROFILE, profile));
                    return ok(profile);
                }),
            ),

        clearTeamProfile: async () =>
            notify(
                await attempt(TEAM_PROFILE_SAVE_FAILED, async () => {
                    await write(ctx, (tx) => tx.putMeta(META_TEAM_PROFILE, null));
                    return ok(null);
                }),
            ),

        subscribeTeamProfile: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        teamProfileVersion: () => version,
    };
}
