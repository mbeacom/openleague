/**
 * The planner folder on this computer (storage locations design, decision 2):
 * choosing it, saving new files into its kind subfolders, listing it, "Save
 * everything", "Restore from the folder" and autosave. Over the real store and
 * the Local connector on a fake File System Access disk. Made-up programs only.
 */
import { describe, expect, it, vi } from "vitest";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { createMemoryLocationStore, type LocationStore } from "@/apps/planner/src/store/locations";
import { docKeyOf } from "@/apps/planner/src/store/links";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";
import { createStorageService } from "@/apps/planner/src/storage/service";
import { isFolderFileId, isInFolderGeneration } from "@/apps/planner/src/storage/local-file";
import { numberedName } from "@/apps/planner/src/storage/folders";
import { restoreFromFolder, saveAllToFolder, startFolderAutosave, takeFolderCopy } from "@/apps/planner/src/storage/planner-folder";
import { PLAN_FORMAT } from "@/lib/plan-document";
import { RANKINGS_FORMAT, createRankingsDocument } from "@/lib/rankings-document";
import { createFakeFsa, memoryHandleStore, type FakeFsa } from "./fake-fsa";

const ROOT = "Hawks";

function setup({ disk = createFakeFsa(), locations = createMemoryLocationStore() }: { disk?: FakeFsa; locations?: LocationStore } = {}) {
    const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });
    const service = createStorageService(store, { pickers: disk.pickers, handles: memoryHandleStore(), locations });
    const local = service.connector("local-file")!;
    return { store, disk, service, local, locations };
}

async function chooseFolder(local: ReturnType<typeof setup>["local"], disk: FakeFsa, path = ROOT) {
    disk.queueDirectory(path);
    const chosen = await local.chooseLocation!();
    if (!chosen.ok || !chosen.value) throw new Error("folder not chosen");
    return chosen.value;
}

