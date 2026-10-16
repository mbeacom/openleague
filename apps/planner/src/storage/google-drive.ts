/**
 * The Google Drive connector (storage connectors spec R4, R5, R8; ADR-0022).
 * Loaded as its own chunk, only when the coach chooses Google Drive
 * (google-drive-lazy.ts).
 *
 * - Access: the `drive.file` scope only, so the app reaches the files it
 *   created and the ones the coach picks in the Google Picker, nothing else.
 * - Tokens: the Google Identity Services token model, entirely in the browser
 *   with no client secret and no refresh token. The access token is held in
 *   this closure only (never localStorage, IndexedDB, a link or a log); a
 *   reload, an expiry or a 401 means asking again, from a tap.
 * - Drive REST is called with fetch (no gapi client library). Files the app
 *   creates go in a kind subfolder (Practices/, Rankings/) of the folder the
 *   coach chose with the Picker, or of an "OpenLeague" folder the app creates
 *   when none was chosen (storage locations design, decision 3). Files are
 *   tagged with private appProperties (olKind, olId) so another device can
 *   list them wherever they are; folders the app creates carry an olFolder
 *   tag, so renaming one is harmless.
 * - Conflicts: Drive documents no If-Match for updates, so every overwrite
 *   reads the file's metadata immediately before writing and refuses if
 *   headRevisionId moved (check, then write). The revision is headRevisionId,
 *   which a rename or a share doesn't move.
 * - Errors become ConnectorError codes; provider bodies are read only for
 *   Drive's error reason and never surface.
 */
import { DOCUMENT_KINDS, ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import { DOCUMENT_FORMAT_INFO, formatFromFileName } from "@/lib/document-formats";
import type { GoogleCloudSettings } from "../../cloud-config";
import { connectorFail, connectorOk, type ConnectorError, type RemoteFile, type RemoteRef, type Result, type SaveInput, type StorageConnector } from "./connector";
import { createMemoryLocationStore, type LocationStore } from "../store/locations";
import { kindFolderOf } from "./folders";
import { DEFAULT_DRIVE_FOLDER, GOOGLE_DRIVE_CAPABILITIES } from "./google-drive-lazy";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GIS_CLIENT_URL = "https://accounts.google.com/gsi/client";
export const GAPI_LOADER_URL = "https://apis.google.com/js/api.js";
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_FOLDER_NAME = DEFAULT_DRIVE_FOLDER;
export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
/** The folder's own tag, so a folder the coach renames is still found. */
export const FOLDER_TAG = { key: "olFolder", value: "documents" } as const;
/** A kind subfolder's tag value is its kind ("openleague.practice-plan"). */
export const FOLDER_TAG_KEY = FOLDER_TAG.key;
export const FILE_FIELDS = "id,name,mimeType,headRevisionId,modifiedTime,size,appProperties,trashed,capabilities(canEdit),lastModifyingUser(displayName)";

/** What the Picker offers: the types OpenLeague files are saved as, and what Drive calls a file it can't type. */
export const PICKER_MIME_TYPES = [
    "application/json",
    "text/plain",
    "application/yaml",
    "application/x-yaml",
    "text/yaml",
    "text/x-yaml",
    "application/toml",
    "application/octet-stream",
].join(",");

/** The largest file any document kind can be read from (the readers' own pre-parse limit); a larger one isn't downloaded. */
const MAX_OPEN_BYTES = Math.max(...Object.values(DOCUMENT_KINDS).map((entry) => entry.maxBytes)) + ENVELOPE_OVERHEAD_BYTES;

/** A token is treated as expired this long before Google says it is, so a save doesn't start on one about to lapse. */
const EXPIRY_MARGIN_MS = 60_000;

/** Drive 403 reasons that mean "slow down", not "you can't". */
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "sharingRateLimitExceeded", "dailyLimitExceeded"]);

export type TokenResult = { ok: true; accessToken: string; expiresInSeconds: number } | { ok: false; reason: "cancelled" | "denied" | "failed" };

