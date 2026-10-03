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

export const hostedPlannerRoutes: PlannerRoutes = {
    list: () => "/practice-planner",
    session: (id) => `/practice-planner/${id}`,
    sessionEdit: (id) => `/practice-planner/${id}/edit`,
    sessionPrint: (id) => `/practice-planner/${id}/print`,
    libraryNew: () => "/practice-planner/library/new",
    libraryEdit: (playId) => `/practice-planner/library/${playId}/edit`,
};

/** next/link: keeps prefetch and client-side navigation. */
export function HostedLink(props: PlannerLinkProps) {
    return <NextLink {...props} />;
}

/** Thumbnails are base64 data URLs: unoptimized, exactly as every call site passed before the seam. */
export function HostedImage({ src, alt, fit }: PlannerImageProps) {
    return <NextImage src={src} alt={alt} fill style={{ objectFit: fit }} unoptimized />;
}

/**
 * The Export menu's "Open in planner" item, only when the static planner's URL
 * is configured. Next inlines NEXT_PUBLIC_* at build; tests stub the env.
 */
export function hostedPlanLink(url: string | undefined = process.env.NEXT_PUBLIC_STATIC_PLANNER_URL): PlannerPlanLink | null {
    const baseUrl = url?.trim();
    return baseUrl ? { label: "Copy “Open in planner” link", mode: "copy", baseUrl } : null;
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
            planLink: hostedPlanLink(),
        }),
        [router],
    );
}
