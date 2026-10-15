/**
 * A fake Microsoft Graph app folder and a fake MSAL client for the OneDrive
 * connector's tests (storage connectors spec, Testing). The fake follows the
 * documented shapes: driveItems with eTag and cTag (a rename moves the eTag,
 * not the cTag), `If-Match` and 412 on content PUTs, `conflictBehavior=fail`
 * and 409 on creates, paged children with `@odata.nextLink`, pre-authenticated
 * download URLs that refuse an Authorization header, 401 for a bad token, and
 * throttling with Retry-After. Folders inside the app folder (one level,
 * the kind subfolders) answer 404 to a create under a folder that doesn't
 * exist yet, as a path upload into a missing parent does here. CI makes no
 * calls to Microsoft.
 */
import type { AccountInfo, AuthenticationResult } from "@azure/msal-browser";
import { GRAPH_ROOT, PERSONAL_ACCOUNT_TENANT_ID, type MsalClient } from "@/apps/planner/src/storage/onedrive";

export const DOWNLOAD_ORIGIN = "https://public.fake.files.1drv.com";
export const WORK_TENANT_ID = "11111111-2222-4333-8444-555555555555";

interface FakeItem {
    id: string;
    /** The subfolder of the app folder it is in; "" for the top. */
    parent: string;
    name: string;
    text: string;
    cTag: string;
    eTag: string;
    modifiedAt: string;
    by: string;
}

export interface GraphRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
}

export interface FakeGraph {
    fetch: typeof fetch;
    requests: GraphRequest[];
    /** A token MSAL hands out; only issued tokens are accepted. */
    issueToken: () => string;
    revokeTokens: () => void;
    setOffline: (offline: boolean) => void;
    /** The app folder refuses this account (a work or school tenant that blocks it). */
    blockAppFolder: (status: number) => void;
    /** The next Graph response has this status (and Retry-After, when given). */
    failNext: (status: number, retryAfter?: string) => void;
    /** Children pages hold at most this many items. */
    setPageSize: (size: number) => void;
    /** A nextLink pointing away from Graph, to check the token never follows it. */
    setForeignNextLink: (url: string | null) => void;
    /** "Practices/x.olplan.json" seeds into a subfolder (made if needed). */
    seed: (name: string, text: string, by?: string) => FakeItem;
    /** The subfolders that exist. */
    folders: () => string[];
    overwrite: (id: string, text: string, by?: string) => void;
    rename: (id: string, name: string) => void;
    remove: (id: string) => void;
    item: (id: string) => FakeItem | undefined;
    /** Runs between the metadata read and the download of the next open (a concurrent writer). */
    beforeNextDownload: (hook: () => void) => void;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

function headersOf(init: RequestInit | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
        out[key.toLowerCase()] = value;
    });
    return out;
}