/** The token model (GIS). requestToken opens Google's popup, so it runs from a tap. */
export interface GoogleAuth {
    requestToken: () => Promise<TokenResult>;
    revoke: (accessToken: string) => Promise<void>;
    prepare?: () => Promise<void>;
}

export interface PickedFile {
    id: string;
    name: string;
}

/** The Google Picker. Resolves [] (or null) when the coach cancels. */
export interface GooglePicker {
    pick: (input: { accessToken: string; apiKey: string; appId: string }) => Promise<PickedFile[]>;
    /** Folder mode: under drive.file, picking a folder grants the app that folder. */
    pickFolder?: (input: { accessToken: string; apiKey: string; appId: string }) => Promise<PickedFile | null>;
    prepare?: () => Promise<void>;
}

/** Where the chosen folder is kept (the store's locations, in the app). */
export type DriveLocationAccess = Pick<LocationStore, "get" | "set">;

export interface GoogleDriveOptions {
    settings: GoogleCloudSettings;
    locations?: DriveLocationAccess;
    fetch?: typeof fetch;
    auth?: GoogleAuth;
    picker?: GooglePicker;
    now?: () => number;
    boundary?: () => string;
}

/** The File resource fields this connector asks for. */
export interface DriveFile {
    id: string;
    name: string;
    mimeType?: string;
    headRevisionId?: string;
    modifiedTime?: string;
    size?: string;
    appProperties?: Record<string, string>;
    trashed?: boolean;
    capabilities?: { canEdit?: boolean };
    lastModifyingUser?: { displayName?: string };
}

/** A Drive query string literal. */
export const driveQuoted = (value: string): string => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const appPropertyQuery = (key: string, value: string) => `appProperties has { key=${driveQuoted(key)} and value=${driveQuoted(value)} }`;

const mimeTypeOf = (name: string) => DOCUMENT_FORMAT_INFO[formatFromFileName(name) ?? "json"].mimeType;

