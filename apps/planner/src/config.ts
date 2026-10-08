/** Static planner constants (ADR-0020). */
import { LEAGUE_FETCH_PATH, PLAN_IMPORT_PATH } from "@/lib/plan-document/pending";
import { PUBLIC_AI_ORIGINS } from "../ai-origins";
import { DEFAULT_HOSTED_URL } from "../build-config";

/** The hosted platform. Set at build from OPENLEAGUE_HOSTED_URL; the default under tests. */
export const HOSTED_URL: string =
    typeof __OPENLEAGUE_HOSTED_URL__ === "string" ? __OPENLEAGUE_HOSTED_URL__ : DEFAULT_HOSTED_URL;

/** Where "Open in OpenLeague" sends a plan (the signed-in import page, sub-project 1). */
export const HOSTED_IMPORT_URL = `${HOSTED_URL}${PLAN_IMPORT_PATH}`;

/**
 * The origins AI features may reach (ADR-0023): the build's connect-src list,
 * set from OPENLEAGUE_AI_CONNECT_ORIGINS; the public list under tests.
 */
export const AI_ORIGINS: readonly string[] =
    typeof __OPENLEAGUE_AI_ORIGINS__ !== "undefined" && Array.isArray(__OPENLEAGUE_AI_ORIGINS__)
        ? __OPENLEAGUE_AI_ORIGINS__
        : PUBLIC_AI_ORIGINS;

/**
 * "Fetch it for me" (ADR-0024): the hosted page that fetches a league schedule
 * page for a signed-in user and sends the games back to #/rankings/import. The
 * address travels in the fragment, so it never reaches a server log.
 */
export function hostedFetchUrl(leagueUrl: string): string {
    return `${HOSTED_URL}${LEAGUE_FETCH_PATH}#src=${encodeURIComponent(leagueUrl)}`;
}

/** The static app has one implicit "team": this browser. The store ignores teamId. */
export const LOCAL_TEAM_ID = "local";
export const LOCAL_AUTHOR_NAME = "You";

export const PRIVACY_NOTE =
    "Your practices stay in this browser. The planner uploads nothing on its own, and there's no account or tracking. " +
    "If you turn on AI assistance, pressing Send sends the request you previewed from this browser to the AI provider you set up, using your key. " +
    "Rankings' “Fetch it for me” opens OpenLeague's hosted app, which fetches the league page for a signed-in account. " +
    "Browsers can clear site data, so download plan files to keep a backup. " +
    "Fonts load from Fontshare and Google Fonts, which see your IP address like any website.";
