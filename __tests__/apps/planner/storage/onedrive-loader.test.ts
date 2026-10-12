/**
 * The OneDrive stand-in in the entry chunk (storage connectors spec R6, R9):
 * the real connector (and MSAL) load only on first use, the app has OneDrive
 * only when a client id was built in, and the redirect page's address follows
 * the planner's own.
 */
import { describe, expect, it, vi } from "vitest";
import { createLazyOneDriveConnector, isOneDriveConnector, redirectUriFor } from "@/apps/planner/src/storage/onedrive-loader";
import { createMsalAuth, createOneDriveConnector } from "@/apps/planner/src/storage/onedrive";
import { createStorageService } from "@/apps/planner/src/storage/service";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { ONEDRIVE_SETTINGS } from "@/apps/planner/src/config";
import { createFakeGraph, createFakeMsal } from "./fake-graph";

const CLIENT_ID = "00000000-0000-4000-8000-000000000001";

function fakeModule(options: { signedIn?: boolean } = {}) {
    const graph = createFakeGraph();
    const msal = createFakeMsal(graph, options);
    const createOneDriveFromConfig = vi.fn(({ clientId, accounts, redirectUri }: { clientId: string; accounts: "personal" | "any"; redirectUri: string }) =>
        createOneDriveConnector({ auth: createMsalAuth({ clientId, accounts, redirectUri, client: msal, interactive: () => false }), fetch: graph.fetch }),
    );
    return { graph, msal, module: { createOneDriveFromConfig } };
}

describe("lazy OneDrive connector", () => {
    it("loads nothing until it is used, and is configured but disconnected until then", async () => {
        const { module } = fakeModule();
        const load = vi.fn(async () => module);
        const connector = createLazyOneDriveConnector({ clientId: CLIENT_ID, redirectUri: "https://planner.example/planner/auth/redirect.html", load });
        expect(load).not.toHaveBeenCalled();
        expect(connector.status()).toBe("disconnected");
        expect(connector.capabilities).toEqual({ list: true, pick: false, delete: false, conditionalWrite: "atomic" });
        expect(isOneDriveConnector(connector)).toBe(true);
        expect(connector.prepared()).toBe(false);

        await connector.prepare();
        // Loaded: a sign-in popup can open straight from the next tap.
        expect(connector.prepared()).toBe(true);
        expect(load).toHaveBeenCalledTimes(1);
        // Personal accounts only unless the build says otherwise.
        expect(connector.accounts).toBe("personal");
        expect(module.createOneDriveFromConfig).toHaveBeenCalledWith({ clientId: CLIENT_ID, accounts: "personal", redirectUri: "https://planner.example/planner/auth/redirect.html" });
        // MSAL's cache held an account: connected once loaded.
        expect(connector.status()).toBe("connected");
        expect(connector.accountType()).toBe("personal");
        await connector.list();
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("passes an any-account build's audience to the real connector", async () => {
        const { module } = fakeModule();
        const connector = createLazyOneDriveConnector({ clientId: CLIENT_ID, accounts: "any", redirectUri: "https://x.example/auth/redirect.html", load: async () => module });
        expect(connector.accounts).toBe("any");
        await connector.prepare();
        expect(module.createOneDriveFromConfig).toHaveBeenCalledWith({ clientId: CLIENT_ID, accounts: "any", redirectUri: "https://x.example/auth/redirect.html" });
    });

    it("passes every call through to the real connector", async () => {
        const { module, graph } = fakeModule();
        const connector = createLazyOneDriveConnector({ clientId: CLIENT_ID, redirectUri: "https://x.example/auth/redirect.html", load: async () => module });
        const saved = await connector.save({ ref: null, name: "fall.rankings.json", text: "{}", kind: "openleague.rankings", documentId: "d", expectedRevision: null });
        if (!saved.ok) throw new Error(saved.error.code);
        expect(graph.item(saved.value.fileId)?.text).toBe("{}");
        const opened = await connector.open(saved.value);
        expect(opened.ok && opened.value.text).toBe("{}");
        await connector.disconnect();
        expect(connector.status()).toBe("disconnected");
    });

    it("says unavailable when the chunk fails to load, and tries again next time", async () => {
        const { module } = fakeModule();
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const load = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module")).mockResolvedValue(module);
        const connector = createLazyOneDriveConnector({ clientId: CLIENT_ID, redirectUri: "https://x.example/auth/redirect.html", load });
        expect(await connector.list()).toEqual({ ok: false, error: { code: "unavailable" } });
        expect(error).toHaveBeenCalledWith("OneDrive failed to load:", "TypeError");
        expect((await connector.list()).ok).toBe(true);
        expect(load).toHaveBeenCalledTimes(2);
        error.mockRestore();
    });

    it("puts the redirect page beside the planner's page, whatever the route or subpath", () => {
        expect(redirectUriFor("https://openleague.dev/planner/#/sessions/abc")).toBe("https://openleague.dev/planner/auth/redirect.html");
        expect(redirectUriFor("https://openleague.dev/planner/index.html?x=1#/rankings")).toBe("https://openleague.dev/planner/auth/redirect.html");
        expect(redirectUriFor("http://localhost:5173/planner/")).toBe("http://localhost:5173/planner/auth/redirect.html");
        expect(redirectUriFor("https://someone.github.io/fork/planner/")).toBe("https://someone.github.io/fork/planner/auth/redirect.html");
    });
});

describe("storage service and OneDrive", () => {
    const store = () => createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });

    it("has no OneDrive settings under tests, so no OneDrive", () => {
        expect(ONEDRIVE_SETTINGS).toBeNull();
        const service = createStorageService(store(), { pickers: null });
        expect(service.connector("onedrive")).toBeUndefined();
        expect(service.connectors).toEqual([]);
    });

    it("offers OneDrive when the build carries its settings, without loading it", async () => {
        vi.resetModules();
        vi.doMock("@/apps/planner/src/config", async (importOriginal) => ({
            ...(await importOriginal<typeof import("@/apps/planner/src/config")>()),
            ONEDRIVE_SETTINGS: { clientId: CLIENT_ID, accounts: "personal" },
        }));
        try {
            const { createStorageService: create } = await import("@/apps/planner/src/storage/service");
            const service = create(store(), { pickers: null });
            expect(service.connectors.map((connector) => connector.id)).toEqual(["onedrive"]);
            expect(service.connector("onedrive")?.status()).toBe("disconnected");
        } finally {
            vi.doUnmock("@/apps/planner/src/config");
            vi.resetModules();
        }
    });
});
