/**
 * The OneDrive connector, phase 4a (storage connectors spec R6, R8; ADR-0022):
 * the planner's own app folder in the coach's OneDrive, through Microsoft
 * Graph, signed in with MSAL Browser. Loaded only through import() (see
 * onedrive-loader.ts), so MSAL never reaches the entry chunk.
 *
 * - Scope: Files.ReadWrite.AppFolder (plus User.Read for sign-in). The app sees
 *   only `Apps/<app name>/`, created on first use at /me/drive/special/approot.
 *   No picker: the app lists its folder itself.
 * - Accounts: personal Microsoft accounts only (the /consumers authority) by
 *   default; personal and work or school (/common) when the build sets
 *   OPENLEAGUE_MICROSOFT_ACCOUNTS=any. Microsoft's documentation disagrees on
 *   whether the app folder works for work or school accounts, so a failure
 *   there is reported as its own error, not a generic one. Under /consumers a
 *   work or school account can't sign in, so that error can't arise.
 * - Tokens: authorization code with PKCE, no client secret. MSAL's cache is in
 *   sessionStorage (cleared with the tab). Popups and the silent-renewal iframe
 *   end on auth/redirect.html, which runs only MSAL's redirect bridge.
 * - Writes are atomic: an overwrite sends `If-Match` with the revision the
 *   device last saw, and Graph answers 412 when the file moved (a conflict).
 *   The revision is the item's cTag, which moves only on content changes, so a
 *   rename in OneDrive is not a conflict.
 * - Reads go through the item's pre-authenticated `@microsoft.graph.downloadUrl`:
 *   Graph's /content answers with a redirect a browser may not follow after a
 *   CORS preflight. That URL is a bearer link: it is fetched at once, without
 *   credentials, and never stored or logged.
 *
 * Errors carry codes only (never Graph's response bodies, file names or ids).
 */
