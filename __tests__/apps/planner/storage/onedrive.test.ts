/**
 * The OneDrive connector (storage connectors spec R6, Testing) over a fake
 * Graph app folder and a fake MSAL client. Made-up coaches and programs only.
 */
import { describe, expect, it } from "vitest";
import { DOCUMENT_KINDS, ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import {
    GRAPH_ROOT,
    microsoftAuthority,
    ONEDRIVE_SCOPES,
    authErrorOf,
    candidateNames,
    createMsalAuth,
    createOneDriveConnector,
    kindOfFileName,
    msalConfiguration,
    retryAfterSeconds,
} from "@/apps/planner/src/storage/onedrive";
import type { RemoteFile, SaveInput } from "@/apps/planner/src/storage/connector";
import { describeConnectorContract } from "./connector-contract";
import { DOWNLOAD_ORIGIN, WORK_TENANT_ID, createFakeGraph, createFakeMsal } from "./fake-graph";

const REDIRECT = "https://planner.example/planner/auth/redirect.html";
const KIND = "openleague.rankings";
const DOC = "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11";

function subject({ signedIn = true, tenantId, interactive = false }: { signedIn?: boolean; tenantId?: string; interactive?: boolean } = {}) {
    const graph = createFakeGraph();
    const msal = createFakeMsal(graph, { signedIn, ...(tenantId ? { tenantId } : {}) });
    // A work or school tenant signs in only through an `any` build's /common authority.
    const accounts = tenantId ? "any" : "personal";
    const auth = createMsalAuth({ clientId: "00000000-0000-4000-8000-000000000001", accounts, redirectUri: REDIRECT, client: msal, interactive: () => interactive });
    const connector = createOneDriveConnector({ auth, fetch: graph.fetch });
    return { graph, msal, auth, connector };
}

async function ready() {
    const made = subject();
    await made.connector.ready();
    return made;
}

const create = (name: string, text = '{"a":1}\n'): SaveInput => ({ ref: null, name, text, kind: KIND, documentId: DOC, expectedRevision: null });
const overwrite = (file: RemoteFile, text: string, expectedRevision: string | null): SaveInput => ({
    ref: { connector: "onedrive", fileId: file.fileId, name: file.name },
    name: file.name,
    text,
    kind: KIND,
    documentId: DOC,
    expectedRevision,
});

async function created(connector: Awaited<ReturnType<typeof ready>>["connector"], name = "fall.rankings.json", text = '{"a":1}\n') {
    const result = await connector.save(create(name, text));
    if (!result.ok) throw new Error(`create failed: ${result.error.code}`);
    return result.value;
}

describeConnectorContract("OneDrive (app folder)", async () => {
    const { graph, msal, connector } = await ready();
    return {
        connector,
        rename: async (ref, name) => graph.rename(ref.fileId, name),
        removeRemote: async (ref) => graph.remove(ref.fileId),
        overwriteRemote: async (ref, text) => graph.overwrite(ref.fileId, text),
        withdrawAuth: () => {
            graph.revokeTokens();
            msal.blockSilent();
        },
        goOffline: () => graph.setOffline(true),
    };
});

describe("OneDrive connector", () => {
    it("says it writes atomically, lists its folder and has no picker", async () => {
        const { connector } = await ready();
        expect(connector.id).toBe("onedrive");
        expect(connector.capabilities).toEqual({ list: true, pick: false, delete: false, conditionalWrite: "atomic" });
        expect(await connector.pickToOpen()).toEqual({ ok: true, value: [] });
    });

    it("creates files in the app folder, refusing to replace a file of the same name", async () => {
        const { connector, graph } = await ready();
        graph.seed("fall.rankings.json", "{}");
        const file = await created(connector, "fall.rankings.json");
        expect(file.name).toBe("fall (2).rankings.json");
        const puts = graph.requests.filter((request) => request.method === "PUT");
        expect(puts.map((request) => request.url)).toEqual([
            `${GRAPH_ROOT}/me/drive/special/approot:/fall.rankings.json:/content?@microsoft.graph.conflictBehavior=fail`,
            `${GRAPH_ROOT}/me/drive/special/approot:/fall%20(2).rankings.json:/content?@microsoft.graph.conflictBehavior=fail`,
        ]);
        expect(puts.every((request) => request.headers["if-match"] === undefined)).toBe(true);
    });

    it("uses the cTag as the revision, and sends If-Match with it on every overwrite", async () => {
        const { connector, graph } = await ready();
        const file = await created(connector);
        expect(file.revision).toBe(graph.item(file.fileId)?.cTag);
        expect(file).toMatchObject({ driveId: "drive-1", modifiedBy: "Coach Avery", kind: KIND });

        const first = await connector.save(overwrite(file, '{"a":2}\n', file.revision));
        if (!first.ok) throw new Error("save failed");
        await connector.save(overwrite(first.value, '{"a":3}\n', first.value.revision));
        const overwrites = graph.requests.filter((request) => request.method === "PUT" && request.url.includes("/me/drive/items/"));
        expect(overwrites).toHaveLength(2);
        expect(overwrites.map((request) => request.headers["if-match"])).toEqual([file.revision, first.value.revision]);
        expect(overwrites[0].url).toBe(`${GRAPH_ROOT}/me/drive/items/${file.fileId}/content`);
    });

    it("turns a 412 into a conflict carrying the current remote, and writes nothing", async () => {
        const { connector, graph } = await ready();
        const file = await created(connector);
        graph.overwrite(file.fileId, '{"theirs":true}\n', "Coach Jordan");
        const result = await connector.save(overwrite(file, '{"mine":true}\n', file.revision));
        if (result.ok || result.error.code !== "conflict") throw new Error("expected a conflict");
        expect(result.error.remote).toMatchObject({ revision: graph.item(file.fileId)?.cTag, modifiedBy: "Coach Jordan" });
        expect(graph.item(file.fileId)?.text).toBe('{"theirs":true}\n');
    });

    it("reports a conflict without writing when an overwrite has no expected revision", async () => {
        const { connector, graph } = await ready();
        const file = await created(connector);
        const result = await connector.save(overwrite(file, "{}", null));
        expect(result.ok === false && result.error.code).toBe("conflict");
        expect(graph.requests.filter((request) => request.method === "PUT")).toHaveLength(1);
    });

    it("reads through the pre-authenticated download URL, with no token, cookies or referrer", async () => {
        const { connector, graph } = await ready();
        const file = await created(connector, "fall.rankings.json", '{"title":"Fall"}\n');
        graph.requests.length = 0;
        const opened = await connector.open(file);
        expect(opened.ok && opened.value.text).toBe('{"title":"Fall"}\n');
        const download = graph.requests.find((request) => request.url.startsWith(DOWNLOAD_ORIGIN));
        expect(download?.headers.authorization).toBeUndefined();
        const meta = graph.requests.find((request) => request.url.includes("@microsoft.graph.downloadUrl"));
        expect(meta?.headers.authorization).toMatch(/^Bearer token-/);
    });

    it("says offline when the download breaks after the response began", async () => {
        const graph = createFakeGraph();
        const msal = createFakeMsal(graph, { signedIn: true });
        const auth = createMsalAuth({ clientId: "00000000-0000-4000-8000-000000000001", redirectUri: REDIRECT, client: msal, interactive: () => false });
        const brokenBody: typeof fetch = async (input, init) => {
            const response = await graph.fetch(input, init);
            if (!String(input).startsWith(DOWNLOAD_ORIGIN)) return response;
            return new Response(new ReadableStream({ start: (controller) => controller.error(new TypeError("network")) }), { status: 200 });
        };
        const connector = createOneDriveConnector({ auth, fetch: brokenBody });
        await connector.ready();
        const file = await created(connector);
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "offline" } });
    });

    it("reads again when the file moves between the metadata and the download", async () => {
        const { connector, graph } = await ready();
        const file = await created(connector, "fall.rankings.json", '{"v":1}\n');
        graph.beforeNextDownload(() => graph.overwrite(file.fileId, '{"v":2}\n'));
        const opened = await connector.open(file);
        if (!opened.ok) throw new Error("open failed");
        expect(opened.value.text).toBe('{"v":2}\n');
        expect(opened.value.file.revision).toBe(graph.item(file.fileId)?.cTag);
    });

    it("refuses a file larger than any document from its metadata, without downloading it", async () => {
        const { connector, graph } = await ready();
        const limit = Math.max(...Object.values(DOCUMENT_KINDS).map((entry) => entry.maxBytes)) + ENVELOPE_OVERHEAD_BYTES;
        const big = graph.seed("huge.rankings.json", "x".repeat(limit + 1));
        graph.requests.length = 0;
        expect(await connector.open({ connector: "onedrive", fileId: big.id, name: big.name })).toEqual({ ok: false, error: { code: "too-large" } });
        expect(graph.requests.some((request) => request.url.startsWith(DOWNLOAD_ORIGIN))).toBe(false);
    });

    it("lists only OpenLeague documents in the app folder, across pages", async () => {
        const { connector, graph } = await ready();
        graph.seed("fall.rankings.json", "{}");
        graph.seed("tuesday-skills.olplan.yaml", "{}");
        graph.seed("notes.txt", "x");
        graph.seed("winter.rankings.toml", "{}");
        graph.setPageSize(2);
        const all = await connector.list();
        expect(all.ok && all.value.map((file) => file.name).sort()).toEqual(["fall.rankings.json", "tuesday-skills.olplan.yaml", "winter.rankings.toml"]);
        const rankings = await connector.list({ kind: KIND });
        expect(rankings.ok && rankings.value.map((file) => file.name).sort()).toEqual(["fall.rankings.json", "winter.rankings.toml"]);
    });

    it("never sends the token to a next page outside Graph", async () => {
        const { connector, graph } = await ready();
        graph.seed("fall.rankings.json", "{}");
        graph.setForeignNextLink("https://elsewhere.example/steal");
        const listed = await connector.list();
        expect(listed.ok && listed.value).toHaveLength(1);
        expect(graph.requests.some((request) => new URL(request.url).hostname === "elsewhere.example")).toBe(false);
    });

    it("renews the token once on a 401, then asks for sign-in", async () => {
        const { connector, graph, msal } = await ready();
        const file = await created(connector);
        graph.revokeTokens();
        // Silent renewal still works: the retry with a fresh token succeeds.
        const opened = await connector.open(file);
        expect(opened.ok).toBe(true);
        expect(msal.silentCalls.some((call) => call.forceRefresh === true)).toBe(true);
        expect(msal.silentCalls.every((call) => call.redirectUri === REDIRECT)).toBe(true);

        graph.revokeTokens();
        msal.blockSilent();
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "auth-required" } });
        expect(msal.popups).toBe(0);
    });

    it("maps Graph's errors to codes, with Retry-After for throttling", async () => {
        const { connector, graph } = await ready();
        const file = await created(connector);
        graph.failNext(403);
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "forbidden" } });
        graph.failNext(429, "7");
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "unavailable", retryAfterSeconds: 7 } });
        graph.failNext(503);
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "unavailable" } });
        graph.failNext(507);
        expect(await connector.save(overwrite(file, "{}", file.revision))).toEqual({ ok: false, error: { code: "quota" } });
        graph.failNext(413);
        expect(await connector.save(overwrite(file, "{}", file.revision))).toEqual({ ok: false, error: { code: "too-large" } });
        graph.failNext(500);
        expect(await connector.list()).toEqual({ ok: false, error: { code: "provider", status: 500 } });
        graph.setOffline(true);
        expect(await connector.list()).toEqual({ ok: false, error: { code: "offline" } });
    });

    it("signs in by popup on connect, and opens (or creates) the app folder", async () => {
        const { connector, graph, msal } = subject({ signedIn: false });
        await connector.ready();
        expect(connector.status()).toBe("disconnected");
        expect(connector.accountType()).toBeNull();
        expect(await connector.connect()).toEqual({ ok: true, value: undefined });
        expect(msal.popups).toBe(1);
        expect(connector.status()).toBe("connected");
        expect(connector.accountType()).toBe("personal");
        expect(graph.requests.some((request) => request.url === `${GRAPH_ROOT}/me/drive/special/approot?$select=id`)).toBe(true);
    });

    it("reports a cancelled sign-in as cancelled", async () => {
        const { connector, msal } = subject({ signedIn: false });
        msal.cancelNextPopup();
        expect(await connector.connect()).toEqual({ ok: false, error: { code: "cancelled" } });
        expect(connector.status()).toBe("disconnected");
    });

    it("says plainly when a work or school account can't have the app folder", async () => {
        const { connector, graph } = subject({ signedIn: false, tenantId: WORK_TENANT_ID });
        graph.blockAppFolder(403);
        expect(await connector.connect()).toEqual({ ok: false, error: { code: "app-folder-unavailable" } });
        expect(connector.accountType()).toBe("work");
        expect(await connector.list()).toEqual({ ok: false, error: { code: "app-folder-unavailable" } });
        expect(await connector.save(create("fall.rankings.json"))).toEqual({ ok: false, error: { code: "app-folder-unavailable" } });
    });

    it("treats the same refusal for a personal account as forbidden", async () => {
        const { connector, graph } = await ready();
        graph.blockAppFolder(403);
        expect(await connector.list()).toEqual({ ok: false, error: { code: "forbidden" } });
    });

    it("disconnect clears MSAL's cache for the account", async () => {
        const { connector } = await ready();
        expect(connector.status()).toBe("connected");
        await connector.disconnect();
        expect(connector.status()).toBe("disconnected");
        expect(await connector.list()).toEqual({ ok: false, error: { code: "auth-required" } });
    });
});

