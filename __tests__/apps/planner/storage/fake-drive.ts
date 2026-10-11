/**
 * A fake Google Drive for the Drive connector's tests (storage connectors
 * spec, Testing): a fetch that reproduces the documented request and response
 * shapes of Drive API v3 (files.get with fields and alt=media, files.list
 * with appProperties queries and pages, files.create, multipart uploads and
 * updates, headRevisionId, error bodies with a reason), a GIS-like token
 * source and a Picker. No call leaves the process.
 */
import type { GoogleAuth, GooglePicker, PickedFile, TokenResult } from "@/apps/planner/src/storage/google-drive";

export interface FakeDriveFile {
    id: string;
    name: string;
    mimeType: string;
    content: string;
    headRevisionId?: string;
    modifiedTime: string;
    appProperties: Record<string, string>;
    parents: string[];
    trashed: boolean;
    canEdit: boolean;
    lastModifyingUser?: string;
}

export interface FakeCall {
    method: string;
    path: string;
    query: URLSearchParams;
    authorization: string | null;
}

interface InjectedFailure {
    status: number;
    reason?: string;
    headers?: Record<string, string>;
    /** Only requests with this method fail (any when omitted). */
    method?: string;
}

const FOLDER = "application/vnd.google-apps.folder";

function parseMultipart(body: string, contentType: string): { metadata: Record<string, unknown>; content: string } {
    const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
    if (!boundary) throw new Error("multipart upload without a boundary");
    const parts = body
        .split(`--${boundary}`)
        .slice(1, -1)
        .map((part) => {
            const trimmed = part.replace(/^\r\n/, "").replace(/\r\n$/, "");
            const split = trimmed.indexOf("\r\n\r\n");
            return trimmed.slice(split + 4);
        });
    if (parts.length !== 2) throw new Error(`expected 2 multipart parts, got ${parts.length}`);
    return { metadata: JSON.parse(parts[0]) as Record<string, unknown>, content: parts[1] };
}

/** files.list's q, as far as the connector writes it: appProperties clauses (OR'd in parentheses, else AND'd), a mimeType and trashed=false. */
function matches(file: FakeDriveFile, q: string): boolean {
    const clauses = Array.from(q.matchAll(/appProperties has \{ key='((?:\\.|[^'])*)' and value='((?:\\.|[^'])*)' \}/g), (match) => ({
        key: match[1].replace(/\\(.)/g, "$1"),
        value: match[2].replace(/\\(.)/g, "$1"),
    }));
    const hit = (clause: { key: string; value: string }) => file.appProperties[clause.key] === clause.value;
    const ored = q.trimStart().startsWith("(");
    if (clauses.length > 0 && !(ored ? clauses.some(hit) : clauses.every(hit))) return false;
    const mime = /mimeType='([^']*)'/.exec(q)?.[1];
    if (mime !== undefined && file.mimeType !== mime) return false;
    if (/trashed=false/.test(q) && file.trashed) return false;
    return true;
}

function resource(file: FakeDriveFile) {
    return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        ...(file.headRevisionId ? { headRevisionId: file.headRevisionId } : {}),
        modifiedTime: file.modifiedTime,
        size: String(new TextEncoder().encode(file.content).length),
        appProperties: file.appProperties,
        trashed: file.trashed,
        capabilities: { canEdit: file.canEdit },
        ...(file.lastModifyingUser ? { lastModifyingUser: { displayName: file.lastModifyingUser } } : {}),
    };
}

const errorBody = (status: number, reason: string) => JSON.stringify({ error: { code: status, message: "provider text that must never surface", errors: [{ reason, message: "x" }] } });