import { PublicClientApplication, type AccountInfo, type AuthenticationResult, type Configuration, type IPublicClientApplication } from "@azure/msal-browser";
import { DOCUMENT_KINDS, ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import { PLAN_FORMAT } from "@/lib/plan-document/document";
import { RANKINGS_FORMAT } from "@/lib/rankings-document/document";
import { MICROSOFT_AUTHORITIES, type MicrosoftAccounts } from "../../cloud-config";
import { connectorFail, connectorOk, type ConnectorError, type ConnectorStatus, type RemoteFile, type RemoteRef, type Result, type SaveInput, type StorageConnector } from "./connector";

/** Delegated Graph permissions (spec R6): the app folder only, and sign-in. */
export const ONEDRIVE_SCOPES = ["Files.ReadWrite.AppFolder", "User.Read"] as const;

/** The sign-in authority for the build's audience (open question 4): /consumers for personal, /common for any. */
export function microsoftAuthority(accounts: MicrosoftAccounts): string {
    return MICROSOFT_AUTHORITIES[accounts];
}

export const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

/** The tenant every personal Microsoft account signs in through. */
export const PERSONAL_ACCOUNT_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

export type MicrosoftAccountType = "personal" | "work";

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export interface OneDriveAuth {
    /** Resolves once the sign-in library has read its cache. */
    ready: () => Promise<void>;
    status: () => "connected" | "disconnected";
    accountType: () => MicrosoftAccountType | null;
    /** Interactive: a popup. Call from a tap. */
    connect: () => Promise<Result<void>>;
    /** A Graph access token: silently, or by popup when the call comes from a tap. */
    token: (options?: { forceRefresh?: boolean }) => Promise<Result<string>>;
    /** Clears this browser's cached tokens and account. */
    disconnect: () => Promise<void>;
}

/** The part of MSAL's PublicClientApplication this connector uses. */
export type MsalClient = Pick<
    IPublicClientApplication,
    "initialize" | "getAllAccounts" | "getActiveAccount" | "setActiveAccount" | "loginPopup" | "acquireTokenSilent" | "acquireTokenPopup" | "clearCache"
>;

export interface MsalAuthOptions {
    clientId: string;
    /** Which accounts may sign in (the build's OPENLEAGUE_MICROSOFT_ACCOUNTS); personal when omitted. */
    accounts?: MicrosoftAccounts;
    /** auth/redirect.html, beside the planner's index.html. */
    redirectUri: string;
    /** MSAL itself when omitted; tests pass a fake. */
    client?: MsalClient;
    /**
     * Whether a popup may open now. A popup opened without a tap is blocked
     * (and a check on focus must not surprise the coach with one). Defaults to
     * the browser's user activation; where the browser can't say, a popup is
     * tried and a blocked one reads as auth-required.
     */
    interactive?: () => boolean;
}

function browserActivation(): boolean {
    const activation = (globalThis.navigator as { userActivation?: { isActive?: boolean } } | undefined)?.userActivation;
    return activation === undefined ? true : activation.isActive === true;
}

const errorCodeOf = (error: unknown): string => {
    const value = (error as { errorCode?: unknown } | null)?.errorCode;
    return typeof value === "string" ? value : "";
};

/** An MSAL error as a code; its message can carry an account name, so it is never kept. */
export function authErrorOf(error: unknown): ConnectorError {
    switch (errorCodeOf(error)) {
        case "user_cancelled":
            return { code: "cancelled" };
        case "no_network_connectivity":
        case "endpoints_resolution_error":
            return { code: "offline" };
        default:
            // Interaction required, a blocked popup, a timed-out iframe, an
            // interaction already in progress: the coach has to sign in again.
            return { code: "auth-required" };
    }
}

/** MSAL's configuration: the build's audience, the redirect bridge, and a cache that ends with the tab. */
export function msalConfiguration(clientId: string, redirectUri: string, accounts: MicrosoftAccounts = "personal"): Configuration {
    return {
        auth: { clientId, authority: microsoftAuthority(accounts), redirectUri, postLogoutRedirectUri: redirectUri },
        // Not localStorage: a 24-hour refresh token at rest would outlive the tab (spec R6).
        cache: { cacheLocation: "sessionStorage" },
    };
}

export function createMsalAuth({ clientId, accounts = "personal", redirectUri, client, interactive = browserActivation }: MsalAuthOptions): OneDriveAuth {
    const pca: MsalClient = client ?? new PublicClientApplication(msalConfiguration(clientId, redirectUri, accounts));
    let initialized = false;
    let initializing: Promise<void> | null = null;
    const ready = () =>
        (initializing ??= pca.initialize().then(
            () => {
                initialized = true;
            },
            (error: unknown) => {
                initializing = null;
                throw error;
            },
        ));

    const account = (): AccountInfo | null => {
        if (!initialized) return null;
        return pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
    };

    const scopes = [...ONEDRIVE_SCOPES];

    async function popup(current: AccountInfo | null): Promise<Result<string>> {
        try {
            const result: AuthenticationResult = current
                ? await pca.acquireTokenPopup({ scopes, account: current, redirectUri })
                : await pca.loginPopup({ scopes, redirectUri, prompt: "select_account" });
            if (result.account) pca.setActiveAccount(result.account);
            return connectorOk(result.accessToken);
        } catch (error) {
            return connectorFail(authErrorOf(error));
        }
    }

    return {
        ready,
        status: () => (account() ? "connected" : "disconnected"),
        accountType: () => {
            const current = account();
            if (!current) return null;
            return current.tenantId === PERSONAL_ACCOUNT_TENANT_ID ? "personal" : "work";
        },
        connect: async () => {
            try {
                await ready();
            } catch {
                return connectorFail({ code: "unavailable" });
            }
            const signedIn = await popup(null);
            return signedIn.ok ? connectorOk(undefined) : connectorFail(signedIn.error);
        },
        token: async ({ forceRefresh = false } = {}) => {
            try {
                await ready();
            } catch {
                return connectorFail({ code: "unavailable" });
            }
            const current = account();
            if (!current) return interactive() ? popup(null) : connectorFail({ code: "auth-required" });
            try {
                const result = await pca.acquireTokenSilent({ scopes, account: current, redirectUri, forceRefresh });
                return connectorOk(result.accessToken);
            } catch (error) {
                const failed = authErrorOf(error);
                if (failed.code !== "auth-required" || !interactive()) return connectorFail(failed);
                return popup(current);
            }
        },
        disconnect: async () => {
            try {
                await ready();
            } catch {
                return;
            }
            const current = account();
            await pca.clearCache(current ? { account: current } : undefined);
            pca.setActiveAccount(null);
        },
    };
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

/** The driveItem fields the connector reads. */
interface DriveItem {
    id?: string;
    name?: string;
    cTag?: string;
    eTag?: string;
    size?: number;
    lastModifiedDateTime?: string;
    lastModifiedBy?: { user?: { displayName?: string } };
    file?: unknown;
    folder?: unknown;
    parentReference?: { driveId?: string };
    "@microsoft.graph.downloadUrl"?: string;
}

/** The largest file any document kind can be read from (the readers' own pre-parse limit); a larger one isn't downloaded. */
const MAX_OPEN_BYTES = Math.max(...Object.values(DOCUMENT_KINDS).map((entry) => entry.maxBytes)) + ENVELOPE_OVERHEAD_BYTES;

const ITEM_FIELDS = "id,name,cTag,eTag,size,lastModifiedDateTime,lastModifiedBy,file,folder,parentReference";

/** The kind a file in the app folder holds, by its name; undefined for anything else. */
export function kindOfFileName(name: string): string | undefined {
    if (/\.olplan\.(?:json|jsonc|ya?ml|toml)$/i.test(name)) return PLAN_FORMAT;
    if (/\.rankings\.(?:json|jsonc|ya?ml|toml)$/i.test(name)) return RANKINGS_FORMAT;
    return undefined;
}

const DOCUMENT_EXTENSION = /(\.(?:olplan|rankings))?\.(?:json|jsonc|ya?ml|toml)$/i;

/** Names to try when creating: the asked-for name, then "fall (2).rankings.json" up to (9). */
export function candidateNames(name: string): string[] {
    const match = DOCUMENT_EXTENSION.exec(name);
    const cut = match ? match.index : name.length;
    return [name, ...Array.from({ length: 8 }, (_, index) => `${name.slice(0, cut)} (${index + 2})${name.slice(cut)}`)];
}

/** Retry-After as seconds: an integer, or an HTTP date. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number | undefined {
    if (header === null || header.trim() === "") return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
    const at = Date.parse(header);
    return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - now) / 1000));
}

export interface OneDriveConnector extends StorageConnector {
    readonly id: "onedrive";
    /** Resolves once the sign-in library has read its cache, so status() is current. */
    ready: () => Promise<void>;
    /** Which kind of Microsoft account is signed in, for the disconnect dialog's link. */
    accountType: () => MicrosoftAccountType | null;
}

export interface OneDriveConnectorOptions {
    auth: OneDriveAuth;
    fetch?: typeof fetch;
}

type Where = "item" | "folder";

export function createOneDriveConnector({ auth, fetch: fetchImpl = (input, init) => globalThis.fetch(input, init) }: OneDriveConnectorOptions): OneDriveConnector {
    /**
     * A Graph error status as a code. "folder" calls tell a work or school
     * account's app-folder failure apart (reachable only in an `any` build:
     * /consumers signs in no work or school account).
     */
    function statusError(response: Response, where: Where): ConnectorError {
        const { status } = response;
        if (where === "folder" && auth.accountType() === "work" && (status === 400 || status === 403 || status === 404 || status === 501)) {
            return { code: "app-folder-unavailable" };
        }
        switch (status) {
            case 401:
                return { code: "auth-required" };
            case 403:
                return { code: "forbidden" };
            case 404:
            case 410:
                return { code: "not-found" };
            case 413:
                return { code: "too-large" };
            case 507:
                return { code: "quota" };
            case 429:
            case 503:
            case 509: {
                const after = retryAfterSeconds(response.headers.get("Retry-After"));
                return after === undefined ? { code: "unavailable" } : { code: "unavailable", retryAfterSeconds: after };
            }
            default:
                return { code: "provider", status };
        }
    }

    /** One Graph call with the coach's token. A 401 renews the token once and tries again. */
    async function graph(url: string, init: RequestInit = {}): Promise<Result<Response>> {
        for (const forceRefresh of [false, true]) {
            const token = await auth.token({ forceRefresh });
            if (!token.ok) return connectorFail(token.error);
            let response: Response;
            try {
                response = await fetchImpl(url, {
                    ...init,
                    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token.value}` },
                    cache: "no-store",
                    credentials: "omit",
                    referrerPolicy: "no-referrer",
                });
            } catch {
                return connectorFail({ code: "offline" });
            }
            if (response.status === 401 && !forceRefresh) continue;
            return connectorOk(response);
        }
        return connectorFail({ code: "auth-required" });
    }

    async function itemOf(response: Response): Promise<DriveItem | null> {
        try {
            const body = (await response.json()) as unknown;
            return typeof body === "object" && body !== null ? (body as DriveItem) : null;
        } catch {
            return null;
        }
    }

    function remoteOf(item: DriveItem): RemoteFile | null {
        const revision = item.cTag ?? item.eTag;
        if (typeof item.id !== "string" || typeof item.name !== "string" || typeof revision !== "string") return null;
        const kind = kindOfFileName(item.name);
        const by = item.lastModifiedBy?.user?.displayName;
        const driveId = item.parentReference?.driveId;
        return {
            connector: "onedrive",
            fileId: item.id,
            name: item.name,
            ...(typeof driveId === "string" ? { driveId } : {}),
            revision,
            modifiedAt: typeof item.lastModifiedDateTime === "string" && !Number.isNaN(Date.parse(item.lastModifiedDateTime)) ? item.lastModifiedDateTime : new Date(0).toISOString(),
            ...(typeof by === "string" && by !== "" ? { modifiedBy: by } : {}),
            size: typeof item.size === "number" ? item.size : 0,
            ...(kind !== undefined ? { kind } : {}),
        };
    }

    /** A successful item response as a RemoteFile; a malformed one is a provider error. */
    async function remoteFrom(response: Response): Promise<Result<RemoteFile>> {
        const item = await itemOf(response);
        const remote = item ? remoteOf(item) : null;
        return remote ? connectorOk(remote) : connectorFail({ code: "provider", status: response.status });
    }

    const itemUrl = (fileId: string, suffix = "") => `${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(fileId)}${suffix}`;

    async function metadata(fileId: string, withDownloadUrl = false): Promise<Result<DriveItem>> {
        const select = withDownloadUrl ? `${ITEM_FIELDS},@microsoft.graph.downloadUrl` : ITEM_FIELDS;
        const response = await graph(`${itemUrl(fileId)}?$select=${select}`);
        if (!response.ok) return response;
        if (!response.value.ok) return connectorFail(statusError(response.value, "item"));
        const item = await itemOf(response.value);
        if (!item) return connectorFail({ code: "provider", status: response.value.status });
        // A folder (or anything without content) isn't a document.
        if (item.file === undefined || item.folder !== undefined) return connectorFail({ code: "not-found" });
        return connectorOk(item);
    }

    /** The file's text through its pre-authenticated URL: no token, no cookies, no referrer. */
    async function download(url: string): Promise<Result<string>> {
        let response: Response;
        try {
            response = await fetchImpl(url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        } catch {
            return connectorFail({ code: "offline" });
        }
        if (!response.ok) return connectorFail(statusError(response, "item"));
        try {
            return connectorOk(await response.text());
        } catch {
            // The response began but its body didn't arrive.
            return connectorFail({ code: "offline" });
        }
    }

    async function currentConflict(fileId: string): Promise<Result<never>> {
        const current = await metadata(fileId);
        if (!current.ok) return connectorFail(current.error);
        const remote = remoteOf(current.value);
        return connectorFail(remote ? { code: "conflict", remote } : { code: "provider", status: 412 });
    }

    async function create(input: SaveInput): Promise<Result<RemoteFile>> {
        for (const name of candidateNames(input.name)) {
            // `fail`, not `rename`: OneDrive's own renaming ("fall.rankings 1.json") would break the document extension.
            const url = `${GRAPH_ROOT}/me/drive/special/approot:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=fail`;
            const response = await graph(url, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: input.text });
            if (!response.ok) return response;
            if (response.value.status === 409) continue;
            if (!response.value.ok) return connectorFail(statusError(response.value, "folder"));
            return remoteFrom(response.value);
        }
        return connectorFail({ code: "provider", status: 409 });
    }

    async function overwrite(ref: RemoteRef, input: SaveInput): Promise<Result<RemoteFile>> {
        if (input.expectedRevision === null) return currentConflict(ref.fileId);
        const response = await graph(itemUrl(ref.fileId, "/content"), {
            method: "PUT",
            // The atomic precondition (spec R4): Graph refuses with 412 when the file moved.
            headers: { "Content-Type": "text/plain", "If-Match": input.expectedRevision },
            body: input.text,
        });
        if (!response.ok) return response;
        if (response.value.status === 412) return currentConflict(ref.fileId);
        if (!response.value.ok) return connectorFail(statusError(response.value, "item"));
        return remoteFrom(response.value);
    }

    return {
        id: "onedrive",
        capabilities: { list: true, pick: false, delete: false, conditionalWrite: "atomic" },
        ready: auth.ready,
        accountType: auth.accountType,
        status: (): ConnectorStatus => auth.status(),

        connect: async () => {
            const signedIn = await auth.connect();
            if (!signedIn.ok) return signedIn;
            // Opens (and on first use creates) the app folder, so an account that can't have one is told now.
            const response = await graph(`${GRAPH_ROOT}/me/drive/special/approot?$select=id`);
            if (!response.ok) return connectorFail(response.error);
            if (!response.value.ok) return connectorFail(statusError(response.value, "folder"));
            return connectorOk(undefined);
        },

        disconnect: () => auth.disconnect(),

        list: async (filter) => {
            const files: RemoteFile[] = [];
            let url: string | null = `${GRAPH_ROOT}/me/drive/special/approot/children?$select=${ITEM_FIELDS}&$top=200`;
            while (url) {
                const response: Result<Response> = await graph(url);
                if (!response.ok) return connectorFail(response.error);
                if (!response.value.ok) return connectorFail(statusError(response.value, "folder"));
                let page: { value?: DriveItem[]; "@odata.nextLink"?: string };
                try {
                    page = (await response.value.json()) as typeof page;
                } catch {
                    return connectorFail({ code: "provider", status: response.value.status });
                }
                for (const item of page.value ?? []) {
                    if (item.file === undefined) continue;
                    const remote = remoteOf(item);
                    if (remote?.kind === undefined) continue;
                    if (filter?.kind === undefined || remote.kind === filter.kind) files.push(remote);
                }
                const next = page["@odata.nextLink"];
                // The token only ever goes to Graph.
                url = typeof next === "string" && next.startsWith(`${GRAPH_ROOT}/`) ? next : null;
            }
            return connectorOk(files);
        },

        // No picker in phase 4a: "Open from…" lists the app folder.
        pickToOpen: async () => connectorOk([]),

        open: async (ref) => {
            // The text and its revision must match: if the file moved between the
            // metadata read and the download, read again.
            for (let attempt = 0; attempt < 3; attempt++) {
                const before = await metadata(ref.fileId, true);
                if (!before.ok) return connectorFail(before.error);
                // Refused before the download: the reader would refuse it anyway, after holding all of it in memory.
                if (typeof before.value.size === "number" && before.value.size > MAX_OPEN_BYTES) return connectorFail({ code: "too-large" });
                const url = before.value["@microsoft.graph.downloadUrl"];
                if (typeof url !== "string" || !url.startsWith("https://")) return connectorFail({ code: "provider", status: 200 });
                const text = await download(url);
                if (!text.ok) return connectorFail(text.error);
                const after = await metadata(ref.fileId);
                if (!after.ok) return connectorFail(after.error);
                const remote = remoteOf(after.value);
                if (!remote) return connectorFail({ code: "provider", status: 200 });
                if ((before.value.cTag ?? before.value.eTag) === remote.revision) return connectorOk({ file: remote, text: text.value });
            }
            return connectorFail({ code: "unavailable" });
        },

        save: (input) => (input.ref === null ? create(input) : overwrite(input.ref, input)),
    };
}

/** The connector as the app builds it: MSAL with the build's client id. */
export function createOneDriveFromConfig({ clientId, accounts, redirectUri }: { clientId: string; accounts: MicrosoftAccounts; redirectUri: string }): OneDriveConnector {
    return createOneDriveConnector({ auth: createMsalAuth({ clientId, accounts, redirectUri }) });
}
