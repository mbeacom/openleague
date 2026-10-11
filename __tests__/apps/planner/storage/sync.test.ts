import { describe, expect, it } from "vitest";
import { createFakeRemote } from "@/apps/planner/src/storage/fake";
import { RECHECK_INTERVAL_MS, copyName, createSyncEngine, hashPayload, needsChoice, syncStateOf, type SyncOutcome, type SyncState } from "@/apps/planner/src/storage/sync";
import { createLinkStore } from "@/apps/planner/src/store/links";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { readDocumentText } from "@/lib/document-envelope";
import { RANKINGS_FORMAT, type RankingsDocument } from "@/lib/rankings-document";
import { DOCUMENT_ID, KEY, createClock, createDevice, memoryDocuments, rankingsTitled, wrappedText } from "./sync-harness";

function expectState(outcome: SyncOutcome, state: SyncState) {
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.state).toBe(state);
}

function remoteTitle(text: string): string | undefined {
    const read = readDocumentText(text, undefined, { kind: RANKINGS_FORMAT });
    return read.ok ? read.document.payload.meta.title : undefined;
}

describe("syncStateOf: the spec's state table", () => {
    const rows: Array<[dirty: boolean, moved: boolean, writtenHere: boolean, state: SyncState]> = [
        [false, false, false, "in-sync"],
        [false, false, true, "in-sync"],
        [true, false, false, "unsaved"],
        [true, false, true, "unsaved"],
        [false, true, false, "newer-available"],
        [false, true, true, "overwritten"],
        [true, true, false, "conflict"],
        [true, true, true, "conflict"],
    ];

    it.each(rows)("dirty %s, remote moved %s, base written here %s → %s", (dirty, moved, writtenHere, state) => {
        expect(syncStateOf({ dirty, baseRevision: "rev-1", baseWrittenHere: writtenHere }, moved ? "rev-2" : "rev-1")).toBe(state);
    });

    it("treats a link with no base revision as moved", () => {
        expect(syncStateOf({ dirty: false, baseRevision: null, baseWrittenHere: false }, "rev-1")).toBe("newer-available");
        expect(syncStateOf({ dirty: true, baseRevision: null, baseWrittenHere: false }, "rev-1")).toBe("conflict");
    });

    it("asks the coach only for overwritten and conflict", () => {
        expect((["in-sync", "unsaved", "newer-available", "overwritten", "conflict"] as const).filter(needsChoice)).toEqual(["overwritten", "conflict"]);
    });
});

describe("copyName and hashPayload", () => {
    it("puts (my copy) before the document extension", () => {
        expect(copyName("fall.rankings.json")).toBe("fall (my copy).rankings.json");
        expect(copyName("tuesday.olplan.yaml")).toBe("tuesday (my copy).olplan.yaml");
        expect(copyName("notes.json")).toBe("notes (my copy).json");
        expect(copyName("plain")).toBe("plain (my copy)");
    });

    it("hashes the payload as SHA-256 hex, the same for the same content", async () => {
        const a = await hashPayload({ x: 1 });
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(await hashPayload({ x: 1 })).toBe(a);
        expect(await hashPayload({ x: 2 })).not.toBe(a);
    });
});

