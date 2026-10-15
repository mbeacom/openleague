import { describe, expect, it } from "vitest";
import { DOCUMENT_KINDS, ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import type { GoogleCloudSettings } from "@/apps/planner/cloud-config";
import type { RemoteFile, SaveInput, StorageConnector } from "@/apps/planner/src/storage/connector";
import { createMemoryLocationStore } from "@/apps/planner/src/store/locations";
import { DRIVE_FOLDER_NAME, DRIVE_UPLOAD_API, createGoogleDriveConnector, driveQuoted } from "@/apps/planner/src/storage/google-drive";
import { GOOGLE_DRIVE_CAPABILITIES, createLazyGoogleDriveConnector } from "@/apps/planner/src/storage/google-drive-lazy";
import { describeConnectorContract } from "./connector-contract";
import { createFakeDrive, type FakeDrive } from "./fake-drive";

/** Fictional settings in each value's shape. */
const SETTINGS: GoogleCloudSettings = { clientId: "123-fictional.apps.googleusercontent.com", apiKey: "fictional-key", appId: "123456789" };
const KIND = "openleague.rankings";
const DOC = "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11";

function subject(options: { now?: () => number } = {}) {
    const drive = createFakeDrive();
    let boundaries = 0;
    const connector = createGoogleDriveConnector({
        settings: SETTINGS,
        fetch: drive.fetch,
        auth: drive.auth,
        picker: drive.picker,
        boundary: () => `test-boundary-${++boundaries}`,
        ...options,
    });
    return { drive, connector };
}

async function connected(options: { now?: () => number } = {}) {
    const made = subject(options);
    const result = await made.connector.connect();
    if (!result.ok) throw new Error(`connect failed: ${result.error.code}`);
    return made;
}

const create = (name = "fall.rankings.json", text = '{"a":1}\n', kind = KIND): SaveInput => ({ ref: null, name, text, kind, documentId: DOC, expectedRevision: null });

async function created(connector: StorageConnector, input = create()): Promise<RemoteFile> {
    const result = await connector.save(input);
    if (!result.ok) throw new Error(`create failed: ${result.error.code}`);
    return result.value;
}

const overwrite = (file: RemoteFile, text: string, expectedRevision: string | null): SaveInput => ({
    ref: { connector: "google-drive", fileId: file.fileId, name: file.name },
    name: file.name,
    text,
    kind: KIND,
    documentId: DOC,
    expectedRevision,
});

describeConnectorContract("Google Drive (fake Drive REST)", async () => {
    const { drive, connector } = await connected();
    return {
        connector,
        rename: async (ref, name) => drive.rename(ref.fileId, name),
        removeRemote: async (ref) => drive.remove(ref.fileId),
        overwriteRemote: async (ref, text) => drive.overwrite(ref.fileId, text),
        withdrawAuth: () => drive.withdrawTokens(),
        goOffline: () => drive.goOffline(),
    };
});

describe("Google Drive connector", () => {
    it("checks, then writes, lists, picks and doesn't delete", () => {
        const { connector } = subject();
        expect(connector.id).toBe("google-drive");
        expect(connector.capabilities).toEqual({ list: true, pick: true, delete: false, conditionalWrite: "check-then-write" });
        expect(connector.delete).toBeUndefined();
    });

    it("is disconnected until connect, with no request made", async () => {
        const { drive, connector } = subject();
        expect(connector.status()).toBe("disconnected");
        expect(await connector.save(create())).toEqual({ ok: false, error: { code: "auth-required" } });
        expect(await connector.pickToOpen()).toEqual({ ok: false, error: { code: "auth-required" } });
        expect(drive.calls).toEqual([]);
        expect(drive.pickInputs).toEqual([]);
    });

    it("uses headRevisionId as the revision, and the provider's clock and author", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        const stored = drive.files.get(file.fileId)!;
        expect(file.revision).toBe(stored.headRevisionId);
        expect(file.modifiedAt).toBe(stored.modifiedTime);
        drive.overwrite(file.fileId, '{"b":2}\n', "Coach Avery");
        const opened = await connector.open(file);
        expect(opened.ok && opened.value.file).toMatchObject({ revision: stored.headRevisionId, modifiedBy: "Coach Avery", kind: KIND });
    });

    it("creates files in a kind subfolder of its own tagged folder, with private appProperties naming the kind and the envelope id", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        const folders = [...drive.files.values()].filter((entry) => entry.mimeType === "application/vnd.google-apps.folder");
        expect(folders).toHaveLength(2);
        const root = folders.find((entry) => entry.appProperties.olFolder === "documents")!;
        expect(root).toMatchObject({ name: DRIVE_FOLDER_NAME, parents: [] });
        const rankings = folders.find((entry) => entry.appProperties.olFolder === KIND)!;
        expect(rankings).toMatchObject({ name: "Rankings", parents: [root.id] });
        expect(drive.files.get(file.fileId)).toMatchObject({
            name: "fall.rankings.json",
            mimeType: "application/json",
            content: '{"a":1}\n',
            parents: [rankings.id],
            appProperties: { olKind: KIND, olId: DOC },
        });
        // The folders are looked up once per session.
        await created(connector, create("spring.rankings.json"));
        expect(drive.apiCalls().filter((call) => call === "POST /drive/v3/files")).toHaveLength(2);
        expect(drive.apiCalls().filter((call) => call === "GET /drive/v3/files")).toHaveLength(2);
    });

    it("finds the folders another device made, and renamed, by their tags", async () => {
        const drive = createFakeDrive();
        const make = () => createGoogleDriveConnector({ settings: SETTINGS, fetch: drive.fetch, auth: drive.auth, picker: drive.picker });
        const first = make();
        await first.connect();
        const earlier = await created(first);
        const subfolder = drive.files.get(earlier.fileId)!.parents[0];
        const root = [...drive.files.values()].find((entry) => entry.appProperties.olFolder === "documents")!;
        drive.rename(root.id, "Team files");
        drive.rename(subfolder, "Standings");
        const second = make();
        await second.connect();
        const file = await created(second, create("spring.rankings.json"));
        expect(drive.files.get(file.fileId)!.parents).toEqual([subfolder]);
        expect([...drive.files.values()].filter((entry) => entry.mimeType === "application/vnd.google-apps.folder")).toHaveLength(2);
    });

    it("saves into the kind subfolder of a folder the coach chose with the Picker, and keeps the choice", async () => {
        const drive = createFakeDrive();
        const locations = createMemoryLocationStore();
        const connector = createGoogleDriveConnector({ settings: SETTINGS, fetch: drive.fetch, auth: drive.auth, picker: drive.picker, locations });
        await connector.connect();
        const chosen = drive.addFile({ name: "U12 Hawks", mimeType: "application/vnd.google-apps.folder" });
        drive.queueFolderPick({ id: chosen.id, name: chosen.name });
        expect(await connector.chooseLocation!()).toEqual({ ok: true, value: { name: "U12 Hawks" } });
        expect(await connector.location!()).toEqual({ name: "U12 Hawks", chosen: true });
        const file = await created(connector);
        const parent = drive.files.get(drive.files.get(file.fileId)!.parents[0])!;
        expect(parent).toMatchObject({ name: "Rankings", parents: [chosen.id] });
        // No default folder was made.
        expect([...drive.files.values()].some((entry) => entry.appProperties.olFolder === "documents")).toBe(false);

        await connector.resetLocation!();
        expect(await connector.location!()).toEqual({ name: DRIVE_FOLDER_NAME, chosen: false });
    });

    it("leaves the location alone when the coach cancels the folder Picker", async () => {
        const drive = createFakeDrive();
        const locations = createMemoryLocationStore();
        const connector = createGoogleDriveConnector({ settings: SETTINGS, fetch: drive.fetch, auth: drive.auth, picker: drive.picker, locations });
        await connector.connect();
        drive.queueFolderPick(null);
        expect(await connector.chooseLocation!()).toEqual({ ok: true, value: null });
        expect(await locations.get("google-drive")).toBeUndefined();
    });

    it("refuses to save, without falling back, when the chosen folder was trashed or is out of reach", async () => {
        const drive = createFakeDrive();
        const chosen = drive.addFile({ name: "U12 Hawks", mimeType: "application/vnd.google-apps.folder" });
        const locations = createMemoryLocationStore({ "google-drive": { folderId: chosen.id, name: "U12 Hawks", chosenAt: "2026-10-15T00:00:00.000Z" } });
        const connector = createGoogleDriveConnector({ settings: SETTINGS, fetch: drive.fetch, auth: drive.auth, picker: drive.picker, locations });
        await connector.connect();
        drive.files.get(chosen.id)!.trashed = true;
        expect(await connector.save(create())).toEqual({ ok: false, error: { code: "location-missing" } });
        drive.remove(chosen.id);
        expect(await connector.save(create())).toEqual({ ok: false, error: { code: "location-missing" } });
        expect([...drive.files.values()].filter((entry) => entry.mimeType !== "application/vnd.google-apps.folder")).toHaveLength(0);
    });

    it("saves YAML, TOML and JSONC files with their own types", async () => {
        const { drive, connector } = await connected();
        const yaml = await created(connector, create("fall.rankings.yaml", "format: x\n"));
        const jsonc = await created(connector, create("fall.rankings.jsonc", "// c\n{}"));
        expect(drive.files.get(yaml.fileId)!.mimeType).toBe("application/yaml");
        expect(drive.files.get(jsonc.fileId)!.mimeType).toBe("text/plain");
        expect(drive.files.get(jsonc.fileId)!.content).toBe("// c\n{}");
    });

    it("reads the file's metadata immediately before every overwrite", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        drive.calls.length = 0;
        const saved = await connector.save(overwrite(file, '{"a":2}\n', file.revision));
        expect(saved.ok).toBe(true);
        expect(drive.apiCalls()).toEqual([`GET /drive/v3/files/${file.fileId}`, `PATCH /upload/drive/v3/files/${file.fileId}`]);
        expect(drive.calls[0].query.get("fields")).toContain("headRevisionId");
        expect(drive.calls[1].query.get("uploadType")).toBe("multipart");
        // An overwrite keeps the file's tags and name.
        expect(drive.files.get(file.fileId)).toMatchObject({ name: "fall.rankings.json", content: '{"a":2}\n', appProperties: { olKind: KIND, olId: DOC } });
    });

    it("refuses an overwrite with no expected revision as a conflict, and writes nothing", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        const result = await connector.save(overwrite(file, "{}", null));
        expect(!result.ok && result.error.code).toBe("conflict");
        expect(drive.files.get(file.fileId)!.content).toBe('{"a":1}\n');
    });

    it("refuses to write to a view-only share before trying, so the coach can save a copy (R8)", async () => {
        const { drive, connector } = await connected();
        const shared = drive.addFile({ name: "shared.rankings.json", content: "{}", canEdit: false });
        const opened = await connector.open({ connector: "google-drive", fileId: shared.id, name: shared.name });
        if (!opened.ok) throw new Error("open failed");
        drive.calls.length = 0;
        expect(await connector.save(overwrite(opened.value.file, '{"mine":1}', opened.value.file.revision))).toEqual({ ok: false, error: { code: "forbidden" } });
        expect(drive.apiCalls()).toEqual([`GET /drive/v3/files/${shared.id}`]);
        expect(drive.files.get(shared.id)!.content).toBe("{}");
    });

    it("maps a write refused for permissions to forbidden", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        drive.failNext({ status: 403, reason: "insufficientFilePermissions", method: "PATCH" });
        expect(await connector.save(overwrite(file, "{}", file.revision))).toEqual({ ok: false, error: { code: "forbidden" } });
    });

    it("treats a trashed file as gone", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        drive.files.get(file.fileId)!.trashed = true;
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "not-found" } });
        expect(await connector.save(overwrite(file, "{}", file.revision))).toEqual({ ok: false, error: { code: "not-found" } });
    });

    it("lists by appProperties across pages, newest first, leaving out folders and untagged files", async () => {
        const { drive, connector } = await connected();
        drive.addFile({ name: "untagged.rankings.json", content: "{}" });
        const a = await created(connector, create("a.rankings.json"));
        const b = await created(connector, create("b.rankings.json"));
        const plan = await created(connector, create("tuesday.olplan.json", "{}", "openleague.practice-plan"));
        drive.setListPageSize(1);
        const rankings = await connector.list({ kind: KIND });
        expect(rankings.ok && rankings.value.map((file) => file.fileId)).toEqual([b.fileId, a.fileId]);
        const query = drive.calls.filter((call) => call.method === "GET" && call.path === "/drive/v3/files").at(-1)!.query.get("q");
        expect(query).toBe(`(appProperties has { key='olKind' and value='${KIND}' }) and trashed=false`);
        const all = await connector.list();
        expect(all.ok && all.value.map((file) => file.fileId).sort()).toEqual([a.fileId, b.fileId, plan.fileId].sort());
    });

    it("quotes Drive query literals", () => {
        expect(driveQuoted("it's a \\ test")).toBe("'it\\'s a \\\\ test'");
    });

    it("opens files picked in the Picker with the token, the API key and the project number (R5)", async () => {
        const { drive, connector } = await connected();
        drive.queuePick([{ id: "file-picked", name: "shared.rankings.json" }]);
        expect(await connector.pickToOpen({ kind: KIND })).toEqual({ ok: true, value: [{ connector: "google-drive", fileId: "file-picked", name: "shared.rankings.json" }] });
        expect(drive.pickInputs).toEqual([{ accessToken: expect.stringMatching(/^token-/), apiKey: "fictional-key", appId: "123456789" }]);
        drive.queuePick(new Error("picker failed to load"));
        expect(await connector.pickToOpen()).toEqual({ ok: false, error: { code: "unavailable" } });
    });

    it("sends the token only in the Authorization header", async () => {
        const { drive, connector } = await connected();
        await created(connector);
        for (const call of drive.calls) {
            expect(call.authorization).toMatch(/^Bearer token-/);
            expect(call.query.toString()).not.toContain("token-");
        }
    });

    it("drops the token on a 401, and asks again only through connect", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        drive.withdrawTokens();
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "auth-required" } });
        expect(connector.status()).toBe("disconnected");
        const before = drive.calls.length;
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "auth-required" } });
        expect(drive.calls.length).toBe(before);
    });

    it("treats a token as expired a minute before Google says, with no request", async () => {
        let now = Date.parse("2026-10-11T12:00:00.000Z");
        const { drive, connector } = await connected({ now: () => now });
        drive.setTokenLifetime(3600);
        await connector.disconnect();
        await connector.connect();
        expect(connector.status()).toBe("connected");
        now += 3600_000 - 59_000;
        expect(connector.status()).toBe("disconnected");
        const before = drive.calls.length;
        expect(await connector.save(create())).toEqual({ ok: false, error: { code: "auth-required" } });
        expect(drive.calls.length).toBe(before);
    });

    it("maps Drive's errors to codes, never provider text", async () => {
        const { drive, connector } = await connected();
        const file = await created(connector);
        const cases: Array<[Parameters<FakeDrive["failNext"]>[0], unknown]> = [
            [{ status: 403, reason: "userRateLimitExceeded", headers: { "Retry-After": "12" } }, { code: "unavailable", retryAfterSeconds: 12 }],
            [{ status: 403, reason: "rateLimitExceeded" }, { code: "unavailable" }],
            [{ status: 403, reason: "storageQuotaExceeded" }, { code: "quota" }],
            [{ status: 403, reason: "appNotAuthorizedToFile" }, { code: "not-found" }],
            [{ status: 403, reason: "somethingElse" }, { code: "forbidden" }],
            [{ status: 404 }, { code: "not-found" }],
            [{ status: 413 }, { code: "too-large" }],
            [{ status: 429, headers: { "Retry-After": "3" } }, { code: "unavailable", retryAfterSeconds: 3 }],
            [{ status: 503 }, { code: "unavailable" }],
            [{ status: 400 }, { code: "provider", status: 400 }],
        ];
        for (const [failure, error] of cases) {
            drive.failNext(failure);
            const result = await connector.open(file);
            expect(result).toEqual({ ok: false, error });
            expect(JSON.stringify(result)).not.toContain("provider text");
        }
    });

    it("says offline when no response arrives", async () => {
        const { drive, connector } = await connected();
        drive.goOffline();
        expect(await connector.save(create())).toEqual({ ok: false, error: { code: "offline" } });
        expect(await connector.list()).toEqual({ ok: false, error: { code: "offline" } });
    });

    it("refuses a file larger than any document from its metadata, without downloading it", async () => {
        const { drive, connector } = await connected();
        const limit = Math.max(...Object.values(DOCUMENT_KINDS).map((entry) => entry.maxBytes)) + ENVELOPE_OVERHEAD_BYTES;
        const big = drive.addFile({ name: "huge.rankings.json", mimeType: "application/json", content: "x".repeat(limit + 1) });
        expect(await connector.open({ connector: "google-drive", fileId: big.id, name: big.name })).toEqual({ ok: false, error: { code: "too-large" } });
        expect(drive.apiCalls().some((call) => call.endsWith("?alt=media"))).toBe(false);
    });

    it("says offline when the download breaks after the response began", async () => {
        const drive = createFakeDrive();
        const brokenBody: typeof fetch = async (input, init) => {
            const response = await drive.fetch(input, init);
            if (!String(input).includes("alt=media")) return response;
            return new Response(new ReadableStream({ start: (controller) => controller.error(new TypeError("network")) }), { status: 200 });
        };
        const connector = createGoogleDriveConnector({ settings: SETTINGS, fetch: brokenBody, auth: drive.auth, picker: drive.picker });
        await connector.connect();
        const file = await created(connector);
        expect(await connector.open(file)).toEqual({ ok: false, error: { code: "offline" } });
    });

    it("maps the token popup's outcome: cancelled, refused, or Google's script not loading", async () => {
        const { drive, connector } = subject();
        drive.queueToken({ ok: false, reason: "cancelled" });
        expect(await connector.connect()).toEqual({ ok: false, error: { code: "cancelled" } });
        drive.queueToken({ ok: false, reason: "denied" });
        expect(await connector.connect()).toEqual({ ok: false, error: { code: "auth-required" } });
        drive.queueToken(new Error("script failed"));
        expect(await connector.connect()).toEqual({ ok: false, error: { code: "unavailable" } });
        expect(connector.status()).toBe("disconnected");
    });

    it("revokes and drops the token on disconnect; the next save needs connect again", async () => {
        const { drive, connector } = await connected();
        await created(connector);
        await connector.disconnect();
        expect(drive.revoked).toHaveLength(1);
        expect(connector.status()).toBe("disconnected");
        expect(await connector.save(create())).toEqual({ ok: false, error: { code: "auth-required" } });
        // A second disconnect has nothing to revoke.
        await connector.disconnect();
        expect(drive.revoked).toHaveLength(1);
    });

    it("prepares Google's token client and Picker ahead of the tap", async () => {
        const { drive, connector } = subject();
        await connector.prepare?.();
        expect(drive.auth.prepared).toBe(1);
        expect(drive.picker.prepared).toBe(1);
    });

    it("uploads to Drive's upload endpoint as multipart/related", async () => {
        const drive = createFakeDrive();
        const calls: Array<{ url: string; contentType: string | null }> = [];
        const spying = createGoogleDriveConnector({
            settings: SETTINGS,
            auth: drive.auth,
            picker: drive.picker,
            boundary: () => "b-1",
            fetch: async (input, init) => {
                calls.push({ url: String(input), contentType: new Headers(init?.headers).get("Content-Type") });
                return drive.fetch(input, init);
            },
        });
        await spying.connect();
        await created(spying);
        const upload = calls.find((call) => call.url.startsWith(DRIVE_UPLOAD_API))!;
        expect(upload.url).toContain("uploadType=multipart");
        expect(upload.contentType).toBe("multipart/related; boundary=b-1");
    });
});