export function createFakeDrive() {
    const files = new Map<string, FakeDriveFile>();
    const validTokens = new Set<string>();
    const calls: FakeCall[] = [];
    const revoked: string[] = [];
    const failures: InjectedFailure[] = [];
    let counter = 0;
    let clock = Date.parse("2026-10-11T12:00:00.000Z");
    let offline = false;
    let listPageSize: number | null = null;
    const pickQueue: Array<PickedFile[] | Error> = [];
    const pickInputs: Array<{ accessToken: string; apiKey: string; appId: string }> = [];
    let nextToken: TokenResult | Error | null = null;
    let tokenLifetimeSeconds = 3599;

    const tick = () => new Date((clock += 1000)).toISOString();
    const newRevision = () => `rev-${++counter}`;

    function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
        return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
    }

    function addFile(input: Partial<FakeDriveFile> & { name: string; content?: string }): FakeDriveFile {
        const file: FakeDriveFile = {
            id: input.id ?? `file-${++counter}`,
            name: input.name,
            mimeType: input.mimeType ?? "application/json",
            content: input.content ?? "",
            headRevisionId: input.mimeType === FOLDER ? undefined : (input.headRevisionId ?? newRevision()),
            modifiedTime: input.modifiedTime ?? tick(),
            appProperties: input.appProperties ?? {},
            parents: input.parents ?? [],
            trashed: input.trashed ?? false,
            canEdit: input.canEdit ?? true,
            ...(input.lastModifyingUser ? { lastModifyingUser: input.lastModifyingUser } : {}),
        };
        files.set(file.id, file);
        return file;
    }

    const fetch: typeof globalThis.fetch = async (input, init = {}) => {
        if (offline) throw new TypeError("Failed to fetch");
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const method = (init.method ?? "GET").toUpperCase();
        const headers = new Headers(init.headers);
        const authorization = headers.get("Authorization");
        calls.push({ method, path: url.pathname, query: url.searchParams, authorization });
        if (url.origin !== "https://www.googleapis.com") return json({}, 400);
        if (!authorization?.startsWith("Bearer ") || !validTokens.has(authorization.slice(7))) return new Response(errorBody(401, "authError"), { status: 401 });
        const failure = failures.findIndex((entry) => !entry.method || entry.method === method);
        if (failure >= 0) {
            const [entry] = failures.splice(failure, 1);
            return new Response(errorBody(entry.status, entry.reason ?? "backendError"), { status: entry.status, headers: entry.headers });
        }

        const body = typeof init.body === "string" ? init.body : "";
        const upload = url.pathname.startsWith("/upload/drive/v3/files");
        const idMatch = /\/files\/([^/]+)$/.exec(url.pathname);
        const id = idMatch ? decodeURIComponent(idMatch[1]) : null;

        if (!upload && url.pathname === "/drive/v3/files" && method === "GET") {
            const q = url.searchParams.get("q") ?? "";
            const all = [...files.values()].filter((file) => matches(file, q)).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
            const size = listPageSize ?? Number(url.searchParams.get("pageSize") ?? 100);
            const start = Number(url.searchParams.get("pageToken") ?? 0);
            const page = all.slice(start, start + size);
            const next = start + size < all.length ? String(start + size) : undefined;
            return json({ files: page.map(resource), ...(next ? { nextPageToken: next } : {}) });
        }
        if (!upload && url.pathname === "/drive/v3/files" && method === "POST") {
            const metadata = JSON.parse(body) as { name: string; mimeType: string; appProperties?: Record<string, string> };
            const created = addFile({ name: metadata.name, mimeType: metadata.mimeType, appProperties: metadata.appProperties ?? {} });
            return json(resource(created));
        }
        if (!upload && id && method === "GET") {
            const file = files.get(id);
            if (!file) return new Response(errorBody(404, "notFound"), { status: 404 });
            if (url.searchParams.get("alt") === "media") return new Response(file.content, { status: 200, headers: { "Content-Type": file.mimeType } });
            return json(resource(file));
        }
        if (upload && url.searchParams.get("uploadType") === "multipart") {
            const { metadata, content } = parseMultipart(body, headers.get("Content-Type") ?? "");
            if (method === "POST" && !id) {
                const created = addFile({
                    name: String(metadata.name),
                    mimeType: String(metadata.mimeType),
                    content,
                    parents: (metadata.parents as string[] | undefined) ?? [],
                    appProperties: (metadata.appProperties as Record<string, string> | undefined) ?? {},
                });
                return json(resource(created));
            }
            if (method === "PATCH" && id) {
                const file = files.get(id);
                if (!file) return new Response(errorBody(404, "notFound"), { status: 404 });
                if (!file.canEdit) return new Response(errorBody(403, "insufficientFilePermissions"), { status: 403 });
                file.content = content;
                file.headRevisionId = newRevision();
                file.modifiedTime = tick();
                file.appProperties = { ...file.appProperties, ...((metadata.appProperties as Record<string, string> | undefined) ?? {}) };
                return json(resource(file));
            }
        }
        return json({}, 400);
    };

    const auth: GoogleAuth & { prepared: number } = {
        prepared: 0,
        prepare: async () => {
            auth.prepared++;
        },
        requestToken: async () => {
            const queued = nextToken;
            nextToken = null;
            if (queued instanceof Error) throw queued;
            if (queued) return queued;
            const value = `token-${++counter}`;
            validTokens.add(value);
            return { ok: true, accessToken: value, expiresInSeconds: tokenLifetimeSeconds };
        },
        revoke: async (token) => {
            revoked.push(token);
            validTokens.delete(token);
        },
    };

    const picker: GooglePicker & { prepared: number } = {
        prepared: 0,
        prepare: async () => {
            picker.prepared++;
        },
        pick: async (input) => {
            pickInputs.push(input);
            const next = pickQueue.shift();
            if (next instanceof Error) throw next;
            return next ?? [];
        },
    };

    return {
        files,
        calls,
        revoked,
        pickInputs,
        fetch,
        auth,
        picker,
        addFile,
        /** Requests that reached the API (not the token or picker). */
        apiCalls: () => calls.map((call) => `${call.method} ${call.path}${call.query.get("alt") === "media" ? "?alt=media" : ""}`),
        rename: (fileId: string, name: string) => {
            const file = files.get(fileId)!;
            file.name = name;
            file.modifiedTime = tick();
        },
        remove: (fileId: string) => void files.delete(fileId),
        overwrite: (fileId: string, content: string, by?: string) => {
            const file = files.get(fileId)!;
            file.content = content;
            file.headRevisionId = newRevision();
            file.modifiedTime = tick();
            if (by) file.lastModifyingUser = by;
        },
        withdrawTokens: () => validTokens.clear(),
        goOffline: () => void (offline = true),
        goOnline: () => void (offline = false),
        failNext: (failure: InjectedFailure) => void failures.push(failure),
        queuePick: (result: PickedFile[] | Error) => void pickQueue.push(result),
        queueToken: (result: TokenResult | Error) => void (nextToken = result),
        setTokenLifetime: (seconds: number) => void (tokenLifetimeSeconds = seconds),
        setListPageSize: (size: number) => void (listPageSize = size),
    };
}

export type FakeDrive = ReturnType<typeof createFakeDrive>;