describe("sync engine, row by row", () => {
    function setup(mode: "atomic" | "check-then-write" = "atomic") {
        const clock = createClock();
        const remote = createFakeRemote({ mode, now: () => new Date(clock.now) });
        return { clock, remote, a: createDevice(remote, "Coach A", clock) };
    }

    /** A device that opened a file another coach saved: its base came from a read. */
    async function openedFromRemote(mode?: "atomic" | "check-then-write") {
        const ctx = setup(mode);
        const file = ctx.remote.seed({ name: "fall.rankings.json", text: wrappedText(rankingsTitled("Fall")), kind: RANKINGS_FORMAT, documentId: DOCUMENT_ID });
        expectState(await ctx.a.engine.openLinked(KEY, file), "in-sync");
        return { ...ctx, file };
    }

    /** A device that saved its own document: its base was written here. */
    async function savedHere() {
        const ctx = setup();
        ctx.a.create(rankingsTitled("Fall"));
        const outcome = await ctx.a.engine.saveNew(KEY, "local-file", "fall.rankings.json");
        if (!outcome.ok) throw new Error(outcome.error.code);
        return { ...ctx, fileId: outcome.link.remote.fileId };
    }

    it("saves a new document wrapped in the envelope, with its id, and links it as written here", async () => {
        const { remote, a, fileId } = await savedHere();
        const stored = remote.peek(fileId)!;
        const read = readDocumentText(stored.text, undefined, { kind: RANKINGS_FORMAT });
        expect(read.ok && { id: read.document.id, wrapped: read.document.wrapped, title: read.document.payload.meta.title }).toEqual({ id: DOCUMENT_ID, wrapped: true, title: "Fall" });
        expect(stored.kind).toBe(RANKINGS_FORMAT);
        expect(await a.links.get(KEY)).toMatchObject({ documentId: DOCUMENT_ID, connector: "local-file", baseRevision: stored.revision, baseWrittenHere: true, dirty: false });
    });

    it("in sync: nothing happens", async () => {
        const { remote, a, file } = await openedFromRemote();
        expectState(await a.engine.check(KEY), "in-sync");
        expectState(await a.engine.save(KEY), "in-sync");
        expect(remote.peek(file.fileId)!.revision).toBe(file.revision);
    });

    it("unsaved changes: a check writes nothing; Save writes with the base revision", async () => {
        const { remote, a, file } = await openedFromRemote();
        a.edit("Fall, revised");
        expectState(await a.engine.check(KEY), "unsaved");
        expect(remote.peek(file.fileId)!.revision).toBe(file.revision);

        const saved = await a.engine.save(KEY);
        expectState(saved, "in-sync");
        const stored = remote.peek(file.fileId)!;
        expect(remoteTitle(stored.text)).toBe("Fall, revised");
        expect(await a.links.get(KEY)).toMatchObject({ baseRevision: stored.revision, baseWrittenHere: true, dirty: false });
    });

    it("unsaved changes are also seen through the dirty flag a local edit sets", async () => {
        const { a } = await openedFromRemote();
        await a.engine.noteLocalEdit(KEY);
        expect((await a.links.get(KEY))?.dirty).toBe(true);
        expectState(await a.engine.check(KEY), "unsaved");
    });

    it("newer copy available: refreshed silently, because this device's copy came from a read", async () => {
        const { remote, a, file } = await openedFromRemote();
        const theirs = remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, from B")), "Coach B");
        const outcome = await a.engine.check(KEY);
        expectState(outcome, "newer-available");
        expect(outcome.ok && outcome.refreshed).toBe(true);
        expect(a.title()).toBe("Fall, from B");
        expect(a.documents.recovered).toEqual([]);
        expect(await a.links.get(KEY)).toMatchObject({ baseRevision: theirs.revision, baseWrittenHere: false, dirty: false });
    });

    it("overwritten: a remote that moved past this device's own save is the coach's choice, never a refresh", async () => {
        const { remote, a, fileId } = await savedHere();
        remote.overwrite(fileId, wrappedText(rankingsTitled("Fall, from B")), "Coach B");
        const outcome = await a.engine.check(KEY);
        expectState(outcome, "overwritten");
        expect(outcome.ok && outcome.remote?.modifiedBy).toBe("Coach B");
        expect(a.title()).toBe("Fall");
    });

    it("conflict: local edits and a moved remote; Save refuses to write over it", async () => {
        const { remote, a, file } = await openedFromRemote();
        a.edit("Fall, mine");
        const theirs = remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, theirs")), "Coach B");
        expectState(await a.engine.check(KEY), "conflict");

        const saved = await a.engine.save(KEY);
        expectState(saved, "conflict");
        expect(saved.ok && saved.remote?.revision).toBe(theirs.revision);
        expect(remoteTitle(remote.peek(file.fileId)!.text)).toBe("Fall, theirs");
        expect(a.title()).toBe("Fall, mine");
        expect((await a.links.get(KEY))?.dirty).toBe(true);
    });

    it("Keep mine writes over the revision just seen and records the base as written here", async () => {
        const { remote, a, file } = await openedFromRemote();
        a.edit("Fall, mine");
        remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, theirs")), "Coach B");
        const conflict = await a.engine.save(KEY);
        if (!conflict.ok || !conflict.remote) throw new Error("expected a conflict");

        expectState(await a.engine.resolve(KEY, "keep-mine", conflict.remote), "in-sync");
        const stored = remote.peek(file.fileId)!;
        expect(remoteTitle(stored.text)).toBe("Fall, mine");
        expect(await a.links.get(KEY)).toMatchObject({ baseRevision: stored.revision, baseWrittenHere: true, dirty: false });
    });

    it("Keep mine still catches a third write that landed after the dialog opened", async () => {
        const { remote, a, file } = await openedFromRemote();
        a.edit("Fall, mine");
        remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, theirs")), "Coach B");
        const conflict = await a.engine.save(KEY);
        if (!conflict.ok || !conflict.remote) throw new Error("expected a conflict");
        remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, a third")), "Coach C");
        const again = await a.engine.resolve(KEY, "keep-mine", conflict.remote);
        expectState(again, "conflict");
        expect(remoteTitle(remote.peek(file.fileId)!.text)).toBe("Fall, a third");
    });

    it("Use theirs replaces the working copy and keeps the replaced one as a recovered copy", async () => {
        const { remote, a, file } = await openedFromRemote();
        a.edit("Fall, mine");
        const theirs = remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, theirs")), "Coach B");
        const conflict = await a.engine.check(KEY);
        if (!conflict.ok || !conflict.remote) throw new Error("expected a conflict");

        expectState(await a.engine.resolve(KEY, "use-theirs", conflict.remote), "in-sync");
        expect(a.title()).toBe("Fall, theirs");
        expect(a.documents.recovered.map((entry) => (entry.copy.payload as RankingsDocument).meta.title)).toEqual(["Fall, mine"]);
        expect(await a.links.get(KEY)).toMatchObject({ baseRevision: theirs.revision, baseWrittenHere: false, dirty: false });
    });

    it("Keep both saves mine as a new file with a new envelope id and relinks to it; theirs is left alone", async () => {
        const { remote, a, file } = await openedFromRemote();
        a.edit("Fall, mine");
        remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, theirs")), "Coach B");
        const conflict = await a.engine.check(KEY);
        if (!conflict.ok || !conflict.remote) throw new Error("expected a conflict");

        const outcome = await a.engine.resolve(KEY, "keep-both", conflict.remote);
        expectState(outcome, "in-sync");
        if (!outcome.ok) return;
        const newId = outcome.link.documentId;
        expect(newId).not.toBe(DOCUMENT_ID);
        expect(outcome.link.remote.fileId).not.toBe(file.fileId);
        expect(outcome.link.remote.name).toBe("fall (my copy).rankings.json");
        expect(a.documents.docs.get(KEY)?.documentId).toBe(newId);
        const copy = readDocumentText(remote.peek(outcome.link.remote.fileId)!.text, undefined, { kind: RANKINGS_FORMAT });
        expect(copy.ok && { id: copy.document.id, title: copy.document.payload.meta.title }).toEqual({ id: newId, title: "Fall, mine" });
        expect(remoteTitle(remote.peek(file.fileId)!.text)).toBe("Fall, theirs");
        expect(a.title()).toBe("Fall, mine");
    });

    it("offline: the save fails, the edits stay, and the link stays dirty", async () => {
        const { remote, a, file } = await openedFromRemote();
        a.edit("Fall, offline edit");
        a.connector.setOffline(true);
        expect(await a.engine.save(KEY)).toEqual({ ok: false, error: { code: "offline" } });
        expect(a.title()).toBe("Fall, offline edit");
        expect((await a.links.get(KEY))?.dirty).toBe(true);
        expect(remote.peek(file.fileId)!.revision).toBe(file.revision);

        a.connector.setOffline(false);
        expectState(await a.engine.save(KEY), "in-sync");
        expect(remoteTitle(remote.peek(file.fileId)!.text)).toBe("Fall, offline edit");
    });

    it("re-checks on focus at most once a minute per document", async () => {
        const { clock, remote, a, file } = await openedFromRemote();
        expect(await a.engine.recheck(KEY)).not.toBeNull();
        remote.overwrite(file.fileId, wrappedText(rankingsTitled("Fall, from B")), "Coach B");
        clock.now = new Date(clock.now.getTime() + RECHECK_INTERVAL_MS - 1);
        expect(await a.engine.recheck(KEY)).toBeNull();
        expect(a.title()).toBe("Fall");
        clock.now = new Date(clock.now.getTime() + 1);
        const outcome = await a.engine.recheck(KEY);
        expect(outcome && outcome.ok && outcome.state).toBe("newer-available");
        expect(a.title()).toBe("Fall, from B");
    });

    it("learns a rename without treating it as a change", async () => {
        const { remote, a, file } = await openedFromRemote();
        remote.rename(file.fileId, "fall (renamed).rankings.json");
        const outcome = await a.engine.check(KEY);
        expectState(outcome, "in-sync");
        expect(outcome.ok && outcome.link.remote.name).toBe("fall (renamed).rankings.json");
    });

    it("never takes in a remote it can't read, and leaves the working copy alone", async () => {
        const { remote, a, file } = await openedFromRemote();
        remote.overwrite(file.fileId, "not a document", "Coach B");
        const outcome = await a.engine.check(KEY);
        expect(outcome.ok === false && outcome.error.code).toBe("unreadable");
        expect(a.title()).toBe("Fall");
    });

    it("opens a bare file, giving the document an id of its own", async () => {
        const { remote, a } = setup();
        const file = remote.seed({ name: "fall.rankings.json", text: JSON.stringify(rankingsTitled("Bare")) });
        const outcome = await a.engine.openLinked(KEY, file);
        expectState(outcome, "in-sync");
        expect(a.title()).toBe("Bare");
        expect(a.documents.docs.get(KEY)?.documentId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("keeps an existing working copy as a recovered copy when a file is opened over it", async () => {
        const { remote, a } = setup();
        a.create(rankingsTitled("Already here"));
        const file = remote.seed({ name: "fall.rankings.json", text: wrappedText(rankingsTitled("Opened")) });
        await a.engine.openLinked(KEY, file);
        expect(a.title()).toBe("Opened");
        expect(a.documents.recovered.map((entry) => (entry.copy.payload as RankingsDocument).meta.title)).toEqual(["Already here"]);
    });

    it("reports what it can't do without a link, a working copy or a connector", async () => {
        const links = createLinkStore(createMemoryRepo());
        const engine = createSyncEngine({ connectors: [], links, documents: memoryDocuments() });
        expect(await engine.check(KEY)).toEqual({ ok: false, error: { code: "not-linked" } });
        expect(await engine.saveNew(KEY, "google-drive", "x.rankings.json")).toEqual({ ok: false, error: { code: "no-connector" } });
        const { a } = setup();
        expect(await a.engine.saveNew(KEY, "local-file", "x.rankings.json")).toEqual({ ok: false, error: { code: "missing-local" } });
    });
});