function retryAfter(response: Response): number | undefined {
    const seconds = Number(response.headers.get("Retry-After"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** Drive's error reason (`error.errors[0].reason`), never shown or logged. */
async function reasonOf(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { error?: { errors?: Array<{ reason?: unknown }> } };
        const reason = body.error?.errors?.[0]?.reason;
        return typeof reason === "string" ? reason : "";
    } catch {
        return "";
    }
}

export function createGoogleDriveConnector({
    settings,
    fetch: doFetch = (input, init) => globalThis.fetch(input, init),
    auth = gisAuth(settings.clientId),
    picker = googlePicker(),
    locations = createMemoryLocationStore(),
    now = () => Date.now(),
    boundary = () => `openleague-${crypto.randomUUID()}`,
}: GoogleDriveOptions): StorageConnector {
    let token: { value: string; expiresAt: number } | null = null;
    /** Google's sign-in and Picker scripts have loaded (prepare()). */
    let prepared = false;
    let folderId: string | null = null;
    /** Kind subfolders found or made this session, by `${parent}/${kind}`. */
    const kindFolderIds = new Map<string, string>();

    function accessToken(): string | null {
        if (token && token.expiresAt - EXPIRY_MARGIN_MS > now()) return token.value;
        token = null;
        return null;
    }

    async function errorOf(response: Response): Promise<ConnectorError> {
        const { status } = response;
        if (status === 401) {
            token = null;
            return { code: "auth-required" };
        }
        if (status === 403) {
            const reason = await reasonOf(response);
            if (RATE_LIMIT_REASONS.has(reason)) {
                const seconds = retryAfter(response);
                return seconds === undefined ? { code: "unavailable" } : { code: "unavailable", retryAfterSeconds: seconds };
            }
            if (reason === "storageQuotaExceeded") return { code: "quota" };
            // The app was never granted this file, or lost it: under drive.file it is out of reach.
            if (reason === "appNotAuthorizedToFile") return { code: "not-found" };
            return { code: "forbidden" };
        }
        if (status === 404) return { code: "not-found" };
        if (status === 413) return { code: "too-large" };
        if (status === 429 || status >= 500) {
            const seconds = retryAfter(response);
            return seconds === undefined ? { code: "unavailable" } : { code: "unavailable", retryAfterSeconds: seconds };
        }
        return { code: "provider", status };
    }

    async function call(url: string, init: RequestInit = {}): Promise<Result<Response>> {
        const bearer = accessToken();
        if (!bearer) return connectorFail({ code: "auth-required" });
        let response: Response;
        try {
            response = await doFetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${bearer}` } });
        } catch {
            // fetch rejects only when no response arrived.
            return connectorFail({ code: "offline" });
        }
        return response.ok ? connectorOk(response) : connectorFail(await errorOf(response));
    }

    async function json<T>(url: string, init?: RequestInit): Promise<Result<T>> {
        const response = await call(url, init);
        if (!response.ok) return response;
        try {
            return connectorOk((await response.value.json()) as T);
        } catch {
            return connectorFail({ code: "provider", status: response.value.status });
        }
    }

    function remoteOf(file: DriveFile): Result<RemoteFile> {
        // Only binary files have a head revision; a Google Docs file can't be an OpenLeague document.
        if (!file.headRevisionId) return connectorFail({ code: "provider", status: 415 });
        return connectorOk({
            connector: "google-drive",
            fileId: file.id,
            name: file.name,
            revision: file.headRevisionId,
            modifiedAt: file.modifiedTime ?? new Date(now()).toISOString(),
            size: Number(file.size ?? 0),
            ...(file.appProperties?.olKind ? { kind: file.appProperties.olKind } : {}),
            ...(file.lastModifyingUser?.displayName ? { modifiedBy: file.lastModifyingUser.displayName } : {}),
        });
    }

    const fileUrl = (fileId: string, query: Record<string, string>) => `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${new URLSearchParams({ ...query, supportsAllDrives: "true" })}`;

    /** The file's metadata; a trashed file counts as gone. */
    async function metadata(fileId: string): Promise<Result<DriveFile>> {
        const file = await json<DriveFile>(fileUrl(fileId, { fields: FILE_FIELDS }));
        if (file.ok && file.value.trashed) return connectorFail({ code: "not-found" });
        return file;
    }

    /** The app's default folder: found by its tag, or created on first save. */
    async function defaultFolder(): Promise<Result<string>> {
        if (folderId) return connectorOk(folderId);
        const q = `mimeType=${driveQuoted(FOLDER_MIME_TYPE)} and ${appPropertyQuery(FOLDER_TAG.key, FOLDER_TAG.value)} and trashed=false`;
        const found = await json<{ files?: Array<{ id: string }> }>(`${DRIVE_API}/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", spaces: "drive" })}`);
        if (!found.ok) return found;
        const existing = found.value.files?.[0]?.id;
        if (existing) return connectorOk((folderId = existing));
        const created = await json<{ id: string }>(`${DRIVE_API}/files?fields=id`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME_TYPE, appProperties: { [FOLDER_TAG.key]: FOLDER_TAG.value } }),
        });
        if (!created.ok) return created;
        return connectorOk((folderId = created.value.id));
    }

    /** The folder new files go under: the coach's choice, checked each time (it may be trashed), or the default. */
    async function rootFolder(): Promise<Result<string>> {
        const chosen = await locations.get("google-drive");
        if (!chosen) return defaultFolder();
        const meta = await json<{ id: string; mimeType?: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean } }>(
            fileUrl(chosen.folderId, { fields: "id,mimeType,trashed,capabilities(canAddChildren)" }),
        );
        if (!meta.ok) return meta.error.code === "not-found" || meta.error.code === "forbidden" ? connectorFail({ code: "location-missing" }) : meta;
        if (meta.value.trashed || meta.value.mimeType !== FOLDER_MIME_TYPE) return connectorFail({ code: "location-missing" });
        if (meta.value.capabilities?.canAddChildren === false) return connectorFail({ code: "forbidden" });
        return connectorOk(chosen.folderId);
    }

    /** `<root>/<Kind>/`: found by its tag inside the root, or created there. */
    async function folder(kind: string): Promise<Result<string>> {
        const root = await rootFolder();
        if (!root.ok) return root;
        const kindFolder = kindFolderOf(kind);
        if (!kindFolder) return root;
        const key = `${root.value}/${kind}`;
        const cached = kindFolderIds.get(key);
        if (cached) {
            // Checked again, cheaply: the coach may have trashed it since, and a file saved into the trash is lost from view.
            const still = await json<{ trashed?: boolean }>(fileUrl(cached, { fields: "id,trashed" }));
            if (still.ok && !still.value.trashed) return connectorOk(cached);
            if (!still.ok && still.error.code !== "not-found") return still;
            kindFolderIds.delete(key);
        }
        const q = `mimeType=${driveQuoted(FOLDER_MIME_TYPE)} and ${driveQuoted(root.value)} in parents and ${appPropertyQuery(FOLDER_TAG_KEY, kind)} and trashed=false`;
        const found = await json<{ files?: Array<{ id: string }> }>(`${DRIVE_API}/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", spaces: "drive", supportsAllDrives: "true", includeItemsFromAllDrives: "true" })}`);
        if (!found.ok) return found;
        const existing = found.value.files?.[0]?.id;
        if (existing) {
            kindFolderIds.set(key, existing);
            return connectorOk(existing);
        }
        const created = await json<{ id: string }>(`${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({ name: kindFolder, mimeType: FOLDER_MIME_TYPE, parents: [root.value], appProperties: { [FOLDER_TAG_KEY]: kind } }),
        });
        if (!created.ok) return created;
        kindFolderIds.set(key, created.value.id);
        return connectorOk(created.value.id);
    }

    /** A multipart/related upload body: the metadata, then the text. */
    function multipart(metadata: object, text: string, mimeType: string): RequestInit {
        const mark = boundary();
        const body = [
            `--${mark}`,
            "Content-Type: application/json; charset=UTF-8",
            "",
            JSON.stringify(metadata),
            `--${mark}`,
            `Content-Type: ${mimeType.includes("charset") ? mimeType : `${mimeType}; charset=UTF-8`}`,
            "",
            text,
            `--${mark}--`,
        ].join("\r\n");
        return { headers: { "Content-Type": `multipart/related; boundary=${mark}` }, body };
    }

    const tags = (input: SaveInput) => ({ olKind: input.kind, olId: input.documentId });

    async function create(input: SaveInput): Promise<Result<RemoteFile>> {
        const parent = await folder(input.kind);
        if (!parent.ok) return parent;
        const mimeType = mimeTypeOf(input.name);
        const saved = await json<DriveFile>(`${DRIVE_UPLOAD_API}/files?${new URLSearchParams({ uploadType: "multipart", fields: FILE_FIELDS, supportsAllDrives: "true" })}`, {
            method: "POST",
            ...multipart({ name: input.name, mimeType: mimeType.split(";")[0], parents: [parent.value], appProperties: tags(input) }, input.text, mimeType),
        });
        return saved.ok ? remoteOf(saved.value) : saved;
    }

    async function overwrite(ref: RemoteRef, input: SaveInput): Promise<Result<RemoteFile>> {
        // The check: metadata read immediately before the write.
        const current = await metadata(ref.fileId);
        if (!current.ok) return current;
        const remote = remoteOf(current.value);
        if (!remote.ok) return remote;
        if (input.expectedRevision === null || remote.value.revision !== input.expectedRevision) return connectorFail({ code: "conflict", remote: remote.value });
        // A view-only share (R8): refused before any write is attempted.
        if (current.value.capabilities?.canEdit === false) return connectorFail({ code: "forbidden" });
        // …then the write. Another device may write in between (R4); "Overwritten" catches it there.
        const saved = await json<DriveFile>(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(ref.fileId)}?${new URLSearchParams({ uploadType: "multipart", fields: FILE_FIELDS, supportsAllDrives: "true" })}`, {
            method: "PATCH",
            ...multipart({ appProperties: tags(input) }, input.text, mimeTypeOf(ref.name)),
        });
        return saved.ok ? remoteOf(saved.value) : saved;
    }

    return {
        id: "google-drive",
        capabilities: GOOGLE_DRIVE_CAPABILITIES,
        status: () => (accessToken() ? "connected" : "disconnected"),

        connect: async () => {
            let result: TokenResult;
            try {
                result = await auth.requestToken();
            } catch {
                // Google's script didn't load.
                return connectorFail({ code: "unavailable" });
            }
            if (!result.ok) return connectorFail(result.reason === "cancelled" ? { code: "cancelled" } : { code: "auth-required" });
            token = { value: result.accessToken, expiresAt: now() + result.expiresInSeconds * 1000 };
            return connectorOk(undefined);
        },

        disconnect: async () => {
            const revoked = token?.value;
            token = null;
            folderId = null;
            kindFolderIds.clear();
            if (!revoked) return;
            try {
                await auth.revoke(revoked);
            } catch {
                // The token is dropped either way; it lapses within the hour.
            }
        },

        prepare: async () => {
            try {
                await Promise.all([auth.prepare?.(), picker.prepare?.()]);
                prepared = true;
            } catch {
                // Not loaded: the next tap tries again and reports the failure.
            }
        },
        prepared: () => prepared,

        list: async (filter) => {
            const kinds = filter?.kind ? [filter.kind] : Object.keys(DOCUMENT_KINDS);
            const q = `(${kinds.map((kind) => appPropertyQuery("olKind", kind)).join(" or ")}) and trashed=false`;
            const files: RemoteFile[] = [];
            let pageToken: string | undefined;
            do {
                const params = new URLSearchParams({ q, fields: `nextPageToken,files(${FILE_FIELDS})`, pageSize: "100", orderBy: "modifiedTime desc", spaces: "drive" });
                if (pageToken) params.set("pageToken", pageToken);
                const page = await json<{ files?: DriveFile[]; nextPageToken?: string }>(`${DRIVE_API}/files?${params}`);
                if (!page.ok) return page;
                for (const file of page.value.files ?? []) {
                    const remote = remoteOf(file);
                    if (remote.ok) files.push(remote.value);
                }
                pageToken = page.value.nextPageToken;
            } while (pageToken);
            return connectorOk(files);
        },

        location: async () => {
            const chosen = await locations.get("google-drive");
            return chosen ? { name: chosen.name, chosen: true } : { name: DEFAULT_DRIVE_FOLDER, chosen: false };
        },

        chooseLocation: async () => {
            const bearer = accessToken();
            if (!bearer) return connectorFail({ code: "auth-required" });
            if (!picker.pickFolder) return connectorFail({ code: "unavailable" });
            let picked: PickedFile | null;
            try {
                picked = await picker.pickFolder({ accessToken: bearer, apiKey: settings.apiKey, appId: settings.appId });
            } catch {
                return connectorFail({ code: "unavailable" });
            }
            if (!picked) return connectorOk(null);
            await locations.set("google-drive", { folderId: picked.id, name: picked.name, chosenAt: new Date(now()).toISOString() });
            return connectorOk({ name: picked.name });
        },

        resetLocation: async () => {
            await locations.set("google-drive", undefined);
        },

        pickToOpen: async () => {
            const bearer = accessToken();
            if (!bearer) return connectorFail({ code: "auth-required" });
            let picked: PickedFile[];
            try {
                picked = await picker.pick({ accessToken: bearer, apiKey: settings.apiKey, appId: settings.appId });
            } catch {
                return connectorFail({ code: "unavailable" });
            }
            return connectorOk(picked.map((file) => ({ connector: "google-drive" as const, fileId: file.id, name: file.name })));
        },

        open: async (ref) => {
            // Metadata first, then content: if a write lands between them, the revision kept is the older one and the next save reports a conflict rather than overwriting unseen content.
            const meta = await metadata(ref.fileId);
            if (!meta.ok) return meta;
            const file = remoteOf(meta.value);
            if (!file.ok) return file;
            // Refused before the download: the reader would refuse it anyway, after holding all of it in memory.
            if (file.value.size > MAX_OPEN_BYTES) return connectorFail({ code: "too-large" });
            const media = await call(fileUrl(ref.fileId, { alt: "media" }));
            if (!media.ok) return media;
            try {
                return connectorOk({ file: file.value, text: await media.value.text() });
            } catch {
                // The response began but its body didn't arrive.
                return connectorFail({ code: "offline" });
            }
        },

        save: (input) => (input.ref === null ? create(input) : overwrite(input.ref, input)),
    };
}

