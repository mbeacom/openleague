import { describe, expect, it } from "vitest";
import { PLANNER_CSP, resolveHostedUrl } from "@/apps/planner/build-config";

describe("resolveHostedUrl", () => {
    it("defaults to the hosted platform", () => {
        expect(resolveHostedUrl(undefined)).toBe("https://openl.app");
        expect(resolveHostedUrl("  ")).toBe("https://openl.app");
    });

    it("trims whitespace and trailing slashes", () => {
        expect(resolveHostedUrl(" https://example.org/// ")).toBe("https://example.org");
    });

    it("allows http only for localhost", () => {
        expect(resolveHostedUrl("http://localhost:3000")).toBe("http://localhost:3000");
        expect(() => resolveHostedUrl("http://openl.app")).toThrow(/must be https/);
        expect(() => resolveHostedUrl("not a url")).toThrow(/not a URL/);
    });
});

describe("PLANNER_CSP", () => {
    it("allows only same-origin scripts and the two font hosts", () => {
        expect(PLANNER_CSP).toContain("script-src 'self'");
        expect(PLANNER_CSP).toContain("connect-src 'self'");
        expect(PLANNER_CSP).toContain("https://api.fontshare.com");
        expect(PLANNER_CSP).toContain("https://fonts.gstatic.com");
        expect(PLANNER_CSP).not.toMatch(/unsafe-eval/);
        expect(PLANNER_CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    });
});
