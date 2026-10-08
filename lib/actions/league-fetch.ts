"use server";

/**
 * "Fetch it for me" (hosted league page fetch spec, ADR-0024): a signed-in
 * user asks the hosted app to fetch one public league schedule page. The page
 * is fetched under the guard in lib/league-fetch, parsed here, and handed to
 * the static planner as a compact `#/rankings/import?pull=…` link built from
 * server configuration. Nothing is stored: no page, no games, no URL.
 *
 * Authorization is sign-in only: it is a personal tool, not a team or league
 * operation. The per-user rate limit is durable and fail-closed.
 */

import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS, rateLimitMessage } from "@/lib/utils/durable-rate-limit";
import { checkLeagueUrl, fetchLeaguePage, LeagueFetchError, type LeagueFetchErrorKind } from "@/lib/league-fetch/guard";
import { leagueFetchAllowedHosts, leagueFetchTimeoutMs, staticPullUrl } from "@/lib/league-fetch/config";
import { encodeSchedulePull, SchedulePullTooLargeError } from "@/lib/rankings-document";
import { defaultSeasonYear, parseSchedule } from "@/lib/ratings/import";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

// Not exported: a "use server" file may export only async functions.
const FETCH_FAILED_MESSAGE = "Couldn't fetch the schedule. Please try again.";
const NO_GAMES_MESSAGE = "No games were found on that page. Check that it's a division's schedule page.";
const TOO_LARGE_FOR_LINK_MESSAGE =
    "That schedule is too large to hand to the planner. Save the page and open it in the planner instead.";

const MESSAGES: Record<LeagueFetchErrorKind, string> = {
    "invalid-url": "That isn't a web address OpenLeague can fetch.",
    "not-https": "Only https:// league pages can be fetched.",
    "bad-port": "That isn't a web address OpenLeague can fetch.",
    credentials: "That isn't a web address OpenLeague can fetch.",
    "ip-literal": "That isn't a web address OpenLeague can fetch.",
    "host-not-allowed": "OpenLeague can't fetch pages from that site yet.",
    "dns-failed": "Couldn't reach the league site. Please try again later.",
    "private-address": "Couldn't reach the league site. Please try again later.",
    "redirect-off-host": "The league site sent the request somewhere else, so OpenLeague stopped.",
    "too-many-redirects": "The league site sent the request somewhere else, so OpenLeague stopped.",
    "bad-redirect": "The league site sent the request somewhere else, so OpenLeague stopped.",
    "http-status": "The league site didn't return the page.",
    "content-type": "That address isn't a web page.",
    "too-large": "That page is larger than OpenLeague will fetch.",
    timeout: "The league site was too slow to respond, so the request timed out.",
    network: "Couldn't reach the league site. Please try again later.",
};

const fetchLeagueScheduleSchema = z.object({
    url: z.string().trim().min(1, "A league page address is required").max(2048, "That address is too long"),
});

export type FetchLeagueScheduleInput = z.input<typeof fetchLeagueScheduleSchema>;

export interface FetchLeagueScheduleData {
    /** The static planner's import URL, from configuration, carrying the pulled schedule. */
    redirectUrl: string;
    host: string;
    games: number;
    teams: number;
}

export async function fetchLeagueSchedule(input: FetchLeagueScheduleInput): Promise<ActionResult<FetchLeagueScheduleData>> {
    // Outside the try: a signed-out caller is redirected by a thrown signal,
    // which a catch would swallow.
    const userId = await requireUserId();

    try {
        const validated = fetchLeagueScheduleSchema.safeParse(input);
        if (!validated.success) {
            return { success: false, error: MESSAGES["invalid-url"], details: { kind: "invalid-input" } };
        }
        const allowedHosts = leagueFetchAllowedHosts();
        // Cheap refusals first, so a typo doesn't use up the user's fetches.
        const url = checkLeagueUrl(validated.data.url, allowedHosts);

        const limit = await checkRateLimit(`league-fetch:user:${userId}`, RATE_LIMITS.LEAGUE_FETCH_PER_USER, { failOpen: false });
        if (!limit.allowed) {
            return { success: false, error: rateLimitMessage(limit.retryAfterSec), details: { kind: "rate-limited" } };
        }

        const page = await fetchLeaguePage(url.toString(), { allowedHosts, timeoutMs: leagueFetchTimeoutMs() });
        const schedule = parseSchedule(page.html, { seasonYear: defaultSeasonYear(new Date()) });
        if (schedule.games.length === 0) {
            return { success: false, error: NO_GAMES_MESSAGE, details: { kind: "no-games" } };
        }

        const fragment = await encodeSchedulePull({ sourceUrl: page.url, fetchedAt: new Date().toISOString(), schedule });
        return {
            success: true,
            data: {
                redirectUrl: staticPullUrl(fragment),
                host: url.host,
                games: schedule.games.length,
                teams: schedule.teams.length,
            },
        };
    } catch (error) {
        if (error instanceof LeagueFetchError) {
            return { success: false, error: MESSAGES[error.kind], details: { kind: error.kind } };
        }
        if (error instanceof SchedulePullTooLargeError) {
            return { success: false, error: TOO_LARGE_FOR_LINK_MESSAGE, details: { kind: "too-large-for-link" } };
        }
        // Only the error's type: a message could carry page content.
        console.error({ event: "league_page_fetch_failed", errorType: error instanceof Error ? error.name : "unknown" });
        return { success: false, error: FETCH_FAILED_MESSAGE };
    }
}