// ---- Google's browser libraries, loaded on demand (spec R5) ----

interface TokenResponse {
    access_token?: string;
    expires_in?: number | string;
    error?: string;
}

interface GisOauth2 {
    initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
    }) => { requestAccessToken: (options?: { prompt?: string }) => void };
    hasGrantedAllScopes: (response: TokenResponse, ...scopes: string[]) => boolean;
    revoke: (accessToken: string, done?: () => void) => void;
}

interface PickerDocument {
    id?: unknown;
    name?: unknown;
}

interface PickerView {
    setMimeTypes: (types: string) => PickerView;
    setMode: (mode: unknown) => PickerView;
    setIncludeFolders: (include: boolean) => PickerView;
    setSelectFolderEnabled: (enabled: boolean) => PickerView;
}

interface PickerInstance {
    setVisible: (visible: boolean) => void;
    dispose: () => void;
}

interface PickerBuilder {
    addView: (view: PickerView) => PickerBuilder;
    setOAuthToken: (token: string) => PickerBuilder;
    setDeveloperKey: (key: string) => PickerBuilder;
    setAppId: (appId: string) => PickerBuilder;
    setTitle: (title: string) => PickerBuilder;
    setCallback: (callback: (data: { action?: unknown; docs?: PickerDocument[] }) => void) => PickerBuilder;
    build: () => PickerInstance;
}

