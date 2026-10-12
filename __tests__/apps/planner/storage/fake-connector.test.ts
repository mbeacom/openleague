import { describe, expect, it } from "vitest";
import { createFakeConnector, createFakeRemote } from "@/apps/planner/src/storage/fake";
import { describeConnectorContract } from "./connector-contract";

for (const mode of ["atomic", "check-then-write"] as const) {
    describeConnectorContract(`fake (${mode})`, () => {
        const remote = createFakeRemote({ mode });
        const connector = createFakeConnector(remote);
        return {
            connector,
            rename: async (ref, name) => remote.rename(ref.fileId, name),
            removeRemote: async (ref) => remote.remove(ref.fileId),
            overwriteRemote: async (ref, text) => {
                remote.overwrite(ref.fileId, text, "another coach");
            },
            withdrawAuth: () => connector.withdrawAuth(),
            goOffline: () => connector.setOffline(true),
        };
    });
}

describe("fake connector", () => {
    it("reports its mode as its conditional write", () => {
        expect(createFakeConnector(createFakeRemote({ mode: "atomic" })).capabilities.conditionalWrite).toBe("atomic");
        expect(createFakeConnector(createFakeRemote({ mode: "check-then-write" })).capabilities.conditionalWrite).toBe("check-then-write");
    });

    it("lets two clients of one remote see each other's saves, with who saved", async () => {
        const remote = createFakeRemote();
        const a = createFakeConnector(remote, { user: "Coach A" });
        const b = createFakeConnector(remote, { user: "Coach B" });
        const saved = await a.save({ ref: null, name: "fall.rankings.json", text: "{}", kind: "openleague.rankings", documentId: "d", expectedRevision: null });
        if (!saved.ok) throw new Error("save failed");
        const opened = await b.open(saved.value);
        expect(opened.ok && opened.value.file.modifiedBy).toBe("Coach A");
    });

    it("returns a queued pick once", async () => {
        const remote = createFakeRemote();
        const connector = createFakeConnector(remote);
        const file = remote.seed({ name: "shared.rankings.json", text: "{}", kind: "openleague.rankings" });
        connector.queuePick([file]);
        expect(await connector.pickToOpen()).toEqual({ ok: true, value: [{ connector: "local-file", fileId: file.fileId, name: "shared.rankings.json" }] });
        expect(await connector.pickToOpen()).toEqual({ ok: true, value: [] });
    });

    it("refuses a save past its size limit, and an overwrite with no expected revision", async () => {
        const remote = createFakeRemote({ maxBytes: 4 });
        const connector = createFakeConnector(remote);
        expect(await connector.save({ ref: null, name: "x", text: "12345", kind: "k", documentId: "d", expectedRevision: null })).toEqual({ ok: false, error: { code: "too-large" } });
        const file = remote.seed({ name: "x", text: "1" });
        const blind = await connector.save({ ref: file, name: "x", text: "2", kind: "k", documentId: "d", expectedRevision: null });
        expect(blind.ok === false && blind.error.code).toBe("conflict");
    });

    it("deletes only at the expected revision", async () => {
        const remote = createFakeRemote();
        const connector = createFakeConnector(remote);
        const file = remote.seed({ name: "x", text: "1" });
        const stale = await connector.delete!(file, "rev-0");
        expect(stale.ok === false && stale.error.code).toBe("conflict");
        expect(await connector.delete!(file, file.revision)).toEqual({ ok: true, value: undefined });
        expect(remote.peek(file.fileId)).toBeNull();
    });

    it("starts disconnected when asked, and disconnect needs a reconnect", async () => {
        const remote = createFakeRemote();
        const connector = createFakeConnector(remote, { connected: false });
        expect(connector.status()).toBe("disconnected");
        expect(await connector.list()).toEqual({ ok: false, error: { code: "auth-required" } });
        await connector.connect();
        expect(connector.status()).toBe("connected");
        await connector.disconnect();
        expect(connector.status()).toBe("disconnected");
    });
});
