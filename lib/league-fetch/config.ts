/**
 * Server configuration for the hosted league page fetch (ADR-0024). The
 * redirect target always comes from here, never from the request.
 */
import { parseAllowedHosts } from "./guard";

export const DEFAULT_STATIC_PLANNER_URL = "https://openleague.dev/planner/";
/** The static app's rankings import route, with the pulled schedule in its query. */
export const PULL_ROUTE = "#/rankings/import?pull=";

/** LEAGUE_FETCH_ALLOWED_HOSTS, or the default allowlist. */
export function leagueFetchAllowedHosts(env: Record<string, string | undefined> = process.env): string[] {
    return parseAllowedHosts(env.LEAGUE_FETCH_ALLOWED_HOSTS);
}

/**
 * NEXT_PUBLIC_STATIC_PLANNER_URL normalized to end in "/" with no query or
 * fragment; the default when it is unset or not an https URL (http only for
 * localhost testing).
 */
export function staticPlannerBaseUrl(raw: string | undefined = process.env.NEXT_PUBLIC_STATIC_PLANNER_URL): string {
    const value = raw?.trim();
    if (!value) return DEFAULT_STATIC_PLANNER_URL;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return DEFAULT_STATIC_PLANNER_URL;
    }
    const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !local) return DEFAULT_STATIC_PLANNER_URL;
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    return url.toString();
}

/** Where the hosted page sends the user with a pulled schedule. */
export function staticPullUrl(fragmentValue: string, base: string = staticPlannerBaseUrl()): string {
    return `${base}${PULL_ROUTE}${fragmentValue}`;
}