describe("OneDrive sign-in (MSAL)", () => {
    it("asks for the app folder and sign-in only", () => {
        expect(ONEDRIVE_SCOPES).toEqual(["Files.ReadWrite.AppFolder", "User.Read"]);
    });

    it("signs in through /consumers for personal accounts only, and /common for any account", () => {
        expect(microsoftAuthority("personal")).toBe("https://login.microsoftonline.com/consumers");
        expect(microsoftAuthority("any")).toBe("https://login.microsoftonline.com/common");
    });

    it("falls back to a popup only when the call comes from a tap", async () => {
        const graph = createFakeGraph();
        const msal = createFakeMsal(graph);
        let tapping = false;
        const auth = createMsalAuth({ clientId: "x", redirectUri: REDIRECT, client: msal, interactive: () => tapping });
        msal.blockSilent();
        expect(await auth.token()).toEqual({ ok: false, error: { code: "auth-required" } });
        expect(msal.popups).toBe(0);
        tapping = true;
        const token = await auth.token();
        expect(token.ok).toBe(true);
        expect(msal.popups).toBe(1);
    });

    it("maps MSAL's errors without keeping their messages", () => {
        expect(authErrorOf({ errorCode: "user_cancelled", message: "coach@example.org" })).toEqual({ code: "cancelled" });
        expect(authErrorOf({ errorCode: "no_network_connectivity" })).toEqual({ code: "offline" });
        expect(authErrorOf({ errorCode: "popup_window_error" })).toEqual({ code: "auth-required" });
        expect(authErrorOf({ errorCode: "interaction_required" })).toEqual({ code: "auth-required" });
        expect(authErrorOf(new Error("anything"))).toEqual({ code: "auth-required" });
    });

    it("keeps MSAL's cache in sessionStorage, with the redirect bridge for popups and renewal", () => {
        expect(msalConfiguration("00000000-0000-4000-8000-000000000001", REDIRECT)).toEqual({
            auth: { clientId: "00000000-0000-4000-8000-000000000001", authority: "https://login.microsoftonline.com/consumers", redirectUri: REDIRECT, postLogoutRedirectUri: REDIRECT },
            cache: { cacheLocation: "sessionStorage" },
        });
        expect(msalConfiguration("00000000-0000-4000-8000-000000000001", REDIRECT, "personal").auth.authority).toBe("https://login.microsoftonline.com/consumers");
        expect(msalConfiguration("00000000-0000-4000-8000-000000000001", REDIRECT, "any").auth.authority).toBe("https://login.microsoftonline.com/common");
    });
});

describe("OneDrive helpers", () => {
    it("tells documents apart by their names", () => {
        expect(kindOfFileName("tuesday.olplan.json")).toBe("openleague.practice-plan");
        expect(kindOfFileName("fall.rankings.YAML")).toBe("openleague.rankings");
        expect(kindOfFileName("fall.json")).toBeUndefined();
    });

    it("numbers a taken name before the document extension", () => {
        expect(candidateNames("fall.rankings.json").slice(0, 3)).toEqual(["fall.rankings.json", "fall (2).rankings.json", "fall (3).rankings.json"]);
        expect(candidateNames("fall.rankings.json")).toHaveLength(9);
    });

    it("reads Retry-After as seconds or a date", () => {
        expect(retryAfterSeconds("12")).toBe(12);
        expect(retryAfterSeconds(new Date(Date.parse("2026-10-11T12:00:30Z")).toUTCString(), Date.parse("2026-10-11T12:00:00Z"))).toBe(30);
        expect(retryAfterSeconds(null)).toBeUndefined();
        expect(retryAfterSeconds("soon")).toBeUndefined();
    });
});