export function createFakeGraph({ user = "Coach Avery" }: { user?: string } = {}): FakeGraph {
    const items = new Map<string, FakeItem>();
    const folders = new Set<string>();
    const tokens = new Set<string>();
    const requests: GraphRequest[] = [];
    let offline = false;
    let blocked: number | null = null;
    let next: { status: number; retryAfter?: string } | null = null;
    let pageSize = 200;
    let foreignNext: string | null = null;
    let downloadHook: (() => void) | null = null;
    let seq = 0;
    let clock = Date.parse("2026-10-11T12:00:00.000Z");
    const stamp = () => new Date((clock += 1000)).toISOString();
    const tag = (prefix: string) => `"${prefix}{${String(++seq).padStart(8, "0")}-0000-4000-8000-000000000000},${seq}"`;

    function itemJson(item: FakeItem, withDownload: boolean) {
        return {
            id: item.id,
            name: item.name,
            cTag: item.cTag,
            eTag: item.eTag,
            size: new TextEncoder().encode(item.text).byteLength,
            lastModifiedDateTime: item.modifiedAt,
            lastModifiedBy: { user: { displayName: item.by } },
            file: { mimeType: "application/json" },
            parentReference: { driveId: "drive-1" },
            ...(withDownload ? { "@microsoft.graph.downloadUrl": `${DOWNLOAD_ORIGIN}/dl/${item.id}?tempauth=secret-${item.cTag.length}` } : {}),
        };
    }

    function put(path: string, text: string, by: string): FakeItem {
        const at = path.lastIndexOf("/");
        const parent = at === -1 ? "" : path.slice(0, at);
        const name = at === -1 ? path : path.slice(at + 1);
        if (parent) folders.add(parent);
        const item: FakeItem = { id: `item-${++seq}`, parent, name, text, cTag: tag("c:"), eTag: tag(""), modifiedAt: stamp(), by };
        items.set(item.id, item);
        return item;
    }

    const graph: FakeGraph = {
        requests,
        issueToken: () => {
            const token = `token-${++seq}`;
            tokens.add(token);
            return token;
        },
        revokeTokens: () => tokens.clear(),
        setOffline: (value) => {
            offline = value;
        },
        blockAppFolder: (status) => {
            blocked = status;
        },
        failNext: (status, retryAfter) => {
            next = { status, retryAfter };
        },
        setPageSize: (size) => {
            pageSize = size;
        },
        setForeignNextLink: (url) => {
            foreignNext = url;
        },
        seed: (name, text, by = user) => put(name, text, by),
        folders: () => [...folders],
        overwrite: (id, text, by = "Coach Jordan") => {
            const item = items.get(id);
            if (!item) throw new Error(`no item ${id}`);
            Object.assign(item, { text, cTag: tag("c:"), eTag: tag(""), modifiedAt: stamp(), by });
        },
        rename: (id, name) => {
            const item = items.get(id);
            if (!item) throw new Error(`no item ${id}`);
            // Metadata only: the eTag moves, the cTag doesn't.
            Object.assign(item, { name, eTag: tag("") });
        },
        remove: (id) => {
            items.delete(id);
        },
        item: (id) => items.get(id),
        beforeNextDownload: (hook) => {
            downloadHook = hook;
        },
        fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const method = (init?.method ?? "GET").toUpperCase();
            const headers = headersOf(init);
            requests.push({ url, method, headers });
            if (offline) throw new TypeError("Failed to fetch");

            if (url.startsWith(`${DOWNLOAD_ORIGIN}/`)) {
                // Pre-authenticated: an Authorization header is refused, as Microsoft's content hosts do.
                if (headers.authorization) return empty(401);
                const id = /\/dl\/([^?]+)/.exec(url)?.[1] ?? "";
                const hook = downloadHook;
                downloadHook = null;
                hook?.();
                const item = items.get(id);
                return item ? new Response(item.text, { status: 200 }) : empty(404);
            }

            if (!url.startsWith(`${GRAPH_ROOT}/`)) return empty(400);
            const token = headers.authorization?.replace(/^Bearer /, "");
            if (!token || !tokens.has(token)) return json(401, { error: { code: "InvalidAuthenticationToken" } });
            if (next) {
                const failing = next;
                next = null;
                return json(failing.status, { error: { code: "failing" } }, failing.retryAfter ? { "Retry-After": failing.retryAfter } : {});
            }
            const path = url.slice(GRAPH_ROOT.length);

            if (path.startsWith("/me/drive/special/approot")) {
                if (blocked !== null) return json(blocked, { error: { code: "accessDenied" } });
                const create = /^\/me\/drive\/special\/approot:\/([^:]+):\/content\?@microsoft\.graph\.conflictBehavior=fail$/.exec(path);
                if (create && method === "PUT") {
                    const segments = create[1].split("/").map(decodeURIComponent);
                    const name = segments.pop()!;
                    const parent = segments.join("/");
                    if (parent && !folders.has(parent)) return json(404, { error: { code: "itemNotFound" } });
                    if ([...items.values()].some((item) => item.parent === parent && item.name === name)) return json(409, { error: { code: "nameAlreadyExists" } });
                    const item = put(parent ? `${parent}/${name}` : name, String(init?.body ?? ""), user);
                    return json(201, itemJson(item, false));
                }
                if (path === "/me/drive/special/approot/children" && method === "POST") {
                    const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string; folder?: unknown };
                    if (!body.name || body.folder === undefined) return json(400, { error: { code: "invalidRequest" } });
                    if (folders.has(body.name)) return json(409, { error: { code: "nameAlreadyExists" } });
                    folders.add(body.name);
                    return json(201, { id: `folder-${body.name}`, name: body.name, folder: { childCount: 0 } });
                }
                const sub = /^\/me\/drive\/special\/approot:\/([^:]+):\/children/.exec(path);
                if (sub && method === "GET") {
                    const parent = decodeURIComponent(sub[1]);
                    if (!folders.has(parent)) return json(404, { error: { code: "itemNotFound" } });
                    return json(200, { value: [...items.values()].filter((item) => item.parent === parent).map((item) => itemJson(item, false)) });
                }
                if (path.startsWith("/me/drive/special/approot/children") && method === "GET") {
                    const skip = Number(new URL(url).searchParams.get("$skiptoken") ?? "0");
                    const all = [...items.values()].filter((item) => item.parent === "");
                    const page = all.slice(skip, skip + pageSize).map((item) => itemJson(item, false));
                    const more = skip + pageSize < all.length;
                    const nextLink = foreignNext ?? (more ? `${GRAPH_ROOT}/me/drive/special/approot/children?$skiptoken=${skip + pageSize}` : undefined);
                    // A folder in the app folder is skipped by the connector.
                    const subfolders = [...folders].map((folder) => ({ id: `folder-${folder}`, name: folder, cTag: '"c:f"', folder: { childCount: 0 } }));
                    const folder = skip === 0 ? [{ id: "folder-1", name: "Old plans", cTag: '"c:x"', folder: { childCount: 0 } }, ...subfolders] : [];
                    return json(200, { value: [...folder, ...page], ...(nextLink ? { "@odata.nextLink": nextLink } : {}) });
                }
                if (method === "GET") return json(200, { id: "approot", name: "OpenLeague Planner", folder: { childCount: items.size } });
                return empty(405);
            }

            const itemPath = /^\/me\/drive\/items\/([^/?]+)(\/content)?(?:\?(.*))?$/.exec(path);
            if (itemPath) {
                const item = items.get(decodeURIComponent(itemPath[1]));
                if (!item) return json(404, { error: { code: "itemNotFound" } });
                if (itemPath[2] && method === "PUT") {
                    const ifMatch = headers["if-match"];
                    if (ifMatch !== undefined && ifMatch !== item.cTag && ifMatch !== item.eTag) return json(412, { error: { code: "resourceModified" } });
                    Object.assign(item, { text: String(init?.body ?? ""), cTag: tag("c:"), eTag: tag(""), modifiedAt: stamp(), by: user });
                    return json(200, itemJson(item, false));
                }
                if (!itemPath[2] && method === "GET") return json(200, itemJson(item, (itemPath[3] ?? "").includes("@microsoft.graph.downloadUrl")));
            }
            return empty(400);
        },
    };
    return graph;
}