describe("lazy Google Drive connector", () => {
    it("loads the real connector once, on first use, and forwards to it", async () => {
        const drive = createFakeDrive();
        let loads = 0;
        const lazy = createLazyGoogleDriveConnector(SETTINGS, async (settings) => {
            loads++;
            return createGoogleDriveConnector({ settings, fetch: drive.fetch, auth: drive.auth, picker: drive.picker });
        });
        expect(lazy.capabilities).toEqual(GOOGLE_DRIVE_CAPABILITIES);
        expect(lazy.status()).toBe("disconnected");
        expect(loads).toBe(0);
        await lazy.disconnect();
        expect(loads).toBe(0);
        await lazy.prepare?.();
        expect(await lazy.connect()).toEqual({ ok: true, value: undefined });
        expect(lazy.status()).toBe("connected");
        const file = await created(lazy);
        expect((await lazy.open(file)).ok).toBe(true);
        expect(loads).toBe(1);
    });

    it("reports a chunk that fails to load as unavailable, and tries again next time", async () => {
        const drive = createFakeDrive();
        let attempts = 0;
        const lazy = createLazyGoogleDriveConnector(SETTINGS, async (settings) => {
            if (++attempts === 1) throw new Error("chunk failed");
            return createGoogleDriveConnector({ settings, fetch: drive.fetch, auth: drive.auth, picker: drive.picker });
        });
        await expect(lazy.prepare?.()).resolves.toBeUndefined();
        expect(await lazy.connect()).toEqual({ ok: true, value: undefined });
        expect(attempts).toBe(2);
    });

    it("loads google-drive.ts through import() by default", async () => {
        const lazy = createLazyGoogleDriveConnector(SETTINGS);
        // The real connector loads; with no token yet it asks for connect, making no request.
        const result = await lazy.list();
        expect(result).toEqual({ ok: false, error: { code: "auth-required" } });
    });
});
