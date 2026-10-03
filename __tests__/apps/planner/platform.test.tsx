import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaticImage, StaticLink, navigateTo, staticPlannerPlatform } from "@/apps/planner/src/platform";
import { staticRoutes } from "@/apps/planner/src/routes";
import { HOSTED_IMPORT_URL } from "@/apps/planner/src/config";

afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = "";
});

describe("static planner platform", () => {
    it("fills its positioned parent the way next/image's fill does", () => {
        render(
            <div style={{ position: "relative", width: 160, height: 90 }}>
                <StaticImage src="data:image/png;base64,AAAA" alt="Breakout" fit="cover" />
            </div>,
        );
        const img = screen.getByAltText("Breakout");
        expect(img).toHaveStyle({ position: "absolute", width: "100%", height: "100%", objectFit: "cover" });
        expect([img.style.top, img.style.left, img.style.right, img.style.bottom]).toEqual(["0px", "0px", "0px", "0px"]);
    });

    it("renders links as plain anchors with hash hrefs", () => {
        render(<StaticLink href={staticRoutes.library()} className="nav">Library</StaticLink>);
        const link = screen.getByRole("link", { name: "Library" });
        expect(link).toHaveAttribute("href", "#/library");
        expect(link).toHaveClass("nav");
    });

    it("navigates hash routes by setting location.hash", () => {
        navigateTo("#/sessions/s-1");
        expect(window.location.hash).toBe("#/sessions/s-1");
    });

    it("navigates an absolute URL with location.assign (the hand-off when a popup is blocked)", () => {
        const assign = vi.fn();
        vi.stubGlobal("location", { ...window.location, assign });
        navigateTo("https://openl.app/practice-planner/import#plan=x");
        expect(assign).toHaveBeenCalledExactlyOnceWith("https://openl.app/practice-planner/import#plan=x");
    });

    it("is a module constant with the static generator and the hosted import hand-off", () => {
        expect(staticPlannerPlatform).toMatchObject({
            Link: StaticLink,
            Image: StaticImage,
            navigate: navigateTo,
            routes: staticRoutes,
            planGenerator: "openleague-static",
            planLink: { label: "Open in OpenLeague", mode: "open", baseUrl: HOSTED_IMPORT_URL },
        });
        expect(HOSTED_IMPORT_URL).toBe("https://openl.app/practice-planner/import");
    });
});
