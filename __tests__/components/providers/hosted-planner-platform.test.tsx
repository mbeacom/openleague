/** The hosted platform is next/link, next/image and router.push, with today's paths (behaviour unchanged). */
import { describe, expect, it, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const captured = vi.hoisted(() => ({ link: null as Record<string, unknown> | null, image: null as Record<string, unknown> | null }));
vi.mock("next/link", () => ({
    default: (props: Record<string, unknown>) => {
        captured.link = props;
        return null;
    },
}));
vi.mock("next/image", () => ({
    default: (props: Record<string, unknown>) => {
        captured.image = props;
        return null;
    },
}));

import { HostedImage, HostedLink, hostedPlannerRoutes, useHostedPlannerPlatform } from "@/components/providers/hosted-planner-platform";

const ID = "csessionxxxxxxxxxxxxxxxxx";

describe("hosted planner platform", () => {
    it("builds today's practice-planner paths", () => {
        expect(hostedPlannerRoutes.list()).toBe("/practice-planner");
        expect(hostedPlannerRoutes.session(ID)).toBe(`/practice-planner/${ID}`);
        expect(hostedPlannerRoutes.sessionEdit(ID)).toBe(`/practice-planner/${ID}/edit`);
        expect(hostedPlannerRoutes.sessionPrint(ID)).toBe(`/practice-planner/${ID}/print`);
        expect(hostedPlannerRoutes.libraryNew()).toBe("/practice-planner/library/new");
        expect(hostedPlannerRoutes.libraryEdit(ID)).toBe(`/practice-planner/library/${ID}/edit`);
        expect(hostedPlannerRoutes.library()).toBe("/practice-planner/library");
        expect(hostedPlannerRoutes.libraryPlay(ID)).toBe(`/practice-planner/library/${ID}`);
        expect(hostedPlannerRoutes.sessionNewWithDrill(ID)).toBe(`/practice-planner/new?drill=${ID}`);
    });

    it("navigates with router.push", () => {
        const { result } = renderHook(() => useHostedPlannerPlatform());
        result.current.navigate("/practice-planner");
        expect(router.push).toHaveBeenCalledWith("/practice-planner");
        expect(result.current.routes).toBe(hostedPlannerRoutes);
        expect(result.current.Link).toBe(HostedLink);
        expect(result.current.Image).toBe(HostedImage);
    });

    it("renders links with next/link, forwarding every prop", () => {
        render(<HostedLink href="/practice-planner" className="back">Back</HostedLink>);
        expect(captured.link).toMatchObject({ href: "/practice-planner", className: "back", children: "Back" });
    });

    it("renders thumbnails with next/image exactly as the call sites did (fill, unoptimized, objectFit)", () => {
        render(<HostedImage src="data:image/png;base64,AA==" alt="Breakout" fit="cover" />);
        expect(captured.image).toEqual({
            src: "data:image/png;base64,AA==",
            alt: "Breakout",
            fill: true,
            style: { objectFit: "cover" },
            unoptimized: true,
        });
    });

    it("hands plans off with the copy-link item only when NEXT_PUBLIC_STATIC_PLANNER_URL is set", () => {
        try {
            vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "");
            expect(renderHook(() => useHostedPlannerPlatform()).result.current).toMatchObject({
                planGenerator: "openleague-hosted",
                planLink: null,
            });
            vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", " https://openleague.dev/planner/ ");
            expect(renderHook(() => useHostedPlannerPlatform()).result.current.planLink).toEqual({
                label: "Copy “Open in planner” link",
                mode: "copy",
                baseUrl: "https://openleague.dev/planner/",
            });
        } finally {
            vi.unstubAllEnvs();
        }
    });
});
