import { describe, expect, it } from "vitest";
import { PUBLIC_AI_ORIGINS, aiConnectSrc, resolveAiOrigins } from "@/apps/planner/ai-origins";

const PUBLIC_CONNECT_SRC = "connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:*";

describe("resolveAiOrigins", () => {
    it("is the public list when nothing is added", () => {
        expect(resolveAiOrigins(undefined)).toEqual([...PUBLIC_AI_ORIGINS]);
        expect(resolveAiOrigins(" , ")).toEqual([...PUBLIC_AI_ORIGINS]);
        expect(aiConnectSrc(resolveAiOrigins(undefined))).toBe(PUBLIC_CONNECT_SRC);
    });

    it("adds exact https origins, trimmed and without duplicates", () => {
        const list = resolveAiOrigins(" https://models.example:8443 ,https://models.example:8443, https://api.openai.com");
        expect(list).toEqual([...PUBLIC_AI_ORIGINS, "https://models.example:8443"]);
        expect(aiConnectSrc(list)).toBe(`${PUBLIC_CONNECT_SRC} https://models.example:8443`);
    });

    it.each([
        ["http for a non-loopback host", "http://models.example", /must be https/],
        ["a path", "https://models.example/v1", /exact origin/],
        ["a trailing slash", "https://models.example/", /exact origin/],
        ["user info", "https://coach@models.example", /exact origin/],
        ["a wildcard host", "https://*.models.example", /wildcards/],
        ["a wildcard port", "https://models.example:*", /wildcards/],
        ["a query", "https://models.example?x=1", /exact origin/],
        ["not a URL", "models.example", /not a URL/],
    ])("fails the build on %s", (_label, entry, message) => {
        expect(() => resolveAiOrigins(entry)).toThrow(message);
    });
});