interface PickerNamespace {
    DocsView: new (viewId?: unknown) => PickerView;
    PickerBuilder: new () => PickerBuilder;
    ViewId: { DOCS: unknown; FOLDERS: unknown };
    DocsViewMode: { LIST: unknown };
    Action: { PICKED: unknown; CANCEL: unknown };
}

interface GoogleGlobals {
    google?: { accounts?: { oauth2?: GisOauth2 }; picker?: PickerNamespace };
    gapi?: { load: (name: string, options: { callback: () => void; onerror: () => void }) => void };
}

const globals = () => globalThis as unknown as GoogleGlobals;

const scripts = new Map<string, Promise<void>>();

/** Adds a script once; a failed load is retried next time. */
export function loadScript(src: string): Promise<void> {
    let loading = scripts.get(src);
    if (!loading) {
        loading = new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => {
                scripts.delete(src);
                script.remove();
                reject(new Error("A Google script failed to load."));
            };
            document.head.appendChild(script);
        });
        scripts.set(src, loading);
    }
    return loading;
}

async function oauth2(): Promise<GisOauth2> {
    await loadScript(GIS_CLIENT_URL);
    const client = globals().google?.accounts?.oauth2;
    if (!client) throw new Error("Google Identity Services is unavailable.");
    return client;
}

