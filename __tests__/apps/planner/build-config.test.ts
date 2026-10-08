import { describe, expect, it } from "vitest";
import { PLANNER_CSP, plannerCsp, resolveHostedUrl } from "@/apps/planner/build-config";
import { resolveAiOrigins } from "@/apps/planner/ai-origins";

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
        expect(PLANNER_CSP).toContain("https://api.fontshare.com");
        expect(PLANNER_CSP).toContain("https://fonts.gstatic.com");
        expect(PLANNER_CSP).not.toMatch(/unsafe-eval/);
        expect(PLANNER_CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
        expect(PLANNER_CSP).toContain("form-action 'none'");
        expect(PLANNER_CSP).toContain("img-src 'self' data: blob:");
    });

    it("pins the public build's connect-src to the AI origin allowlist (ADR-0023)", () => {
        const connect = PLANNER_CSP.split("; ").filter((directive) => directive.startsWith("connect-src"));
        expect(connect).toEqual(["connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:*"]);
    });

    it("builds connect-src from a self-hosted list, and adds Trusted Types only when asked", () => {
        const csp = plannerCsp(resolveAiOrigins("https://models.example:8443"));
        expect(csp).toContain("http://127.0.0.1:* https://models.example:8443;");
        expect(csp).not.toContain("require-trusted-types-for");
        expect(plannerCsp(resolveAiOrigins(undefined), { trustedTypes: true })).toMatch(/; require-trusted-types-for 'script'$/);
    });
});
