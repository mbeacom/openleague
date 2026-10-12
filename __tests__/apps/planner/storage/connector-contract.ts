/**
 * The connector contract (storage connectors spec, Testing): one suite every
 * StorageConnector must pass. Each connector's test file calls
 * describeConnectorContract with a factory that returns the connector plus the
 * hooks that change the remote behind its back.
 */
import { describe, expect, it } from "vitest";
import { refOf, type RemoteFile, type RemoteRef, type SaveInput, type StorageConnector } from "@/apps/planner/src/storage/connector";

export interface ContractSubject {
    connector: StorageConnector;
    /** A metadata-only change made outside the connector (a rename in the provider's UI). */
    rename: (ref: RemoteRef, name: string) => Promise<void>;
    /** The file is deleted, or access withdrawn, outside the connector. */
    removeRemote: (ref: RemoteRef) => Promise<void>;
    /** Another writer saves new content. */
    overwriteRemote: (ref: RemoteRef, text: string) => Promise<void>;
    /** The token is withdrawn and silent renewal fails. */
    withdrawAuth: () => void;
    /** The network fails. Absent for a connector with no network (local files), which skips the offline case. */
    goOffline?: () => void;
}

const KIND = "openleague.rankings";
const OTHER_KIND = "openleague.practice-plan";
const DOCUMENT_ID = "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11";

function create(name: string, text: string, kind = KIND): SaveInput {
    return { ref: null, name, text, kind, documentId: DOCUMENT_ID, expectedRevision: null };
}

function overwrite(file: RemoteFile, text: string, expectedRevision: string): SaveInput {
    // refOf keeps driveId, which a connector addressing files by drive (OneDrive) needs.
    return { ref: refOf(file), name: file.name, text, kind: KIND, documentId: DOCUMENT_ID, expectedRevision };
}

async function created(connector: StorageConnector, name = "fall.rankings.json", text = '{"a":1}\n', kind = KIND): Promise<RemoteFile> {
    const result = await connector.save(create(name, text, kind));
    if (!result.ok) throw new Error(`create failed: ${result.error.code}`);
    return result.value;
}

export function describeConnectorContract(name: string, make: () => ContractSubject | Promise<ContractSubject>): void {
    describe(`${name} connector contract`, () => {
        it("is connected and says how strong its conditional write is", async () => {
            const { connector } = await make();
            expect(connector.status()).toBe("connected");
            expect(["atomic", "check-then-write", "none"]).toContain(connector.capabilities.conditionalWrite);
        });

        it("returns the same text when a created file is opened", async () => {
            const { connector } = await make();
            const file = await created(connector, "fall.rankings.json", '{"title":"Fall"}\n');
            expect(file).toMatchObject({ connector: connector.id, name: "fall.rankings.json", size: 17 });
            expect(typeof file.revision).toBe("string");
            expect(Number.isNaN(Date.parse(file.modifiedAt))).toBe(false);
            const opened = await connector.open(file);
            expect(opened.ok && opened.value.text).toBe('{"title":"Fall"}\n');
            expect(opened.ok && opened.value.file.revision).toBe(file.revision);
        });

        it("moves the revision on a content save", async () => {
            const { connector } = await make();
            const file = await created(connector);
            const saved = await connector.save(overwrite(file, '{"a":2}\n', file.revision));
            expect(saved.ok).toBe(true);
            if (saved.ok) expect(saved.value.revision).not.toBe(file.revision);
        });

        it("refuses a save with a stale expected revision as a conflict carrying the remote's revision", async () => {
            const { connector, overwriteRemote } = await make();
            const file = await created(connector);
            await overwriteRemote(file, '{"theirs":true}\n');
            const current = await connector.open(file);
            if (!current.ok) throw new Error("open failed");

            const stale = await connector.save(overwrite(file, '{"mine":true}\n', file.revision));
            expect(stale.ok).toBe(false);
            if (stale.ok || stale.error.code !== "conflict") throw new Error("expected a conflict");
            expect(stale.error.remote.revision).toBe(current.value.file.revision);
            // Nothing was written.
            const after = await connector.open(file);
            expect(after.ok && after.value.text).toBe('{"theirs":true}\n');

            // "Keep mine": the revision the conflict returned.
            const kept = await connector.save(overwrite(file, '{"mine":true}\n', stale.error.remote.revision));
            expect(kept.ok).toBe(true);
            const final = await connector.open(file);
            expect(final.ok && final.value.text).toBe('{"mine":true}\n');
        });

        it("doesn't move the revision on a metadata-only change", async () => {
            const { connector, rename } = await make();
            const file = await created(connector);
            await rename(file, "fall (renamed).rankings.json");
            const opened = await connector.open(file);
            expect(opened.ok && opened.value.file.revision).toBe(file.revision);
            expect(opened.ok && opened.value.file.name).toBe("fall (renamed).rankings.json");
        });

        it("says not-found after a remote delete", async () => {
            const { connector, removeRemote } = await make();
            const file = await created(connector);
            await removeRemote(file);
            expect(await connector.open(file)).toEqual({ ok: false, error: { code: "not-found" } });
            expect(await connector.save(overwrite(file, "{}", file.revision))).toEqual({ ok: false, error: { code: "not-found" } });
        });

        it("says auth-required when the token is withdrawn, until connect", async () => {
            const subject = await make();
            const file = await created(subject.connector);
            subject.withdrawAuth();
            expect(await subject.connector.open(file)).toEqual({ ok: false, error: { code: "auth-required" } });
            expect(await subject.connector.save(create("x.rankings.json", "{}"))).toEqual({ ok: false, error: { code: "auth-required" } });
            expect(await subject.connector.connect()).toEqual({ ok: true, value: undefined });
            expect((await subject.connector.open(file)).ok).toBe(true);
        });

        it("says offline when the network fails", async () => {
            const subject = await make();
            if (!subject.goOffline) return;
            const file = await created(subject.connector);
            subject.goOffline();
            expect(await subject.connector.open(file)).toEqual({ ok: false, error: { code: "offline" } });
            expect(await subject.connector.save(overwrite(file, "{}", file.revision))).toEqual({ ok: false, error: { code: "offline" } });
        });

        it("lists its files, filtered by kind", async () => {
            const { connector } = await make();
            if (!connector.capabilities.list) return;
            const rankings = await created(connector, "fall.rankings.json", "{}", KIND);
            await created(connector, "tuesday.olplan.json", "{}", OTHER_KIND);
            const listed = await connector.list({ kind: KIND });
            expect(listed.ok && listed.value.map((file) => file.fileId)).toEqual([rankings.fileId]);
            const all = await connector.list();
            expect(all.ok && all.value.length).toBe(2);
        });

        it("returns no files when the picker is cancelled", async () => {
            const { connector } = await make();
            if (!connector.capabilities.pick) return;
            expect(await connector.pickToOpen({ kind: KIND })).toEqual({ ok: true, value: [] });
        });
    });
}
