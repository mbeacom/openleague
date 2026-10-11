/**
 * Why "Fetch it for me" (ADR-0024) didn't fetch a page, worded once for both
 * screens: the hosted confirm card, and the static import it links back to
 * with `#/rankings/import?notice=…` so the paste and upload boxes are right
 * there. Only robots.txt outcomes travel this way; the link carries a fixed
 * word, never the league address. Pure: shared by the hosted and static apps.
 */

export type FetchNotice = "robots-disallowed" | "robots-unavailable";

export const ROBOTS_DISALLOWED_MESSAGE =
    "This site asks automated tools not to fetch this page. Open it in your browser, then paste or upload it here.";
export const ROBOTS_UNAVAILABLE_MESSAGE = "Couldn't check the site's rules — try again or paste the page.";

const MESSAGES: Record<FetchNotice, string> = {
    "robots-disallowed": ROBOTS_DISALLOWED_MESSAGE,
    "robots-unavailable": ROBOTS_UNAVAILABLE_MESSAGE,
};

export function isFetchNotice(value: unknown): value is FetchNotice {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(MESSAGES, value);
}

export function fetchNoticeMessage(notice: FetchNotice): string {
    return MESSAGES[notice];
}

/** The static import route with the notice, relative to the planner's base URL. */
export function fetchNoticeRoute(notice: FetchNotice): string {
    return `#/rankings/import?notice=${notice}`;
}
