import { describe, expect, it } from "vitest";
import { PLANNER_CSP, plannerCsp, resolveHostedUrl } from "@/apps/planner/build-config";
import { resolveAiOrigins } from "@/apps/planner/ai-origins";
import { MICROSOFT_AUTHORITIES, NO_CLOUD, resolveCloudSettings } from "@/apps/planner/cloud-config";

/** The public policy before cloud connectors existed, byte for byte. */
const POLICY_BEFORE_CONNECTORS =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; " +
    "font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com; img-src 'self' data: blob:; " +
    "connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:*; " +
    "object-src 'none'; base-uri 'self'; form-action 'none'";

/** Fictional values in each variable's shape. */
const GOOGLE_ENV = {
    OPENLEAGUE_GOOGLE_CLIENT_ID: "123-fictional.apps.googleusercontent.com",
    OPENLEAGUE_GOOGLE_API_KEY: "fictional-key_1",
    OPENLEAGUE_GOOGLE_APP_ID: "123456789",
};
const MICROSOFT_ENV = { OPENLEAGUE_MICROSOFT_CLIENT_ID: "00000000-0000-4000-8000-000000000000" };
const MICROSOFT_ANY_ENV = { ...MICROSOFT_ENV, OPENLEAGUE_MICROSOFT_ACCOUNTS: "any" };

const directive = (csp: string, name: string) => csp.split("; ").find((part) => part.startsWith(`${name} `)) ?? null;

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

describe("resolveCloudSettings", () => {
    it("builds no provider when nothing is set, or only blanks", () => {
        expect(resolveCloudSettings({})).toEqual(NO_CLOUD);
        expect(resolveCloudSettings({ OPENLEAGUE_GOOGLE_CLIENT_ID: " ", OPENLEAGUE_MICROSOFT_CLIENT_ID: "" })).toEqual(NO_CLOUD);
    });

    it("builds each provider from its own variables, trimmed", () => {
        expect(resolveCloudSettings({ ...GOOGLE_ENV, OPENLEAGUE_GOOGLE_APP_ID: " 123456789 " })).toEqual({
            google: { clientId: "123-fictional.apps.googleusercontent.com", apiKey: "fictional-key_1", appId: "123456789" },
            microsoft: null,
        });
        expect(resolveCloudSettings(MICROSOFT_ENV)).toEqual({ google: null, microsoft: { clientId: "00000000-0000-4000-8000-000000000000", accounts: "personal" } });
    });

    it("signs OneDrive in for personal accounts only unless OPENLEAGUE_MICROSOFT_ACCOUNTS is any", () => {
        expect(resolveCloudSettings({ ...MICROSOFT_ENV, OPENLEAGUE_MICROSOFT_ACCOUNTS: " " }).microsoft?.accounts).toBe("personal");
        expect(resolveCloudSettings({ ...MICROSOFT_ENV, OPENLEAGUE_MICROSOFT_ACCOUNTS: "personal" }).microsoft?.accounts).toBe("personal");
        expect(resolveCloudSettings({ ...MICROSOFT_ENV, OPENLEAGUE_MICROSOFT_ACCOUNTS: " any " }).microsoft?.accounts).toBe("any");
        // It has a default, so on its own it builds no connector.
        expect(resolveCloudSettings({ OPENLEAGUE_MICROSOFT_ACCOUNTS: "any" })).toEqual(NO_CLOUD);
        expect(MICROSOFT_AUTHORITIES).toEqual({ personal: "https://login.microsoftonline.com/consumers", any: "https://login.microsoftonline.com/common" });
    });

    it("fails an unknown OPENLEAGUE_MICROSOFT_ACCOUNTS, with or without a client id, without echoing it", () => {
        for (const env of [{ ...MICROSOFT_ENV, OPENLEAGUE_MICROSOFT_ACCOUNTS: "fictional-tenant" }, { OPENLEAGUE_MICROSOFT_ACCOUNTS: "fictional-tenant" }, { ...MICROSOFT_ENV, OPENLEAGUE_MICROSOFT_ACCOUNTS: "common" }]) {
            let message = "";
            try {
                resolveCloudSettings(env);
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).toBe("OPENLEAGUE_MICROSOFT_ACCOUNTS must be personal or any.");
        }
    });

    it("fails a half-configured Google Drive, naming what's missing", () => {
        expect(() => resolveCloudSettings({ OPENLEAGUE_GOOGLE_CLIENT_ID: GOOGLE_ENV.OPENLEAGUE_GOOGLE_CLIENT_ID })).toThrow(
            /missing OPENLEAGUE_GOOGLE_API_KEY, OPENLEAGUE_GOOGLE_APP_ID/,
        );
    });

    it("fails a value of the wrong shape without echoing it", () => {
        expect(() => resolveCloudSettings({ ...GOOGLE_ENV, OPENLEAGUE_GOOGLE_CLIENT_ID: "not-a-client" })).toThrow(/OPENLEAGUE_GOOGLE_CLIENT_ID must be/);
        expect(() => resolveCloudSettings({ ...GOOGLE_ENV, OPENLEAGUE_GOOGLE_APP_ID: "project-name" })).toThrow(/project number/);
        let message = "";
        try {
            resolveCloudSettings({ ...GOOGLE_ENV, OPENLEAGUE_GOOGLE_API_KEY: "secret value" });
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).toMatch(/OPENLEAGUE_GOOGLE_API_KEY must be/);
        expect(message).not.toContain("secret value");
        expect(() => resolveCloudSettings({ OPENLEAGUE_MICROSOFT_CLIENT_ID: "fictional" })).toThrow(/GUID/);
    });
});

