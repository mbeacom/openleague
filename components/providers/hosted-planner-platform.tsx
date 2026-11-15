"use client";

/**
 * The hosted half of the planner's platform seam: Next.js links, images and
 * navigation. It is kept apart from HostedPlannerProvider's store so tests can
 * use the real hosted platform without loading the server actions, which
 * don't import under Vitest.
 */
import { useMemo } from "react";
import NextImage from "next/image";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { PlannerImageProps, PlannerLinkProps, PlannerPlanLink, PlannerPlatform, PlannerRoutes } from "@/lib/planner-store";
import { PLAN_IMPORT_PATH } from "@/lib/plan-document/pending";

export const hostedPlannerRoutes: PlannerRoutes = {
    list: () => "/practice-planner",
    session: (id) => `/practice-planner/${id}`,
    sessionEdit: (id) => `/practice-planner/${id}/edit`,
    sessionPrint: (id) => `/practice-planner/${id}/print`,
    libraryNew: () => "/practice-planner/library/new",
    libraryEdit: (playId) => `/practice-planner/library/${playId}/edit`,
    library: () => "/practice-planner/library",
    libraryPlay: (playId) => `/practice-planner/library/${encodeURIComponent(playId)}`,
    sessionNewWithDrill: (playId) => `/practice-planner/new?drill=${encodeURIComponent(playId)}`,
};

/** next/link: keeps prefetch and client-side navigation. */
export function HostedLink(props: PlannerLinkProps) {
    return <NextLink {...props} />;
}

/** Thumbnails are base64 data URLs: unoptimized, exactly as every call site passed before the seam. */
export function HostedImage({ src, alt, fit }: PlannerImageProps) {
    return <NextImage src={src} alt={alt} fill style={{ objectFit: fit }} unoptimized />;
}

export const HOSTED_IMPORT_LINK_LABEL = "Copy “Import into OpenLeague” link";

/**
 * The Export menu's link items.
 * - "Open in planner", only when the static planner's URL is configured. Next
 *   inlines NEXT_PUBLIC_* at build; tests stub the env.
 * - "Import into OpenLeague", once this app's origin is known (in the browser):
 *   a coach on another team opens it, signs in, and imports the plan into a
 *   team they administer.
 */
export function hostedPlanLinks(
    url: string | undefined = process.env.NEXT_PUBLIC_STATIC_PLANNER_URL,
    origin: string | null = typeof window === "undefined" ? null : window.location.origin,
): PlannerPlanLink[] {
    const links: PlannerPlanLink[] = [];
    const baseUrl = url?.trim();
    if (baseUrl) links.push({ label: "Copy “Open in planner” link", mode: "copy", baseUrl });
    if (origin) links.push({ label: HOSTED_IMPORT_LINK_LABEL, mode: "copy", baseUrl: `${origin}${PLAN_IMPORT_PATH}` });
    return links;
}

export function useHostedPlannerPlatform(): PlannerPlatform {
    const router = useRouter();
    return useMemo<PlannerPlatform>(
        () => ({
            Link: HostedLink,
            Image: HostedImage,
            navigate: (href: string) => router.push(href),
            routes: hostedPlannerRoutes,
            planGenerator: "openleague-hosted",
            planLinks: hostedPlanLinks(),
        }),
        [router],
    );
}
