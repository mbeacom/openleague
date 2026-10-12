import { describe, expect, it } from "vitest";
import { createLocalFileConnector, fileSystemAccess, revisionOf } from "@/apps/planner/src/storage/local-file";
import { describeConnectorContract } from "./connector-contract";
import { createFakeFsa, memoryHandleStore } from "./fake-fsa";

let ids = 0;
const newId = () => `local-${++ids}`;

describeConnectorContract("local file (File System Access)", () => {
    const fsa = createFakeFsa();
    const connector = createLocalFileConnector({ pickers: fsa.pickers, handles: memoryHandleStore(), newId });
    return {
        // connect() is called from a tap: the fake's next calls run inside one.
        connector: {
            ...connector,
            connect: async () => {
                fsa.activate();
                return connector.connect();
            },
        },
        rename: async (ref, name) => fsa.rename(ref.name, name),
        removeRemote: async (ref) => fsa.remove(ref.name),
        overwriteRemote: async (ref, text) => fsa.overwrite(ref.name, text),
        withdrawAuth: () => fsa.withdraw(),
    };
});

const KIND = "openleague.rankings";
const DOC = "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11";

function subject() {
    const fsa = createFakeFsa();
    const handles = memoryHandleStore();
    const connector = createLocalFileConnector({ pickers: fsa.pickers, handles, newId });
    return { fsa, handles, connector };
}