describe("plannerCsp with cloud connectors (spec R9, Security and privacy)", () => {
    const origins = resolveAiOrigins(undefined);

    it("is byte-identical to the policy before connectors when none is configured", () => {
        expect(plannerCsp(origins)).toBe(POLICY_BEFORE_CONNECTORS);
        expect(plannerCsp(origins, { cloud: NO_CLOUD })).toBe(POLICY_BEFORE_CONNECTORS);
        expect(plannerCsp(origins, { cloud: resolveCloudSettings({}) })).toBe(POLICY_BEFORE_CONNECTORS);
        expect(plannerCsp(origins, { cloud: resolveCloudSettings({ OPENLEAGUE_MICROSOFT_ACCOUNTS: "personal" }) })).toBe(POLICY_BEFORE_CONNECTORS);
        expect(PLANNER_CSP).toBe(POLICY_BEFORE_CONNECTORS);
        expect(POLICY_BEFORE_CONNECTORS).not.toContain("frame-src");
    });

    it("adds exactly Google's hosts for Google Drive", () => {
        const csp = plannerCsp(origins, { cloud: resolveCloudSettings(GOOGLE_ENV) });
        expect(directive(csp, "script-src")).toBe("script-src 'self' https://apis.google.com https://accounts.google.com/gsi/client");
        expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com https://accounts.google.com/gsi/style");
        expect(directive(csp, "connect-src")).toBe(
            "connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:* " +
                "https://accounts.google.com/gsi/ https://www.googleapis.com https://content.googleapis.com https://oauth2.googleapis.com",
        );
        expect(directive(csp, "frame-src")).toBe("frame-src 'self' https://docs.google.com https://accounts.google.com/gsi/ https://content.googleapis.com");
        expect(csp).not.toContain("microsoft");
        // Everything else is unchanged.
        for (const name of ["default-src", "font-src", "img-src", "object-src", "base-uri", "form-action"]) {
            expect(directive(csp, name)).toBe(directive(POLICY_BEFORE_CONNECTORS, name));
        }
    });

    it("adds exactly Microsoft's personal-account hosts for OneDrive, with 'self' in frame-src for the silent-renewal page", () => {
        const csp = plannerCsp(origins, { cloud: resolveCloudSettings(MICROSOFT_ENV) });
        expect(directive(csp, "script-src")).toBe("script-src 'self'");
        expect(directive(csp, "connect-src")).toBe(
            "connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:*" +
                " https://login.microsoftonline.com https://graph.microsoft.com https://*.files.1drv.com https://my.microsoftpersonalcontent.com",
        );
        expect(csp).not.toContain("sharepoint.com");
        // login.live.com: a personal account's sign-in hop inside the silent-renewal iframe (phase 4a).
        expect(directive(csp, "frame-src")).toBe("frame-src 'self' https://login.microsoftonline.com https://login.live.com");
        expect(csp).not.toContain("google.com");
        expect(csp).toContain("form-action 'none'");
    });

    it("adds work or school accounts' SharePoint download host only for an any-account build", () => {
        const csp = plannerCsp(origins, { cloud: resolveCloudSettings(MICROSOFT_ANY_ENV) });
        expect(directive(csp, "connect-src")).toBe(
            "connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:*" +
                " https://login.microsoftonline.com https://graph.microsoft.com https://*.files.1drv.com https://my.microsoftpersonalcontent.com https://*.sharepoint.com",
        );
        expect(directive(csp, "frame-src")).toBe("frame-src 'self' https://login.microsoftonline.com https://login.live.com");
    });

    it("merges both providers into one frame-src that starts with 'self'", () => {
        const csp = plannerCsp(origins, { cloud: resolveCloudSettings({ ...GOOGLE_ENV, ...MICROSOFT_ENV }) });
        expect(csp.split("; ").filter((part) => part.startsWith("frame-src"))).toEqual([
            "frame-src 'self' https://docs.google.com https://accounts.google.com/gsi/ https://content.googleapis.com https://login.microsoftonline.com https://login.live.com",
        ]);
        expect(directive(csp, "connect-src")).toMatch(/https:\/\/oauth2\.googleapis\.com https:\/\/login\.microsoftonline\.com https:\/\/graph\.microsoft\.com .*https:\/\/my\.microsoftpersonalcontent\.com$/);
        expect(directive(plannerCsp(origins, { cloud: resolveCloudSettings({ ...GOOGLE_ENV, ...MICROSOFT_ANY_ENV }) }), "connect-src")).toMatch(/https:\/\/\*\.sharepoint\.com$/);
    });
});
