/**
 * The storage screens (storage connectors plan, Task 11): the status bar with
 * Save and "Save to…", the conflict and overwritten dialogs, "Allow access",
 * the download tier's honesty, "Open from…" with an id match, and Saved
 * files. Over the real store and the Local connector on a fake File System
 * Access disk. Made-up programs only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { docKeyOf } from "@/apps/planner/src/store/links";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";
import { createStorageService, type StorageService } from "@/apps/planner/src/storage/service";
import { StorageProvider } from "@/apps/planner/src/screens/storage/StorageContext";
import { DocumentStorageBar } from "@/apps/planner/src/screens/storage/DocumentStorageBar";
import { OpenFromMenu } from "@/apps/planner/src/screens/storage/OpenFromMenu";
import { StorageScreen, RESTORE_LABEL, NO_RECOVERED_MESSAGE } from "@/apps/planner/src/screens/storage/StorageScreen";
import { ConflictDialog, CONFLICT_TITLE, KEEP_MINE_LABEL, OVERWRITTEN_TITLE, USE_THEIRS_LABEL } from "@/apps/planner/src/screens/storage/ConflictDialog";
import { KEEP_BOTH_COPIES_LABEL, REPLACE_MY_COPY_LABEL, SAME_DOCUMENT_TITLE } from "@/apps/planner/src/screens/storage/ReplaceOrKeepDialog";
import { ALLOW_ACCESS_LABEL, DOWNLOAD_COPY_LABEL, DOWNLOAD_IS_A_COPY, OPEN_FROM_LABEL, SAVE_LABEL, SAVE_TO_LABEL } from "@/apps/planner/src/screens/storage/messages";
import { PLAN_FORMAT } from "@/lib/plan-document";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { wrapScreen } from "../render-screen";
import { render } from "@testing-library/react";
import { createFakeFsa, memoryHandleStore, type FakeFsa } from "./fake-fsa";

vi.mock("@/components/features/practice-planner/export/download", () => ({ downloadBlob: vi.fn() }));

afterEach(() => {
    vi.clearAllMocks();
});

const FILE = "tuesday-skills.olplan.json";

function setup({ fsa = true }: { fsa?: boolean } = {}) {
    const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });
    const disk: FakeFsa = createFakeFsa();
    const handles = memoryHandleStore();
    const service = createStorageService(store, { pickers: fsa ? disk.pickers : null, handles });
    return { store, disk, service, handles };
}

function renderWithStorage(ui: ReactElement, store: LocalPlannerStore, service: StorageService) {
    return render(wrapScreen(<StorageProvider service={service}>{ui}</StorageProvider>, store));
}

async function newPractice(store: LocalPlannerStore, title = "Tuesday skills") {
    const created = await store.createSession({ title, date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

const rename = (store: LocalPlannerStore, id: string, title: string) => store.updateSession(id, { title, date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });

async function saveToFile() {
    fireEvent.click(await screen.findByRole("button", { name: SAVE_TO_LABEL }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /File on this computer/ }));
    expect(await screen.findByText(`Saved to ${FILE} on this computer`)).toBeInTheDocument();
}

describe("DocumentStorageBar", () => {
    it("says a document is in this browser, saves it to a file, and saves edits back", async () => {
        const { store, disk, service } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        const view = renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        expect(await screen.findByText("Saved in this browser")).toBeInTheDocument();
        await saveToFile();
        expect(disk.read(FILE)).toContain('"format": "openleague.document"');

        await rename(store, id, "Tuesday edges");
        view.rerender(wrapScreen(<StorageProvider service={service}><DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} editVersion={1} /></StorageProvider>, store));
        expect(await screen.findByText(`Unsaved changes: not yet in ${FILE} on this computer`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: SAVE_LABEL }));
        expect(await screen.findByText(`Saved to ${FILE} on this computer`)).toBeInTheDocument();
        expect(disk.read(FILE)).toContain("Tuesday edges");
    });

    it("turns a file changed under unsaved edits into a choice, and Use theirs keeps mine as a recovered copy", async () => {
        const { store, disk, service } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        const first = renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        await saveToFile();
        first.unmount();

        disk.overwrite(FILE, (disk.read(FILE) ?? "").replace("Tuesday skills", "Tuesday power play"));
        await rename(store, id, "Tuesday mine");
        const onReplaced = vi.fn();
        renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} onReplaced={onReplaced} />, store, service);
        const dialog = await screen.findByRole("dialog", { name: CONFLICT_TITLE });
        fireEvent.click(within(dialog).getByRole("button", { name: USE_THEIRS_LABEL }));
        await waitFor(() => expect(onReplaced).toHaveBeenCalled());
        const view = await store.getSessionView(id);
        expect(view.success && view.data.title).toBe("Tuesday power play");
        const copies = await store.listRecoveredCopies();
        expect(copies.success && copies.data.map((copy) => copy.title)).toEqual(["Tuesday mine"]);
    });

    it("says when its own save was replaced, and Keep mine writes it back", async () => {
        const { store, disk, service, handles } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        const first = renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        await saveToFile();
        first.unmount();

        disk.overwrite(FILE, (disk.read(FILE) ?? "").replace("Tuesday skills", "Replaced elsewhere"));
        // A new service: a fresh visit, so the once-a-minute check runs.
        const again = createStorageService(store, { pickers: disk.pickers, handles });
        renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} />, store, again);
        const dialog = await screen.findByRole("dialog", { name: OVERWRITTEN_TITLE });
        fireEvent.click(within(dialog).getByRole("button", { name: KEEP_MINE_LABEL }));
        expect(await screen.findByText(`Saved to ${FILE} on this computer`)).toBeInTheDocument();
        expect(disk.read(FILE)).toContain("Tuesday skills");
    });

    it("asks for permission from a tap when the browser needs it again", async () => {
        const { store, disk, service, handles } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        const first = renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        await saveToFile();
        first.unmount();

        disk.withdraw();
        const again = createStorageService(store, { pickers: disk.pickers, handles });
        renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} />, store, again);
        const allow = await screen.findByRole("button", { name: ALLOW_ACCESS_LABEL });
        disk.activate();
        fireEvent.click(allow);
        expect(await screen.findByText(`Saved to ${FILE} on this computer`)).toBeInTheDocument();
    });

    it("without the File System Access API, says a download is a copy and downloads a wrapped file", async () => {
        const { store, service } = setup({ fsa: false });
        const id = await newPractice(store);
        renderWithStorage(<DocumentStorageBar docKey={docKeyOf(PLAN_FORMAT, id)} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        expect(await screen.findByText(DOWNLOAD_IS_A_COPY)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: SAVE_TO_LABEL }));
        expect(screen.queryByRole("menuitem", { name: /File on this computer/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(DOWNLOAD_COPY_LABEL) }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
        const [blob, name] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string];
        expect(name).toBe(FILE);
        const raw = JSON.parse(await blob.text());
        const info = await store.getSessionDocumentInfo(id);
        expect(raw).toMatchObject({ format: "openleague.document", kind: PLAN_FORMAT, id: info.success && info.data.documentId });
        // A download is a copy: no link.
        expect(await store.links.get(docKeyOf(PLAN_FORMAT, id))).toBeNull();
    });

    it("renders nothing outside a storage provider", () => {
        const store = createLocalPlannerStore(createMemoryRepo());
        const { container } = render(wrapScreen(<DocumentStorageBar docKey="x" kind={PLAN_FORMAT} fileName={FILE} />, store));
        expect(container).toBeEmptyDOMElement();
    });
});

describe("ConflictDialog", () => {
    const remote = { connector: "local-file" as const, fileId: "f", name: FILE, revision: "2", modifiedAt: "2026-10-11T15:00:00.000Z", modifiedBy: "Coach Rivera", size: 10 };

    it("shows who saved theirs and both times, and reports each choice", () => {
        const onChoose = vi.fn();
        render(<ConflictDialog open kind="conflict" remote={remote} mineAt="2026-10-11T14:00:00.000Z" busy={false} onChoose={onChoose} onClose={() => {}} />);
        const dialog = screen.getByRole("dialog", { name: CONFLICT_TITLE });
        expect(dialog).toHaveTextContent("Coach Rivera saved a newer version");
        expect(dialog).toHaveTextContent("Yours, last saved");
        fireEvent.click(within(dialog).getByRole("button", { name: KEEP_MINE_LABEL }));
        fireEvent.click(within(dialog).getByRole("button", { name: USE_THEIRS_LABEL }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Keep both" }));
        expect(onChoose.mock.calls.map((call) => call[0])).toEqual(["keep-mine", "use-theirs", "keep-both"]);
    });

    it("words an overwrite as a replaced save, and says unknown for a missing time", () => {
        render(<ConflictDialog open kind="overwritten" remote={{ ...remote, modifiedBy: undefined }} mineAt={null} busy={false} onChoose={() => {}} onClose={() => {}} />);
        expect(screen.getByRole("dialog", { name: OVERWRITTEN_TITLE })).toHaveTextContent("Your save from unknown was replaced by another app or device");
    });
});

describe("OpenFromMenu", () => {
    async function savedPracticeOnDisk() {
        const { store, disk, service } = setup();
        const id = await newPractice(store, "Thursday flow");
        const saved = await service.engine.saveNew(docKeyOf(PLAN_FORMAT, id), "local-file", "thursday.olplan.json");
        if (!saved.ok) throw new Error("save failed");
        await service.engine.unlink(docKeyOf(PLAN_FORMAT, id));
        return { store, disk, service, id };
    }

    it("offers Replace my copy for a file that is the same practice, and links the practice to it", async () => {
        const { store, disk, service, id } = await savedPracticeOnDisk();
        await rename(store, id, "Thursday edited here");
        const onOpened = vi.fn();
        renderWithStorage(<OpenFromMenu kind={PLAN_FORMAT} importHref="#/import" onOpened={onOpened} />, store, service);
        disk.queueOpen(["thursday.olplan.json"]);
        fireEvent.click(screen.getByRole("button", { name: OPEN_FROM_LABEL }));
        fireEvent.click(await screen.findByRole("menuitem", { name: /File on this computer/ }));
        const dialog = await screen.findByRole("dialog", { name: SAME_DOCUMENT_TITLE });
        expect(dialog).toHaveTextContent("Thursday edited here");
        fireEvent.click(within(dialog).getByRole("button", { name: REPLACE_MY_COPY_LABEL }));
        await waitFor(() => expect(onOpened).toHaveBeenCalledWith(id));
        expect((await store.links.get(docKeyOf(PLAN_FORMAT, id)))?.remote.name).toBe("thursday.olplan.json");
        const view = await store.getSessionView(id);
        expect(view.success && view.data.title).toBe("Thursday flow");
        const copies = await store.listRecoveredCopies();
        expect(copies.success && copies.data.map((copy) => copy.title)).toEqual(["Thursday edited here"]);
    });

    it("Keep both makes a separate, unlinked practice", async () => {
        const { store, disk, service, id } = await savedPracticeOnDisk();
        const onOpened = vi.fn();
        renderWithStorage(<OpenFromMenu kind={PLAN_FORMAT} importHref="#/import" onOpened={onOpened} />, store, service);
        disk.queueOpen(["thursday.olplan.json"]);
        fireEvent.click(screen.getByRole("button", { name: OPEN_FROM_LABEL }));
        fireEvent.click(await screen.findByRole("menuitem", { name: /File on this computer/ }));
        fireEvent.click(within(await screen.findByRole("dialog", { name: SAME_DOCUMENT_TITLE })).getByRole("button", { name: KEEP_BOTH_COPIES_LABEL }));
        await waitFor(() => expect(onOpened).toHaveBeenCalled());
        const newId = onOpened.mock.calls[0][0] as string;
        expect(newId).not.toBe(id);
        const sessions = await store.listSessions();
        expect(sessions.success && sessions.data).toHaveLength(2);
        expect(await store.links.get(docKeyOf(PLAN_FORMAT, newId))).toBeNull();
    });

    it("opens a new file into a new linked practice", async () => {
        const { store, disk, service } = setup();
        const id = await newPractice(store, "Saturday scrimmage");
        const saved = await service.engine.saveNew(docKeyOf(PLAN_FORMAT, id), "local-file", "saturday.olplan.json");
        if (!saved.ok) throw new Error("save failed");
        await store.deletePracticeSession({ id, teamId: LOCAL_TEAM_ID });
        const onOpened = vi.fn();
        renderWithStorage(<OpenFromMenu kind={PLAN_FORMAT} importHref="#/import" onOpened={onOpened} />, store, service);
        disk.queueOpen(["saturday.olplan.json"]);
        fireEvent.click(screen.getByRole("button", { name: OPEN_FROM_LABEL }));
        fireEvent.click(await screen.findByRole("menuitem", { name: /File on this computer/ }));
        await waitFor(() => expect(onOpened).toHaveBeenCalled());
        const opened = onOpened.mock.calls[0][0] as string;
        expect((await store.links.get(docKeyOf(PLAN_FORMAT, opened)))?.remote.name).toBe("saturday.olplan.json");
    });

    it("offers only importing a copy when there's no connector", async () => {
        const { store, service } = setup({ fsa: false });
        renderWithStorage(<OpenFromMenu kind={PLAN_FORMAT} importHref="#/import" onOpened={() => {}} />, store, service);
        fireEvent.click(screen.getByRole("button", { name: OPEN_FROM_LABEL }));
        expect(await screen.findByRole("menuitem", { name: /Import a file/ })).toHaveAttribute("href", "#/import");
        expect(screen.queryByRole("menuitem", { name: /File on this computer/ })).not.toBeInTheDocument();
    });
});

describe("StorageScreen", () => {
    it("lists linked files with Unlink, and restores or deletes a recovered copy", async () => {
        const { store, service } = setup();
        const id = await newPractice(store, "Linked practice");
        await service.engine.saveNew(docKeyOf(PLAN_FORMAT, id), "local-file", "linked.olplan.json");
        const plan = await service.documents.read(docKeyOf(PLAN_FORMAT, id));
        await store.addRecoveredCopy({ docKey: docKeyOf(PLAN_FORMAT, id), kind: PLAN_FORMAT, documentId: plan!.documentId, title: "Older practice", payload: plan!.payload });

        renderWithStorage(<StorageScreen />, store, service);
        expect(await screen.findByText("Linked practice")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Unlink Linked practice" }));
        await waitFor(async () => expect(await store.links.get(docKeyOf(PLAN_FORMAT, id))).toBeNull());

        fireEvent.click(await screen.findByRole("button", { name: "Download Older practice" }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
        fireEvent.click(screen.getByRole("button", { name: `${RESTORE_LABEL}: Older practice` }));
        await waitFor(async () => {
            const sessions = await store.listSessions();
            expect(sessions.success && sessions.data).toHaveLength(2);
        });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Delete Older practice" }));
        });
        expect(await screen.findByText(NO_RECOVERED_MESSAGE)).toBeInTheDocument();
    });
});
