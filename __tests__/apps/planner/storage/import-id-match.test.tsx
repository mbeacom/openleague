/**
 * Opening a file as a copy (storage connectors spec R7, tier 2): a wrapped
 * file whose envelope id matches a document here offers "Replace my copy" or
 * "Keep both"; a file with an id and no match keeps its id. Made-up programs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { memoryStore, renderScreen } from "../render-screen";
import { ImportScreen } from "@/apps/planner/src/screens/ImportScreen";
import { RankingsImportScreen } from "@/apps/planner/src/screens/rankings/RankingsImportScreen";
import { createRankingsFileOps } from "@/apps/planner/src/storage/documents";
import { KEEP_BOTH_COPIES_LABEL, REPLACE_MY_COPY_LABEL, SAME_DOCUMENT_TITLE } from "@/apps/planner/src/screens/storage/ReplaceOrKeepDialog";
import { PLAN_FORMAT, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { RANKINGS_FORMAT } from "@/lib/rankings-document";
import { serializeDocument, wrapDocument } from "@/lib/document-envelope";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { sampleRankingsDoc } from "../rankings-fixtures";

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()),
    generateThumbnail: vi.fn(() => "data:image/png;base64,AA=="),
}));

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

const INPUT: PlanSessionInput = {
    title: "From the file",
    durationMinutes: 60,
    date: "2026-10-06",
    startTime: "19:00",
    drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Breakout", description: null, playData: createEmptyPlayData() }],
};
const PLAN = serializePlan(INPUT, "openleague-static");

const planFile = (id: string) =>
    new File([serializeDocument(wrapDocument(PLAN_FORMAT, PLAN, { id, updatedAt: "2026-10-07T18:04:00.000Z", generator: "openleague-static" }))], "practice.olplan.json", { type: "application/json" });

async function practiceWithId(store: ReturnType<typeof memoryStore>["store"], title: string) {
    const created = await store.createSession({ title, date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    const documentId = await store.ensureSessionDocumentId(created.data.id);
    if (!documentId.success) throw new Error(documentId.error);
    return { id: created.data.id, documentId: documentId.data };
}

describe("plan import with a matching id", () => {
    it("Replace my copy replaces the practice in place and keeps its old version", async () => {
        const { store } = memoryStore({ uuids: true });
        const mine = await practiceWithId(store, "My version");
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        fireEvent.change(screen.getByTestId("plan-file-input"), { target: { files: [planFile(mine.documentId)] } });
        fireEvent.click(await screen.findByRole("button", { name: /save to my practices/i }));
        const dialog = await screen.findByRole("dialog", { name: SAME_DOCUMENT_TITLE });
        expect(dialog).toHaveTextContent("My version");
        fireEvent.click(within(dialog).getByRole("button", { name: REPLACE_MY_COPY_LABEL }));
        await waitFor(() => expect(window.location.hash).toBe(`#/sessions/${mine.id}`));
        const view = await store.getSessionView(mine.id);
        expect(view.success && view.data.title).toBe("From the file");
        const sessions = await store.listSessions();
        expect(sessions.success && sessions.data).toHaveLength(1);
        const copies = await store.listRecoveredCopies();
        expect(copies.success && copies.data.map((copy) => copy.title)).toEqual(["My version"]);
    });

    it("Keep both imports a separate practice with its own id", async () => {
        const { store } = memoryStore({ uuids: true });
        const mine = await practiceWithId(store, "My version");
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        fireEvent.change(screen.getByTestId("plan-file-input"), { target: { files: [planFile(mine.documentId)] } });
        fireEvent.click(await screen.findByRole("button", { name: /save to my practices/i }));
        fireEvent.click(within(await screen.findByRole("dialog", { name: SAME_DOCUMENT_TITLE })).getByRole("button", { name: KEEP_BOTH_COPIES_LABEL }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        const newId = decodeURIComponent(window.location.hash.split("/")[2]);
        expect(newId).not.toBe(mine.id);
        const info = await store.getSessionDocumentInfo(newId);
        expect(info.success && info.data.documentId).not.toBe(mine.documentId);
    });

    it("a file with an id and no match keeps the id", async () => {
        const { store } = memoryStore({ uuids: true });
        const fileId = "6f1c2b9a-1d4e-4a5b-8c7d-0e9f8a7b6c5d";
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        fireEvent.change(screen.getByTestId("plan-file-input"), { target: { files: [planFile(fileId)] } });
        fireEvent.click(await screen.findByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        expect(screen.queryByRole("dialog", { name: SAME_DOCUMENT_TITLE })).not.toBeInTheDocument();
        const found = await store.findSessionByDocumentId(fileId);
        expect(found.success && found.data?.title).toBe("From the file");
    });
});

describe("rankings file open with a matching id", () => {
    const rankingsFile = (id: string, title: string) =>
        new File([serializeDocument(wrapDocument(RANKINGS_FORMAT, sampleRankingsDoc({ meta: { ...sampleRankingsDoc().meta, title } }), { id, updatedAt: "2026-10-07T18:04:00.000Z", generator: "openleague-static" }))], "fall.rankings.json", {
            type: "application/json",
        });

    it("Replace my copy replaces that document and keeps its old version", async () => {
        const { store } = memoryStore({ uuids: true });
        const created = await store.createRankingsDocument(sampleRankingsDoc({ meta: { ...sampleRankingsDoc().meta, title: "Mine" } }));
        if (!created.success) throw new Error(created.error);
        renderScreen(<RankingsImportScreen store={store} files={createRankingsFileOps(store)} />, store);
        fireEvent.change(await screen.findByTestId("rankings-file-input"), { target: { files: [rankingsFile(created.data.documentId, "Theirs")] } });
        fireEvent.click(within(await screen.findByRole("dialog", { name: SAME_DOCUMENT_TITLE })).getByRole("button", { name: REPLACE_MY_COPY_LABEL }));
        await waitFor(async () => {
            const record = await store.getRankingsDocument(created.data.id);
            expect(record.success && record.data.document.meta.title).toBe("Theirs");
        });
        const list = await store.listRankingsDocuments();
        expect(list.success && list.data).toHaveLength(1);
        const copies = await store.listRecoveredCopies();
        expect(copies.success && copies.data.map((copy) => copy.title)).toEqual(["Mine"]);
    });

    it("Keep both adds a second rankings document", async () => {
        const { store } = memoryStore({ uuids: true });
        const created = await store.createRankingsDocument(sampleRankingsDoc({ meta: { ...sampleRankingsDoc().meta, title: "Mine" } }));
        if (!created.success) throw new Error(created.error);
        renderScreen(<RankingsImportScreen store={store} files={createRankingsFileOps(store)} />, store);
        fireEvent.change(await screen.findByTestId("rankings-file-input"), { target: { files: [rankingsFile(created.data.documentId, "Theirs")] } });
        fireEvent.click(within(await screen.findByRole("dialog", { name: SAME_DOCUMENT_TITLE })).getByRole("button", { name: KEEP_BOTH_COPIES_LABEL }));
        await waitFor(async () => {
            const list = await store.listRankingsDocuments();
            expect(list.success && list.data.map((entry) => entry.title).sort()).toEqual(["Mine", "Theirs"]);
        });
    });

    it("a new file with an id, opened with no rankings here, keeps its id", async () => {
        const { store } = memoryStore({ uuids: true });
        const fileId = "6f1c2b9a-1d4e-4a5b-8c7d-0e9f8a7b6c5d";
        renderScreen(<RankingsImportScreen store={store} files={createRankingsFileOps(store)} />, store);
        fireEvent.change(await screen.findByTestId("rankings-file-input"), { target: { files: [rankingsFile(fileId, "Opened")] } });
        await waitFor(async () => expect(await store.getRankingsDocumentId()).toEqual({ success: true, data: fileId }));
    });
});
