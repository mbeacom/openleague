/**
 * auth/redirect.html (storage connectors spec R6): the page Microsoft sign-in
 * popups and the silent-renewal iframe end on. It must run only MSAL's
 * redirect bridge, never the app, and be a build entry deployed at
 * /planner/auth/redirect.html. (The built page is checked by
 * scripts/check-planner-build.ts.)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (file: string) => readFile(path.join(ROOT, file), "utf8");

const bridge = vi.hoisted(() => ({ broadcastResponseToMainFrame: vi.fn(async () => undefined) }));
vi.mock("@azure/msal-browser/redirect-bridge", () => bridge);

describe("auth/redirect.html", () => {
    it("loads one script, the bridge module, and nothing of the app", async () => {
        const html = await read("apps/planner/auth/redirect.html");
        const scripts = Array.from(html.matchAll(/<script\b[^>]*>/g), (match) => match[0]);
        expect(scripts).toEqual(['<script type="module" src="../src/auth/redirect.ts">']);
        expect(html).not.toMatch(/main\.tsx|id="root"|<link\b[^>]*stylesheet/);
        expect(html).toContain("<title>Signing in</title>");
    });

    it("imports only MSAL's redirect bridge", async () => {
        const source = await read("apps/planner/src/auth/redirect.ts");
        const imports = Array.from(source.matchAll(/^import\b[^;]*?from\s+"([^"]+)"/gm), (match) => match[1]);
        expect(imports).toEqual(["@azure/msal-browser/redirect-bridge"]);
    });

    it("hands the response to the planner window", async () => {
        await import("@/apps/planner/src/auth/redirect");
        expect(bridge.broadcastResponseToMainFrame).toHaveBeenCalledTimes(1);
    });

    it("logs only the error's name when the response can't be delivered", async () => {
        vi.resetModules();
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        bridge.broadcastResponseToMainFrame.mockRejectedValueOnce(Object.assign(new Error("code=secret"), { name: "BrowserAuthError" }));
        await import("@/apps/planner/src/auth/redirect");
        await vi.waitFor(() => expect(error).toHaveBeenCalledWith("Sign-in response not delivered:", "BrowserAuthError"));
        error.mockRestore();
    });

    it("is a build entry beside index.html, so it deploys at /planner/auth/redirect.html", async () => {
        const config = await read("apps/planner/vite.config.ts");
        expect(config).toMatch(/"auth-redirect": path\.join\(ROOT, "apps\/planner\/auth\/redirect\.html"\)/);
        expect(config).toMatch(/main: path\.join\(ROOT, "apps\/planner\/index\.html"\)/);
    });
});