async function newPractice(store: LocalPlannerStore, title: string) {
    const created = await store.createSession({ title, date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

const rename = (store: LocalPlannerStore, id: string, title: string) => store.updateSession(id, { title, date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });

describe("numbered names", () => {
    it("numbers before the document extension", () => {
        expect(numberedName("u12.olplan.json", 1)).toBe("u12.olplan.json");
        expect(numberedName("u12.olplan.json", 3)).toBe("u12 (3).olplan.json");
        expect(numberedName("fall.rankings.yaml", 2)).toBe("fall (2).rankings.yaml");
    });
});

describe("the Local connector with a planner folder", () => {
    it("never writes over a file another app created under the same name a moment before", async () => {
        const { local, disk } = setup();
        await chooseFolder(local, disk);
        disk.beforeNextCreate((path) => disk.seed(path, "another app's file"));
        const saved = await local.save({ ref: null, name: "fall.rankings.json", text: "mine", kind: RANKINGS_FORMAT, documentId: "d1", expectedRevision: null });
        expect(saved.ok && saved.value.name).toBe("fall (2).rankings.json");
        expect(disk.read(`${ROOT}/Rankings/fall.rankings.json`)).toBe("another app's file");
    });

    it("has no location until a folder is chosen, then saves new files into the kind's subfolder without a picker", async () => {
        const { local, disk } = setup();
        expect(await local.location!()).toBeNull();
        expect(await chooseFolder(local, disk)).toEqual({ name: ROOT });
        expect(await local.location!()).toEqual({ name: ROOT, chosen: true });

        const saved = await local.save({ ref: null, name: "tuesday.olplan.json", text: "{}\n", kind: PLAN_FORMAT, documentId: "d1", expectedRevision: null });
        if (!saved.ok) throw new Error(saved.error.code);
        expect(isFolderFileId(saved.value.fileId)).toBe(true);
        expect(disk.read(`${ROOT}/Practices/tuesday.olplan.json`)).toBe("{}\n");
    });

    it("never overwrites a file of the same name in the folder", async () => {
        const { local, disk } = setup();
        await chooseFolder(local, disk);
        disk.seed(`${ROOT}/Rankings/fall.rankings.json`, "theirs");
        const saved = await local.save({ ref: null, name: "fall.rankings.json", text: "mine", kind: RANKINGS_FORMAT, documentId: "d1", expectedRevision: null });
        expect(saved.ok && saved.value.name).toBe("fall (2).rankings.json");
        expect(disk.read(`${ROOT}/Rankings/fall.rankings.json`)).toBe("theirs");
        expect(disk.read(`${ROOT}/Rankings/fall (2).rankings.json`)).toBe("mine");
    });

    it("lists only document files in the kind subfolders, with their kind", async () => {
        const { local, disk } = setup();
        await chooseFolder(local, disk);
        disk.seed(`${ROOT}/Practices/a.olplan.json`, "{}");
        disk.seed(`${ROOT}/Practices/notes.txt`, "x");
        disk.seed(`${ROOT}/Rankings/fall.rankings.json`, "{}");
        disk.seed(`${ROOT}/loose.olplan.json`, "{}");
        const all = await local.list();
        if (!all.ok) throw new Error(all.error.code);
        expect(all.value.map((file) => [file.name, file.kind]).sort()).toEqual([
            ["a.olplan.json", PLAN_FORMAT],
            ["fall.rankings.json", RANKINGS_FORMAT],
        ]);
        const plans = await local.list({ kind: PLAN_FORMAT });
        expect(plans.ok && plans.value.map((file) => file.name)).toEqual(["a.olplan.json"]);
    });

    it("keeps the save picker when no folder is chosen, and after the folder is dropped", async () => {
        const { local, disk } = setup();
        expect(await local.list()).toEqual({ ok: true, value: [] });
        await chooseFolder(local, disk);
        await local.resetLocation!();
        disk.queueSave("picked.olplan.json");
        const saved = await local.save({ ref: null, name: "x.olplan.json", text: "{}", kind: PLAN_FORMAT, documentId: "d1", expectedRevision: null });
        expect(saved.ok && saved.value.name).toBe("picked.olplan.json");
        expect(saved.ok && isFolderFileId(saved.value.fileId)).toBe(false);
    });

    it("keeps the location when the coach cancels the folder picker", async () => {
        const { local, disk, locations } = setup();
        disk.queueDirectory("cancel");
        expect(await local.chooseLocation!()).toEqual({ ok: true, value: null });
        expect(await locations.get("local-file")).toBeUndefined();
    });

    it("asks for the folder's permission after a reload, and reports it when refused", async () => {
        const { local, disk } = setup();
        await chooseFolder(local, disk);
        disk.withdraw();
        expect(await local.save({ ref: null, name: "x.olplan.json", text: "{}", kind: PLAN_FORMAT, documentId: "d1", expectedRevision: null })).toEqual({ ok: false, error: { code: "auth-required" } });
        disk.activate();
        disk.denyPrompts(true);
        expect(await local.list()).toEqual({ ok: false, error: { code: "auth-required" } });
    });
});

describe("Choosing the folder again", () => {
    it("keeps the same folder's files in it, so nothing is saved twice", async () => {
        const { store, disk, service, local } = setup();
        await chooseFolder(local, disk);
        await newPractice(store, "Tuesday skills");
        await saveAllToFolder(service);
        await chooseFolder(local, disk);
        expect(await saveAllToFolder(service)).toMatchObject({ added: 0, moved: 0 });
        expect(disk.paths()).toHaveLength(1);
    });

    it("saves into a new folder what was linked into the one before, and leaves the old files as they were", async () => {
        const { store, disk, service, local, locations } = setup();
        await chooseFolder(local, disk, "Old");
        const id = await newPractice(store, "Tuesday skills");
        await saveAllToFolder(service);
        const oldPath = disk.paths()[0];
        const before = disk.read(oldPath);
        await chooseFolder(local, disk, "New");
        await rename(store, id, "Tuesday skills and edges");

        // Autosave waits: the file it would write is in the folder used before.
        const quiet = { setInterval: (() => 0) as unknown as typeof setInterval, clearInterval: (() => undefined) as typeof clearInterval, setTimeout: (() => 0) as unknown as typeof setTimeout, clearTimeout: (() => undefined) as typeof clearTimeout };
        const autosave = startFolderAutosave(service, { scope: quiet, granted: async () => true });
        expect(await autosave.run()).toBe(0);
        autosave.stop();

        expect(await saveAllToFolder(service)).toMatchObject({ added: 0, moved: 1 });
        expect(disk.read(oldPath)).toBe(before);
        const moved = disk.paths().find((path) => path.startsWith("New/Practices/"))!;
        expect(disk.read(moved)).toContain("Tuesday skills and edges");
        const link = await store.links.get(docKeyOf(PLAN_FORMAT, id));
        const current = await locations.get("local-file");
        expect(isInFolderGeneration(link!.remote.fileId, current!.generation)).toBe(true);
        expect(await saveAllToFolder(service)).toMatchObject({ added: 0, moved: 0, saved: 0 });
    });
});

describe("Save everything to the folder", () => {
    it("links every practice and the current rankings into the folder, then saves only edits", async () => {
        const { store, disk, service, local } = setup();
        await chooseFolder(local, disk);
        const first = await newPractice(store, "Tuesday skills");
        await newPractice(store, "Saturday scrimmage");
        const rankings = await store.createRankingsDocument(createRankingsDocument({ title: "Fall standings" }));
        if (!rankings.success) throw new Error(rankings.error);

        expect(await saveAllToFolder(service)).toMatchObject({ added: 3, saved: 0, elsewhere: 0, failed: 0 });
        expect(disk.paths().filter((path) => path.startsWith(`${ROOT}/Practices/`))).toHaveLength(2);
        expect(disk.paths().filter((path) => path.startsWith(`${ROOT}/Rankings/`))).toHaveLength(1);

        expect(await saveAllToFolder(service)).toMatchObject({ added: 0, saved: 0 });
        await rename(store, first, "Tuesday skills and edges");
        expect(await saveAllToFolder(service)).toMatchObject({ added: 0, saved: 1 });
    });

    it("leaves a document linked to a file outside the folder where it is", async () => {
        const { store, disk, service, local } = setup();
        const id = await newPractice(store, "Tuesday skills");
        disk.queueSave("elsewhere.olplan.json");
        const outside = await service.engine.saveNew(docKeyOf(PLAN_FORMAT, id), "local-file", "tuesday.olplan.json");
        expect(outside.ok).toBe(true);
        await chooseFolder(local, disk);
        expect(await saveAllToFolder(service)).toMatchObject({ added: 0, elsewhere: 1 });
    });
});

describe("Restore from the folder", () => {
    it("adds a fresh browser's practices and rankings from the folder, linked", async () => {
        const disk = createFakeFsa();
        const source = setup({ disk });
        await chooseFolder(source.local, disk);
        await newPractice(source.store, "Tuesday skills");
        const made = await source.store.createRankingsDocument(createRankingsDocument({ title: "Fall standings" }));
        if (!made.success) throw new Error(made.error);
        await saveAllToFolder(source.service);

        // Another browser on the same disk: nothing here yet.
        const fresh = setup({ disk });
        await chooseFolder(fresh.local, disk);
        expect(await restoreFromFolder(fresh.service)).toMatchObject({ added: 2, linked: 0, differing: 0, unreadable: 0 });
        const sessions = await fresh.store.listSessions();
        expect(sessions.success && sessions.data.map((session) => session.title)).toEqual(["Tuesday skills"]);
        const links = await fresh.store.links.list();
        expect(links).toHaveLength(2);
        expect(links.every((link) => isFolderFileId(link.remote.fileId))).toBe(true);

        // Again: everything is already here and linked.
        expect(await restoreFromFolder(fresh.service)).toMatchObject({ added: 0, unchanged: 2 });
    });

    it("links a document it holds with the same content, and leaves one with other content to the coach", async () => {
        const disk = createFakeFsa();
        const { store, service, local } = setup({ disk });
        await chooseFolder(local, disk);
        const same = await newPractice(store, "Tuesday skills");
        const other = await newPractice(store, "Saturday scrimmage");
        await saveAllToFolder(service);
        // The links go (as on a browser that held copies but no links); one copy then changes here.
        await service.engine.unlink(docKeyOf(PLAN_FORMAT, same));
        await service.engine.unlink(docKeyOf(PLAN_FORMAT, other));
        await rename(store, other, "Saturday scrimmage, changed here");

        expect(await restoreFromFolder(service)).toMatchObject({ added: 0, linked: 1, differing: 1 });
        expect(await store.links.get(docKeyOf(PLAN_FORMAT, same))).not.toBeNull();
        expect(await store.links.get(docKeyOf(PLAN_FORMAT, other))).toBeNull();
        // Nothing was replaced, so nothing was recovered.
        const recovered = await store.listRecoveredCopies();
        expect(recovered.success && recovered.data).toEqual([]);
    });

    it("lets the coach take the folder's copy of a document that differs, keeping this browser's in Recovered copies", async () => {
        const disk = createFakeFsa();
        const { store, service, local } = setup({ disk });
        await chooseFolder(local, disk);
        const id = await newPractice(store, "Saturday scrimmage");
        await saveAllToFolder(service);
        await service.engine.unlink(docKeyOf(PLAN_FORMAT, id));
        await rename(store, id, "Changed here");
        const summary = await restoreFromFolder(service);
        expect(summary.differences.map((difference) => difference.title)).toEqual(["Changed here"]);
        const taken = await takeFolderCopy(service, summary.differences[0]);
        expect(taken.ok).toBe(true);
        const view = await store.getSessionView(id);
        expect(view.success && view.data.title).toBe("Saturday scrimmage");
        expect(await store.links.get(docKeyOf(PLAN_FORMAT, id))).not.toBeNull();
        const recovered = await store.listRecoveredCopies();
        expect(recovered.success && recovered.data.map((copy) => copy.title)).toEqual(["Changed here"]);
    });

    it("counts files it can't read, and keeps going", async () => {
        const { disk, service, local } = setup();
        await chooseFolder(local, disk);
        disk.seed(`${ROOT}/Practices/broken.olplan.json`, "{ not json");
        expect(await restoreFromFolder(service)).toMatchObject({ added: 0, unreadable: 1 });
    });
});

describe("Keep the folder up to date", () => {
    const quietScope = {
        setInterval: (() => 0) as unknown as typeof setInterval,
        clearInterval: (() => undefined) as typeof clearInterval,
        setTimeout: (() => 0) as unknown as typeof setTimeout,
        clearTimeout: (() => undefined) as typeof clearTimeout,
    };

    it("saves edited documents linked into the folder, only when the browser already grants it", async () => {
        const { store, disk, service, local } = setup();
        await chooseFolder(local, disk);
        const id = await newPractice(store, "Tuesday skills");
        await saveAllToFolder(service);
        const path = disk.paths().find((entry) => entry.startsWith(`${ROOT}/Practices/`))!;
        await rename(store, id, "Tuesday skills and edges");

        let granted = false;
        const autosave = startFolderAutosave(service, { scope: quietScope, granted: async () => granted });
        expect(await autosave.run()).toBe(0);
        expect(disk.read(path)).not.toContain("Tuesday skills and edges");
        granted = true;
        expect(await autosave.run()).toBe(1);
        expect(disk.read(path)).toContain("Tuesday skills and edges");
        expect(await autosave.run()).toBe(0);
        autosave.stop();
    });

    it("does nothing when the coach turned it off", async () => {
        const { store, disk, service, local, locations } = setup();
        await chooseFolder(local, disk);
        const id = await newPractice(store, "Tuesday skills");
        await saveAllToFolder(service);
        await rename(store, id, "Edited");
        const current = await locations.get("local-file");
        await locations.set("local-file", { ...current!, autosave: false });
        const autosave = startFolderAutosave(service, { scope: quietScope, granted: async () => true });
        expect(await autosave.run()).toBe(0);
        autosave.stop();
    });

    it("leaves files linked outside the folder to the coach's Save", async () => {
        const { store, disk, service, local } = setup();
        const id = await newPractice(store, "Tuesday skills");
        disk.queueSave("elsewhere.olplan.json");
        await service.engine.saveNew(docKeyOf(PLAN_FORMAT, id), "local-file", "tuesday.olplan.json");
        await chooseFolder(local, disk);
        await rename(store, id, "Edited");
        const autosave = startFolderAutosave(service, { scope: quietScope, granted: async () => true });
        expect(await autosave.run()).toBe(0);
        expect(disk.read("elsewhere.olplan.json")).not.toContain("Edited");
        autosave.stop();
    });

    it("saves a few seconds after the last edit, once, however many edits came before", async () => {
        const { store, disk, service, local } = setup();
        await chooseFolder(local, disk);
        const id = await newPractice(store, "Tuesday skills");
        await saveAllToFolder(service);
        const path = disk.paths().find((entry) => entry.startsWith(`${ROOT}/Practices/`))!;
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            const autosave = startFolderAutosave(service, { scope: { ...quietScope, setTimeout, clearTimeout }, debounceMs: 3000, granted: async () => true });
            const writesBefore = disk.writes;
            await rename(store, id, "Edit one");
            await rename(store, id, "Edit two");
            expect(disk.writes).toBe(writesBefore);
            await vi.advanceTimersByTimeAsync(3000);
            vi.useRealTimers();
            await vi.waitFor(() => expect(disk.read(path)).toContain("Edit two"));
            expect(disk.writes).toBe(writesBefore + 1);
            autosave.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it("saves when the tab is hidden", async () => {
        const { store, disk, service, local } = setup();
        await chooseFolder(local, disk);
        const id = await newPractice(store, "Tuesday skills");
        await saveAllToFolder(service);
        await rename(store, id, "Hidden edit");
        const listeners: Array<() => void> = [];
        const document = {
            visibilityState: "hidden" as DocumentVisibilityState,
            addEventListener: (_: string, listener: () => void) => void listeners.push(listener),
            removeEventListener: () => undefined,
        } as unknown as Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
        const autosave = startFolderAutosave(service, { scope: { ...quietScope, document }, granted: async () => true });
        expect(listeners).toHaveLength(1);
        listeners.forEach((listener) => listener());
        // No run() here: the listener's own pass writes the file.
        await vi.waitFor(() => expect(disk.paths().some((path) => disk.read(path)?.includes("Hidden edit"))).toBe(true));
        autosave.stop();
    });
});