/** The GIS token model (spec R5): a popup, a short-lived token, no refresh token, no secret. */
export function gisAuth(clientId: string): GoogleAuth {
    return {
        prepare: async () => {
            await oauth2();
        },
        requestToken: async () => {
            const client = await oauth2();
            return new Promise<TokenResult>((resolve) => {
                const tokenClient = client.initTokenClient({
                    client_id: clientId,
                    scope: DRIVE_FILE_SCOPE,
                    callback: (response) => {
                        if (response.error || !response.access_token) return resolve({ ok: false, reason: response.error === "access_denied" ? "denied" : "failed" });
                        // Granular consent lets the coach untick Drive; without it the token is no use.
                        if (!client.hasGrantedAllScopes(response, DRIVE_FILE_SCOPE)) return resolve({ ok: false, reason: "denied" });
                        resolve({ ok: true, accessToken: response.access_token, expiresInSeconds: Number(response.expires_in) || 3600 });
                    },
                    error_callback: (error) => resolve({ ok: false, reason: error?.type === "popup_closed" ? "cancelled" : "failed" }),
                });
                // prompt "" asks for consent only the first time.
                tokenClient.requestAccessToken({ prompt: "" });
            });
        },
        revoke: async (accessToken) => {
            const client = await oauth2();
            await new Promise<void>((resolve) => client.revoke(accessToken, () => resolve()));
        },
    };
}