describe("local file connector", () => {
    it("is unconfigured without the File System Access API, and refuses every call", async () => {
        const connector = createLocalFileConnector({ pickers: null, handles: memoryHandleStore() });
        expect(connector.status()).toBe("unconfigured");
        expect(await connector.connect()).toEqual({ ok: false, error: { code: "unavailable" } });
        expect(await connector.save({ ref: null, name: "x.json", text: "{}", kind: KIND, documentId: DOC, expectedRevision: null })).toEqual({
            ok: false,
            error: { code: "unavailable" },
        });
    });

    it("finds the pickers on a window that has them, and none on one that doesn't", () => {
        expect(fileSystemAccess({})).toBeNull();
        expect(fileSystemAccess(null)).toBeNull();
        const scope = { showSaveFilePicker: async () => null, showOpenFilePicker: async () => [] };
        expect(fileSystemAccess(scope)).not.toBeNull();
    });

    it("says it checks, then writes, and can't list", () => {
        const { connector } = subject();
        expect(connector.capabilities).toEqual({ list: false, pick: true, delete: false, conditionalWrite: "check-then-write" });
    });

    it("reports a dismissed save picker as cancelled, and writes nothing", async () => {
        const { fsa, connector, handles } = subject();
        fsa.queueSave("cancel");
        expect(await connector.save({ ref: null, name: "fall.rankings.json", text: "{}", kind: KIND, documentId: DOC, expectedRevision: null })).toEqual({
            ok: false,
            error: { code: "cancelled" },
        });
        expect(handles.map.size).toBe(0);
    });

    it("keeps the handle of a saved file, and uses the revision of its lastModified, size and content", async () => {
        const { fsa, connector, handles } = subject();
        const saved = await connector.save({ ref: null, name: "fall.rankings.json", text: "{}\n", kind: KIND, documentId: DOC, expectedRevision: null });
        if (!saved.ok) throw new Error(saved.error.code);
        expect(handles.map.has(saved.value.fileId)).toBe(true);
        const file = await fsa.handleFor("fall.rankings.json").getFile();
        expect(saved.value.revision).toBe(await revisionOf(file, await file.text()));
        expect(saved.value.modifiedAt).toBe(new Date(file.lastModified).toISOString());
    });

    it("writes the format of the name the coach typed into the save picker", async () => {
        const { fsa, connector } = subject();
        fsa.queueSave("fall.rankings.yaml");
        const text = `${JSON.stringify({ format: "openleague.rankings", version: 1, meta: { title: "Fall" } }, null, 2)}\n`;
        const saved = await connector.save({ ref: null, name: "fall.rankings.json", text, kind: KIND, documentId: DOC, expectedRevision: null });
        expect(saved.ok && saved.value.name).toBe("fall.rankings.yaml");
        const written = fsa.read("fall.rankings.yaml") ?? "";
        expect(written).toContain("format: openleague.rankings");
        expect(written.trimStart().startsWith("{")).toBe(false);
    });

    it("refuses an overwrite when the file moved since the expected revision, without writing", async () => {
        const { fsa, connector } = subject();
        const saved = await connector.save({ ref: null, name: "fall.rankings.json", text: "{}\n", kind: KIND, documentId: DOC, expectedRevision: null });
        if (!saved.ok) throw new Error(saved.error.code);
        fsa.overwrite("fall.rankings.json", '{"theirs":1}\n');
        const writes = fsa.writes;
        const stale = await connector.save({ ref: saved.value, name: saved.value.name, text: '{"mine":1}\n', kind: KIND, documentId: DOC, expectedRevision: saved.value.revision });
        expect(stale.ok === false && stale.error.code).toBe("conflict");
        expect(fsa.writes).toBe(writes);
        expect(fsa.read("fall.rankings.json")).toBe('{"theirs":1}\n');
    });

    it("refuses an overwrite when another app changed the content but not its time or size", async () => {
        const { fsa, connector } = subject();
        const saved = await connector.save({ ref: null, name: "fall.rankings.json", text: '{"a":1}\n', kind: KIND, documentId: DOC, expectedRevision: null });
        if (!saved.ok) throw new Error(saved.error.code);
        fsa.overwriteKeepingTime("fall.rankings.json", '{"b":2}\n');
        const writes = fsa.writes;
        const stale = await connector.save({ ref: saved.value, name: saved.value.name, text: '{"c":3}\n', kind: KIND, documentId: DOC, expectedRevision: saved.value.revision });
        expect(stale.ok === false && stale.error.code).toBe("conflict");
        expect(fsa.writes).toBe(writes);
        expect(fsa.read("fall.rankings.json")).toBe('{"b":2}\n');
    });

    it("asks for permission from a tap, and says auth-required when the coach refuses", async () => {
        const { fsa, connector } = subject();
        const saved = await connector.save({ ref: null, name: "fall.rankings.json", text: "{}\n", kind: KIND, documentId: DOC, expectedRevision: null });
        if (!saved.ok) throw new Error(saved.error.code);
        fsa.withdraw();
        // A focus check outside a tap can't ask.
        expect(await connector.open(saved.value)).toEqual({ ok: false, error: { code: "auth-required" } });
        fsa.activate();
        fsa.denyPrompts(true);
        expect(await connector.open(saved.value)).toEqual({ ok: false, error: { code: "auth-required" } });
        fsa.denyPrompts(false);
        expect((await connector.open(saved.value)).ok).toBe(true);
    });

    it("opens a picked file through its stored handle, and returns nothing when the picker is cancelled", async () => {
        const { fsa, connector, handles } = subject();
        fsa.seed("shared.rankings.json", '{"a":1}\n');
        fsa.queueOpen(["shared.rankings.json"]);
        const picked = await connector.pickToOpen({ kind: KIND });
        if (!picked.ok) throw new Error(picked.error.code);
        expect(picked.value).toEqual([{ connector: "local-file", fileId: expect.any(String), name: "shared.rankings.json" }]);
        expect(handles.map.size).toBe(1);
        const opened = await connector.open(picked.value[0]);
        expect(opened.ok && opened.value.text).toBe('{"a":1}\n');
        fsa.queueOpen("cancel");
        expect(await connector.pickToOpen()).toEqual({ ok: true, value: [] });
    });

    it("says not-found for a file id with no stored handle", async () => {
        const { connector } = subject();
        expect(await connector.open({ connector: "local-file", fileId: "gone", name: "x.json" })).toEqual({ ok: false, error: { code: "not-found" } });
    });
});
