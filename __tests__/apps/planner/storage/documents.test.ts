/**
 * The sync engine over the real store (storage connectors plan, Task 8):
 * practices and rankings as working copies, edits marking links dirty,
 * recovered copies, and document ids. Made-up programs only.
 */
import { describe, expect, it } from "vitest";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { docKeyOf } from "@/apps/planner/src/store/links";
import { createFakeConnector, createFakeRemote } from "@/apps/planner/src/storage/fake";
import { createSyncEngine } from "@/apps/planner/src/storage/sync";
import { createStoreDocuments, parseDocKey } from "@/apps/planner/src/storage/documents";
import { PLAN_FORMAT } from "@/lib/plan-document";
import { RANKINGS_FORMAT, createRankingsDocument } from "@/lib/rankings-document";
import { readDocumentText } from "@/lib/document-envelope";
import { RECOVERED_RETENTION_DAYS } from "@/apps/planner/src/store/recovered";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";

function setup() {
    const clock = { now: new Date("2026-10-11T12:00:00.000Z") };
    const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID(), now: () => new Date(clock.now) });
    const remote = createFakeRemote({ mode: "check-then-write" });
    const connector = createFakeConnector(remote, { user: "Coach A" });
    const documents = createStoreDocuments(store);
    const engine = createSyncEngine({ connectors: [connector], links: store.links, documents, now: () => new Date(clock.now) });
    const tick = () => {
        clock.now = new Date(clock.now.getTime() + 60_000);
    };
    return { clock, tick, store, remote, connector, documents, engine };
}

