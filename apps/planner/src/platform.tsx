/**
 * The static half of the planner's platform seam (ADR-0020): plain anchors,
 * an <img> laid out like next/image's `fill`, and hash navigation. A module
 * constant, so its identity never changes between renders.
 */
import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import type { PlannerImageProps, PlannerLinkProps, PlannerPlatform } from "@/lib/planner-store";
import { HOSTED_IMPORT_URL } from "./config";
import { matchRoute, staticRoutes, type StaticRoute } from "./routes";

export function StaticLink({ href, children, ...rest }: PlannerLinkProps) {
    return (
        <a href={href} {...rest}>
            {children}
        </a>
    );
}

/** next/image `fill`: absolutely positioned over its (positioned) parent. A bare <img> would overflow it. */
const FILL: CSSProperties = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" };

export function StaticImage({ src, alt, fit }: PlannerImageProps) {
    // eslint-disable-next-line @next/next/no-img-element -- the static app has no next/image; this mirrors its fill layout
    return <img src={src} alt={alt} decoding="async" style={{ ...FILL, objectFit: fit }} />;
}

export function navigateTo(href: string): void {
    if (href.startsWith("#")) window.location.hash = href;
    else window.location.assign(href);
}

/**
 * Swap the current hash without a history entry. replaceState fires no
 * hashchange, so announce one: useHashRoute would otherwise keep the old hash.
 */
export function replaceHash(href: string): void {
    window.history.replaceState(window.history.state, "", href);
    window.dispatchEvent(new Event("hashchange"));
}

export const staticPlannerPlatform: PlannerPlatform = {
    Link: StaticLink,
    Image: StaticImage,
    navigate: navigateTo,
    routes: staticRoutes,
    planGenerator: "openleague-static",
    planLink: { label: "Open in OpenLeague", mode: "open", baseUrl: HOSTED_IMPORT_URL },
};

function subscribe(onChange: () => void): () => void {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
}

export function useHashRoute(): StaticRoute {
    const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
    return useMemo(() => matchRoute(hash), [hash]);
}