export interface FakeMsal extends MsalClient {
    /** Silent renewal fails (the refresh token expired and the iframe can't sign in). */
    blockSilent: () => void;
    /** The next popup is closed by the coach. */
    cancelNextPopup: () => void;
    popups: number;
    silentCalls: Array<{ forceRefresh?: boolean; redirectUri?: string }>;
}

export function createFakeMsal(graph: FakeGraph, { signedIn = true, tenantId = PERSONAL_ACCOUNT_TENANT_ID }: { signedIn?: boolean; tenantId?: string } = {}): FakeMsal {
    const account = { homeAccountId: "home-1", environment: "login.microsoftonline.com", tenantId, username: "coach@example.org", localAccountId: "local-1" } as AccountInfo;
    let accounts: AccountInfo[] = signedIn ? [account] : [];
    let active: AccountInfo | null = null;
    let silentBlocked = false;
    let cancelPopup = false;
    // MSAL serves a cached access token until asked to refresh it.
    let cached: string | null = null;
    const result = (forceRefresh = true): AuthenticationResult => {
        if (forceRefresh || cached === null) cached = graph.issueToken();
        return { accessToken: cached, account } as AuthenticationResult;
    };
    const interactive = async (): Promise<AuthenticationResult> => {
        fake.popups++;
        if (cancelPopup) {
            cancelPopup = false;
            throw Object.assign(new Error("user_cancelled: the coach closed the window"), { errorCode: "user_cancelled" });
        }
        accounts = [account];
        silentBlocked = false;
        return result();
    };
    const fake: FakeMsal = {
        popups: 0,
        silentCalls: [],
        blockSilent: () => {
            silentBlocked = true;
        },
        cancelNextPopup: () => {
            cancelPopup = true;
        },
        initialize: async () => undefined,
        getAllAccounts: () => accounts,
        getActiveAccount: () => active,
        setActiveAccount: (value) => {
            active = value;
        },
        acquireTokenSilent: async (request) => {
            fake.silentCalls.push({ forceRefresh: request.forceRefresh, redirectUri: request.redirectUri });
            if (silentBlocked) throw Object.assign(new Error("interaction_required"), { name: "InteractionRequiredAuthError", errorCode: "interaction_required" });
            return result(request.forceRefresh === true);
        },
        loginPopup: interactive,
        acquireTokenPopup: interactive,
        clearCache: async () => {
            cached = null;
            accounts = [];
            active = null;
        },
    };
    return fake;
}
