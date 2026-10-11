/**
 * Google Drive in the storage screens (storage connectors spec R5, R8, R9):
 * offered only when the build configures it, signed in from the tap that
 * needs it, "Save a copy to my Drive" for a view-only share, and Connect /
 * Disconnect on Saved files. Over the real store, the lazy connector and a
 * fake Drive. Made-up programs only.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import type { GoogleCloudSettings } from "@/apps/planner/cloud-config";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { docKeyOf } from "@/apps/planner/src/store/links";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";
import { createStorageService, type StorageService } from "@/apps/planner/src/storage/service";
import { createGoogleDriveConnector } from "@/apps/planner/src/storage/google-drive";
import { createLazyGoogleDriveConnector } from "@/apps/planner/src/storage/google-drive-lazy";
import { StorageProvider } from "@/apps/planner/src/screens/storage/StorageContext";
import { DocumentStorageBar } from "@/apps/planner/src/screens/storage/DocumentStorageBar";
import { OpenFromMenu } from "@/apps/planner/src/screens/storage/OpenFromMenu";
import { StorageScreen } from "@/apps/planner/src/screens/storage/StorageScreen";
import { CONNECTOR_ACCOUNT_PAGES } from "@/apps/planner/src/screens/storage/CloudConnections";
import { OPEN_FROM_LABEL, SAVE_LABEL, SAVE_TO_LABEL } from "@/apps/planner/src/screens/storage/messages";
import { PLAN_FORMAT } from "@/lib/plan-document";
import { wrapScreen } from "../render-screen";
import { createFakeDrive } from "./fake-drive";

const SETTINGS: GoogleCloudSettings = { clientId: "123-fictional.apps.googleusercontent.com", apiKey: "fictional-key", appId: "123456789" };
const FILE = "tuesday-skills.olplan.json";

function setup({ google = true }: { google?: boolean } = {}) {
    const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });
    const drive = createFakeDrive();
    let loads = 0;
    const extra = google
        ? [
              createLazyGoogleDriveConnector(SETTINGS, async (settings) => {
                  loads++;
                  return createGoogleDriveConnector({ settings, fetch: drive.fetch, auth: drive.auth, picker: drive.picker });
              }),
          ]
        : [];
    const service = createStorageService(store, { pickers: null, extra });
    return { store, drive, service, loads: () => loads };
}

function renderWithStorage(ui: ReactElement, store: LocalPlannerStore, service: StorageService) {
    return render(wrapScreen(<StorageProvider service={service}>{ui}</StorageProvider>, store));
}

async function newPractice(store: LocalPlannerStore, title = "Tuesday skills") {
    const created = await store.createSession({ title, date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

async function saveToDrive() {
    fireEvent.click(await screen.findByRole("button", { name: SAVE_TO_LABEL }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Google Drive/ }));
    expect(await screen.findByText(`Saved to ${FILE} in Google Drive`)).toBeInTheDocument();
}

describe("Google Drive in the storage screens", () => {
    it("isn't offered when the build doesn't configure it", async () => {
        const { store, service } = setup({ google: false });
        const id = await newPractice(store);
        renderWithStorage(<DocumentStorageBar docKey={docKeyOf(PLAN_FORMAT, id)} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        fireEvent.click(await screen.findByRole("button", { name: SAVE_TO_LABEL }));
        await screen.findByRole("menu");
        expect(screen.queryByRole("menuitem", { name: /Google Drive/ })).toBeNull();
    });

    it("loads the connector when the menu opens, signs in from the tap, and saves to Drive", async () => {
        const { store, drive, service, loads } = setup();
        const id = await newPractice(store);
        renderWithStorage(<DocumentStorageBar docKey={docKeyOf(PLAN_FORMAT, id)} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        expect(loads()).toBe(0);
        await saveToDrive();
        expect(loads()).toBe(1);
        expect(drive.auth.prepared).toBe(1);
        const saved = [...drive.files.values()].find((file) => file.name === FILE)!;
        expect(saved.content).toContain('"format": "openleague.document"');
        expect(saved.appProperties).toMatchObject({ olKind: PLAN_FORMAT });
    });

    it("offers Save a copy to my Drive when a view-only share refuses the save (R8)", async () => {
        const { store, drive, service } = setup();
        const id = await newPractice(store);
        const key = docKeyOf(PLAN_FORMAT, id);
        const view = renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        await saveToDrive();
        const shared = [...drive.files.values()].find((file) => file.name === FILE)!;
        shared.canEdit = false;

        await store.updateSession(id, { title: "Tuesday edges", date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
        view.rerender(wrapScreen(<StorageProvider service={service}><DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName={FILE} editVersion={1} /></StorageProvider>, store));
        fireEvent.click(await screen.findByRole("button", { name: SAVE_LABEL }));
        expect(await screen.findByText(/view-only/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Save a copy to my Drive" }));
        expect(await screen.findByText("Saved to tuesday-skills (my copy).olplan.json in Google Drive")).toBeInTheDocument();
        const copy = [...drive.files.values()].find((file) => file.name === "tuesday-skills (my copy).olplan.json")!;
        expect(copy.content).toContain("Tuesday edges");
        expect(shared.content).not.toContain("Tuesday edges");
    });

    it("opens a file picked in Google Drive as a linked document", async () => {
        const { store, drive, service } = setup();
        const id = await newPractice(store, "Thursday flow");
        const key = docKeyOf(PLAN_FORMAT, id);
        const first = renderWithStorage(<DocumentStorageBar docKey={key} kind={PLAN_FORMAT} fileName="thursday-flow.olplan.json" />, store, service);
        fireEvent.click(await screen.findByRole("button", { name: SAVE_TO_LABEL }));
        fireEvent.click(await screen.findByRole("menuitem", { name: /Google Drive/ }));
        await screen.findByText("Saved to thursday-flow.olplan.json in Google Drive");
        first.unmount();
        const file = [...drive.files.values()].find((entry) => entry.name === "thursday-flow.olplan.json")!;

        // A second browser: its own store and its own session with Google.
        const other = setup();
        other.drive.files.set(file.id, { ...file });
        const opened: string[] = [];
        renderWithStorage(<OpenFromMenu kind={PLAN_FORMAT} importHref="#/import" onOpened={(localId) => opened.push(localId)} />, other.store, other.service);
        other.drive.queuePick([{ id: file.id, name: file.name }]);
        fireEvent.click(await screen.findByRole("button", { name: OPEN_FROM_LABEL }));
        fireEvent.click(await screen.findByRole("menuitem", { name: /Google Drive/ }));
        await waitFor(() => expect(opened).toHaveLength(1));
        expect(other.drive.pickInputs).toHaveLength(1);
        const link = await other.store.links.get(docKeyOf(PLAN_FORMAT, opened[0]));
        expect(link).toMatchObject({ connector: "google-drive", remote: { fileId: file.id }, baseWrittenHere: false });
    });

    it("connects and disconnects on Saved files, keeping links and pointing to the account page", async () => {
        const { store, drive, service } = setup();
        renderWithStorage(<StorageScreen />, store, service);
        expect(await screen.findByText(/Google Drive: not connected/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Connect Google Drive" }));
        expect(await screen.findByText(/Google Drive: connected in this tab/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Disconnect Google Drive" }));
        expect(await screen.findByText(/Disconnected from Google Drive in this tab/)).toBeInTheDocument();
        expect(drive.revoked).toHaveLength(1);
        expect(screen.getByRole("link", { name: CONNECTOR_ACCOUNT_PAGES["google-drive"]!.label })).toHaveAttribute("href", "https://myaccount.google.com/connections");
        expect(screen.getByText(/Google Drive: not connected/)).toBeInTheDocument();
    });

    it("says plainly when Google sign-in is refused", async () => {
        const { store, drive, service } = setup();
        renderWithStorage(<StorageScreen />, store, service);
        drive.queueToken({ ok: false, reason: "denied" });
        fireEvent.click(await screen.findByRole("button", { name: "Connect Google Drive" }));
        expect(await screen.findByText(/Google Drive didn't allow access/)).toBeInTheDocument();
    });
});