async function newPractice(store: ReturnType<typeof setup>["store"], title = "Tuesday skills") {
    const created = await store.createSession({ title, date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

const rankings = (title: string) => ({ ...createRankingsDocument({ title }), teams: [{ number: "901", name: "Riverside M1", startingBracket: null, excluded: false }] });

describe("store documents", () => {
    it("parses document keys, and refuses unknown kinds", () => {
        expect(parseDocKey(`${PLAN_FORMAT}:abc`)).toEqual({ kind: PLAN_FORMAT, id: "abc" });
        expect(parseDocKey("openleague.goalies:abc")).toBeNull();
        expect(parseDocKey("nonsense")).toBeNull();
    });

    it("saves a practice to a new file as a wrapped plan with an id it keeps, and reads back in sync", async () => {
        const { store, engine, remote } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        const saved = await engine.saveNew(key, "local-file", "tuesday-skills.olplan.json");
        if (!saved.ok) throw new Error(JSON.stringify(saved.error));
        const text = remote.peek(saved.link.remote.fileId)?.text ?? "";
        const read = readDocumentText(text);
        expect(read.ok && read.document.wrapped).toBe(true);
        const info = await store.getSessionDocumentInfo(id);
        expect(info.success && read.ok && info.data.documentId).toBe(read.ok ? read.document.id : "");
        // Nothing changed since: the round trip holds the base hash.
        expect(await engine.localState(key)).toMatchObject({ dirty: false });
        const checked = await engine.check(key);
        expect(checked.ok && checked.state).toBe("in-sync");
    });

    it("marks a linked practice dirty when it is edited, and saves the edit", async () => {
        const { store, engine, remote, tick } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        const saved = await engine.saveNew(key, "local-file", "tuesday-skills.olplan.json");
        if (!saved.ok) throw new Error("save failed");
        tick();
        const updated = await store.updateSession(id, { title: "Tuesday edges", date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
        expect(updated.success).toBe(true);
        expect((await store.links.get(key))?.dirty).toBe(true);
        expect((await engine.localState(key)).dirty).toBe(true);
        const again = await engine.save(key);
        expect(again.ok && again.state).toBe("in-sync");
        expect(remote.peek(saved.link.remote.fileId)?.text).toContain("Tuesday edges");
    });

    it("opens a remote plan into a new practice with that id, and over an existing one keeps a recovered copy", async () => {
        const { store, engine, remote, connector } = setup();
        const id = await newPractice(store, "Thursday flow");
        const key = docKeyOf(PLAN_FORMAT, id);
        const saved = await engine.saveNew(key, "local-file", "thursday.olplan.json");
        if (!saved.ok) throw new Error("save failed");

        const freshKey = docKeyOf(PLAN_FORMAT, "opened-1");
        const opened = await engine.openLinked(freshKey, { connector: connector.id, ...saved.link.remote }, { kind: PLAN_FORMAT });
        expect(opened.ok && opened.state).toBe("in-sync");
        const view = await store.getSessionView("opened-1");
        expect(view.success && view.data.title).toBe("Thursday flow");
        expect((await engine.localState(freshKey)).dirty).toBe(false);

        // Someone else saves a new title; "Use theirs" keeps this device's copy.
        remote.overwrite(saved.link.remote.fileId, (remote.peek(saved.link.remote.fileId)?.text ?? "").replace("Thursday flow", "Thursday power play"), "Coach B");
        await store.updateSession(id, { title: "Thursday mine", date: new Date("2026-10-16T17:30:00"), duration: 60, plays: [] });
        const conflict = await engine.check(key);
        if (!conflict.ok || !conflict.remote) throw new Error("expected a conflict");
        expect(conflict.state).toBe("conflict");
        const theirs = await engine.resolve(key, "use-theirs", conflict.remote);
        expect(theirs.ok && theirs.state).toBe("in-sync");
        const after = await store.getSessionView(id);
        expect(after.success && after.data.title).toBe("Thursday power play");
        const copies = await store.listRecoveredCopies();
        expect(copies.success && copies.data.map((copy) => copy.title)).toEqual(["Thursday mine"]);
    });

    it("refuses a rankings file opened as a practice", async () => {
        const { remote, engine, connector } = setup();
        const file = remote.seed({ name: "fall.rankings.json", text: JSON.stringify(rankings("Fall")) });
        const opened = await engine.openLinked(docKeyOf(PLAN_FORMAT, "x"), { connector: connector.id, fileId: file.fileId, name: file.name }, { kind: PLAN_FORMAT });
        expect(opened.ok === false && opened.error.code).toBe("unreadable");
    });

    it("keeps both for rankings: the record takes a new envelope id and the link moves to the copy", async () => {
        const { store, engine, remote } = setup();
        const created = await store.createRankingsDocument(rankings("Fall 10U"));
        if (!created.success) throw new Error(created.error);
        const key = docKeyOf(RANKINGS_FORMAT, created.data.id);
        const saved = await engine.saveNew(key, "local-file", "fall.rankings.json");
        if (!saved.ok) throw new Error("save failed");
        remote.overwrite(saved.link.remote.fileId, (remote.peek(saved.link.remote.fileId)?.text ?? "").replace("Fall 10U", "Fall 10U (theirs)"));
        await store.saveRankingsDocument(created.data.id, rankings("Fall 10U (mine)"));
        expect((await store.links.get(key))?.dirty).toBe(true);
        const conflict = await engine.save(key);
        if (!conflict.ok || !conflict.remote) throw new Error("expected a conflict");
        const both = await engine.resolve(key, "keep-both", conflict.remote);
        if (!both.ok) throw new Error("keep both failed");
        expect(both.link.remote.name).toBe("fall (my copy).rankings.json");
        const record = await store.getRankingsDocument(created.data.id);
        expect(record.success && record.data.documentId).toBe(both.link.documentId);
        expect(record.success && record.data.documentId).not.toBe(created.data.documentId);
        expect(remote.peek(saved.link.remote.fileId)?.text).toContain("Fall 10U (theirs)");
    });

    it("drops a practice's link when the practice is deleted", async () => {
        const { store, engine } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        await engine.saveNew(key, "local-file", "x.olplan.json");
        await store.deletePracticeSession({ id, teamId: LOCAL_TEAM_ID });
        expect(await store.links.get(key)).toBeNull();
    });
});

describe("document ids", () => {
    it("makes a practice's envelope id once and keeps it; a duplicate gets none", async () => {
        const { store } = setup();
        const id = await newPractice(store);
        const first = await store.ensureSessionDocumentId(id);
        const second = await store.ensureSessionDocumentId(id);
        expect(first.success && second.success && first.data).toBe(second.success ? second.data : "");
        const found = await store.findSessionByDocumentId(first.success ? first.data : "");
        expect(found.success && found.data?.id).toBe(id);
        const copy = await store.duplicatePracticeSession({ id, teamId: LOCAL_TEAM_ID, date: new Date("2026-10-20T17:00:00") });
        const copyInfo = await store.getSessionDocumentInfo(copy.success ? copy.data.id : "");
        expect(copyInfo.success && copyInfo.data.documentId).toBeNull();
    });

    it("keeps an opened file's id on import", async () => {
        const { store, documents } = setup();
        const id = await newPractice(store);
        const plan = await documents.read(docKeyOf(PLAN_FORMAT, id));
        const fileId = "6f1c2b9a-1d4e-4a5b-8c7d-0e9f8a7b6c5d";
        const imported = await store.importPlan(plan!.payload as never, { date: new Date(), addToLibrary: false, documentId: fileId });
        const info = await store.getSessionDocumentInfo(imported.success ? imported.data.sessionId : "");
        expect(info.success && info.data.documentId).toBe(fileId);
    });

    it("finds rankings by envelope id and reports the current document's id", async () => {
        const { store } = setup();
        const created = await store.createRankingsDocument(rankings("Winter"), { documentId: "6f1c2b9a-1d4e-4a5b-8c7d-0e9f8a7b6c5d" });
        expect(created.success).toBe(true);
        expect(await store.getRankingsDocumentId()).toEqual({ success: true, data: "6f1c2b9a-1d4e-4a5b-8c7d-0e9f8a7b6c5d" });
        const found = await store.findRankingsByDocumentId("6f1c2b9a-1d4e-4a5b-8c7d-0e9f8a7b6c5d");
        expect(found.success && found.data?.title).toBe("Winter");
        expect(await store.findRankingsByDocumentId("00000000-0000-4000-8000-000000000000")).toEqual({ success: true, data: null });
    });
});

describe("recovered copies", () => {
    it("lists newest first, deletes one, and sweeps those past the retention", async () => {
        const { store, clock } = setup();
        await store.addRecoveredCopy({ docKey: "k:1", kind: RANKINGS_FORMAT, documentId: "d1", title: "Old", payload: {} }, "2026-09-01T00:00:00.000Z");
        await store.addRecoveredCopy({ docKey: "k:2", kind: RANKINGS_FORMAT, documentId: "d2", title: "Newer", payload: {} }, "2026-10-10T00:00:00.000Z");
        const added = await store.addRecoveredCopy({ docKey: "k:3", kind: RANKINGS_FORMAT, documentId: "d3", title: "Newest", payload: { a: 1 } });
        const list = await store.listRecoveredCopies();
        expect(list.success && list.data.map((copy) => copy.title)).toEqual(["Newest", "Newer", "Old"]);
        expect(list.success && "payload" in list.data[0]).toBe(false);
        const full = await store.getRecoveredCopy(added.success ? added.data.id : "");
        expect(full.success && full.data.payload).toEqual({ a: 1 });
        clock.now = new Date("2026-10-11T12:00:00.000Z");
        expect(RECOVERED_RETENTION_DAYS).toBe(30);
        expect(await store.sweepRecoveredCopies()).toBe(1);
        await store.deleteRecoveredCopy(added.success ? added.data.id : "");
        const left = await store.listRecoveredCopies();
        expect(left.success && left.data.map((copy) => copy.title)).toEqual(["Newer"]);
    });
});