async function pickerNamespace(): Promise<PickerNamespace> {
    await loadScript(GAPI_LOADER_URL);
    const loader = globals().gapi;
    if (!loader) throw new Error("The Google API loader is unavailable.");
    await new Promise<void>((resolve, reject) => loader.load("picker", { callback: resolve, onerror: () => reject(new Error("The Google Picker failed to load.")) }));
    const picker = globals().google?.picker;
    if (!picker) throw new Error("The Google Picker is unavailable.");
    return picker;
}

/**
 * The Google Picker: setAppId (the project number) is what lets drive.file
 * reach a picked file; setDeveloperKey is the browser API key, which Google
 * checks against the key's website restrictions from the Picker's
 * docs.google.com frame; setOAuthToken picks the account.
 */
export function googlePicker(): GooglePicker {
    return {
        prepare: async () => {
            await pickerNamespace();
        },
        pick: async ({ accessToken, apiKey, appId }) => {
            const picker = await pickerNamespace();
            return new Promise<PickedFile[]>((resolve) => {
                // List mode: drive.file grants no thumbnails (Picker web guide).
                const view = new picker.DocsView(picker.ViewId.DOCS).setMimeTypes(PICKER_MIME_TYPES).setMode(picker.DocsViewMode.LIST).setIncludeFolders(true).setSelectFolderEnabled(false);
                const instance = new picker.PickerBuilder()
                    .addView(view)
                    .setOAuthToken(accessToken)
                    .setDeveloperKey(apiKey)
                    .setAppId(appId)
                    .setTitle("Open an OpenLeague file")
                    .setCallback((data) => {
                        if (data.action === picker.Action.PICKED) {
                            instance.dispose();
                            resolve(
                                (data.docs ?? []).flatMap((doc) => (typeof doc.id === "string" && typeof doc.name === "string" ? [{ id: doc.id, name: doc.name }] : [])),
                            );
                        } else if (data.action === picker.Action.CANCEL) {
                            instance.dispose();
                            resolve([]);
                        }
                    })
                    .build();
                instance.setVisible(true);
            });
        },
        pickFolder: async ({ accessToken, apiKey, appId }) => {
            const picker = await pickerNamespace();
            return new Promise<PickedFile | null>((resolve) => {
                // Folders only, and a folder can be the choice: drive.file then reaches it (choosing an upload destination).
                const view = new picker.DocsView(picker.ViewId.FOLDERS).setMimeTypes(FOLDER_MIME_TYPE).setMode(picker.DocsViewMode.LIST).setIncludeFolders(true).setSelectFolderEnabled(true);
                const instance = new picker.PickerBuilder()
                    .addView(view)
                    .setOAuthToken(accessToken)
                    .setDeveloperKey(apiKey)
                    .setAppId(appId)
                    .setTitle("Choose where OpenLeague saves new files")
                    .setCallback((data) => {
                        if (data.action === picker.Action.PICKED) {
                            instance.dispose();
                            const doc = data.docs?.[0];
                            resolve(doc && typeof doc.id === "string" && typeof doc.name === "string" ? { id: doc.id, name: doc.name } : null);
                        } else if (data.action === picker.Action.CANCEL) {
                            instance.dispose();
                            resolve(null);
                        }
                    })
                    .build();
                instance.setVisible(true);
            });
        },
    };
}
