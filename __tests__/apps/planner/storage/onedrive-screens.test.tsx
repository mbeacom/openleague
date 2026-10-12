/**
 * OneDrive in the storage screens (storage connectors spec R6, R8, R9):
 * "Save to…" and "Open from…" offer it only when configured, sign in from the
 * tap, open from the app folder's list, say plainly when a work or school
 * account can't have the folder, and Disconnect points at the page that
 * removes the planner's access. Over the real store, the lazy connector and a
 * fake Graph. Made-up programs only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { docKeyOf } from "@/apps/planner/src/store/links";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";
import { createStorageService, type StorageService } from "@/apps/planner/src/storage/service";
import { createLazyOneDriveConnector } from "@/apps/planner/src/storage/onedrive-loader";
import { createMsalAuth, createOneDriveConnector } from "@/apps/planner/src/storage/onedrive";
import { StorageProvider } from "@/apps/planner/src/screens/storage/StorageContext";
import { DocumentStorageBar } from "@/apps/planner/src/screens/storage/DocumentStorageBar";
import { OpenFromMenu } from "@/apps/planner/src/screens/storage/OpenFromMenu";
import { StorageScreen } from "@/apps/planner/src/screens/storage/StorageScreen";
import { ONEDRIVE_APP_FOLDER_UNAVAILABLE, OPEN_FROM_LABEL, SAVE_TO_LABEL } from "@/apps/planner/src/screens/storage/messages";
import { PLAN_FORMAT } from "@/lib/plan-document";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { wrapScreen } from "../render-screen";
import { WORK_TENANT_ID, createFakeGraph, createFakeMsal } from "./fake-graph";

vi.mock("@/components/features/practice-planner/export/download", () => ({ downloadBlob: vi.fn() }));

afterEach(() => {
    vi.clearAllMocks();
});

const FILE = "tuesday-skills.olplan.json";

function setup({ signedIn = false, tenantId, accounts }: { signedIn?: boolean; tenantId?: string; accounts?: "personal" | "any" } = {}) {
    const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });
    const graph = createFakeGraph();
    const msal = createFakeMsal(graph, { signedIn, ...(tenantId ? { tenantId } : {}) });
    const oneDrive = createLazyOneDriveConnector({
        clientId: "00000000-0000-4000-8000-000000000001",
        // A work or school tenant signs in only through an `any` build.
        accounts: accounts ?? (tenantId ? "any" : "personal"),
        redirectUri: "https://planner.example/planner/auth/redirect.html",
        // A tap: the popup may open (the test's clicks stand in for the coach's).
        load: async () => ({
            createOneDriveFromConfig: ({ clientId, accounts: audience, redirectUri }) =>
                createOneDriveConnector({ auth: createMsalAuth({ clientId, accounts: audience, redirectUri, client: msal, interactive: () => true }), fetch: graph.fetch }),
        }),
    });
    const service = createStorageService(store, { pickers: null, extra: [oneDrive] });
    return { store, graph, msal, service, oneDrive };
}

function renderWithStorage(ui: ReactElement, store: LocalPlannerStore, service: StorageService) {
    return render(wrapScreen(<StorageProvider service={service}>{ui}</StorageProvider>, store));
}

async function newPractice(store: LocalPlannerStore, title = "Tuesday skills") {
    const created = await store.createSession({ title, date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

/** A menu item once its connector has loaded (it waits while loading, so the sign-in popup opens from the tap). */
async function readyItem(name: RegExp) {
    const item = await screen.findByRole("menuitem", { name });
    await waitFor(() => expect(item).not.toHaveAttribute("aria-disabled", "true"));
    return item;
}

/** Connect on Saved files: a first tap may only load the sign-in (then the button says Loading…); the next tap opens it. */
async function connectOneDrive() {
    const first = await screen.findByRole("button", { name: "Connect OneDrive" });
    await waitFor(() => expect(first).toBeEnabled());
    fireEvent.click(first);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Loading OneDrive…" })).toBeNull());
    const again = screen.queryByRole("button", { name: "Connect OneDrive" });
    if (again && !(again as HTMLButtonElement).disabled) fireEvent.click(again);
}

describe("OneDrive in Save to…", () => {
    it("is absent when no client id is configured", async () => {
        const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });
        const service = createStorageService(store, { pickers: null });
        const id = await newPractice(store);
        renderWithStorage(<DocumentStorageBar docKey={docKeyOf(PLAN_FORMAT, id)} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        fireEvent.click(await screen.findByRole("button", { name: SAVE_TO_LABEL }));
        await screen.findByRole("menuitem", { name: /Download a copy/ });
        expect(screen.queryByRole("menuitem", { name: /OneDrive/ })).not.toBeInTheDocument();
    });

    it("signs in from the tap, then saves to the app folder and links the practice", async () => {
        const { store, graph, msal, service } = setup();
        const id = await newPractice(store);
        renderWithStorage(<DocumentStorageBar docKey={docKeyOf(PLAN_FORMAT, id)} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        fireEvent.click(await screen.findByRole("button", { name: SAVE_TO_LABEL }));
        fireEvent.click(await readyItem(/OneDrive/));
        expect(await screen.findByText(`Saved to ${FILE} in OneDrive`)).toBeInTheDocument();
        expect(msal.popups).toBe(1);
        const link = await store.links.get(docKeyOf(PLAN_FORMAT, id));
        expect(link).toMatchObject({ connector: "onedrive", remote: { name: FILE }, baseWrittenHere: true });
        expect(graph.item(link!.remote.fileId)?.text).toContain('"format": "openleague.document"');
    });

    it("says plainly when a work or school account can't have the app folder", async () => {
        const { store, graph, service } = setup({ tenantId: WORK_TENANT_ID });
        graph.blockAppFolder(403);
        const id = await newPractice(store);
        renderWithStorage(<DocumentStorageBar docKey={docKeyOf(PLAN_FORMAT, id)} kind={PLAN_FORMAT} fileName={FILE} />, store, service);
        fireEvent.click(await screen.findByRole("button", { name: SAVE_TO_LABEL }));
        fireEvent.click(await readyItem(/OneDrive/));
        expect(await screen.findByText(ONEDRIVE_APP_FOLDER_UNAVAILABLE)).toBeInTheDocument();
        expect(await store.links.get(docKeyOf(PLAN_FORMAT, id))).toBeNull();
    });
});

describe("OneDrive in Open from…", () => {
    it("lists the app folder's files of this kind and opens the chosen one into a linked practice", async () => {
        const { store, service } = setup({ signedIn: true });
        const id = await newPractice(store, "Saturday scrimmage");
        const saved = await service.engine.saveNew(docKeyOf(PLAN_FORMAT, id), "onedrive", "saturday.olplan.json");
        if (!saved.ok) throw new Error(`save failed: ${saved.error.code}`);
        await service.engine.saveNew(docKeyOf(PLAN_FORMAT, await newPractice(store, "Other")), "onedrive", "other.olplan.json");
        await store.deletePracticeSession({ id, teamId: LOCAL_TEAM_ID });

        const onOpened = vi.fn();
        renderWithStorage(<OpenFromMenu kind={PLAN_FORMAT} importHref="#/import" onOpened={onOpened} />, store, service);
        fireEvent.click(screen.getByRole("button", { name: OPEN_FROM_LABEL }));
        fireEvent.click(await readyItem(/OneDrive/));
        const dialog = await screen.findByRole("dialog", { name: "Open from OneDrive" });
        expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(
            expect.arrayContaining([expect.stringContaining("saturday.olplan.json"), expect.stringContaining("other.olplan.json")]),
        );
        fireEvent.click(within(dialog).getByRole("button", { name: /saturday\.olplan\.json/ }));
        await waitFor(() => expect(onOpened).toHaveBeenCalled());
        const opened = onOpened.mock.calls[0][0] as string;
        expect(await store.links.get(docKeyOf(PLAN_FORMAT, opened))).toMatchObject({ connector: "onedrive", remote: { name: "saturday.olplan.json" }, baseWrittenHere: false });
        const view = await store.getSessionView(opened);
        expect(view.success && view.data.title).toBe("Saturday scrimmage");
    });

    it("says when there's nothing in the app folder yet", async () => {
        const { store, service } = setup({ signedIn: true });
        renderWithStorage(<OpenFromMenu kind={PLAN_FORMAT} importHref="#/import" onOpened={() => {}} />, store, service);
        fireEvent.click(screen.getByRole("button", { name: OPEN_FROM_LABEL }));
        fireEvent.click(await readyItem(/OneDrive/));
        expect(await screen.findByText(/Nothing to open yet/)).toBeInTheDocument();
    });
});

describe("OneDrive on Saved files", () => {
    it("connects, and Disconnect clears the session and links to the account's app permissions", async () => {
        const { store, service, msal } = setup();
        renderWithStorage(<StorageScreen />, store, service);
        expect(await screen.findByText(/^OneDrive: not connected\./)).toBeInTheDocument();
        await connectOneDrive();
        expect(await screen.findByText(/^OneDrive: connected in this tab \(personal Microsoft account\)\./)).toBeInTheDocument();
        expect(msal.popups).toBe(1);
        fireEvent.click(screen.getByRole("button", { name: "Disconnect OneDrive" }));
        expect(await screen.findByText(/^OneDrive: not connected\./)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /your Microsoft account's app permissions/ })).toHaveAttribute("href", "https://account.live.com/consent/Manage");
        expect(screen.queryByRole("link", { name: /My Apps/ })).not.toBeInTheDocument();
    });

    it("links a work or school account to My Apps", async () => {
        const { store, service } = setup({ signedIn: true, tenantId: WORK_TENANT_ID });
        renderWithStorage(<StorageScreen />, store, service);
        expect(await screen.findByText(/^OneDrive: connected in this tab \(work or school account\)\./)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Disconnect OneDrive" }));
        expect(await screen.findByRole("link", { name: /My Apps/ })).toHaveAttribute("href", "https://myapps.microsoft.com/");
    });

    it("never mentions work or school accounts in a personal-only build, even when the account is unknown", async () => {
        const { store, service, oneDrive } = setup({ signedIn: true });
        expect(oneDrive.accounts).toBe("personal");
        renderWithStorage(<StorageScreen />, store, service);
        expect(await screen.findByText(/^OneDrive: connected in this tab \(personal Microsoft account\)\./)).toBeInTheDocument();
        // The account is forgotten before Disconnect reads it, as when MSAL's cache was cleared elsewhere.
        vi.spyOn(oneDrive, "accountType").mockReturnValue(null);
        fireEvent.click(screen.getByRole("button", { name: "Disconnect OneDrive" }));
        expect(await screen.findByRole("link", { name: /your Microsoft account's app permissions/ })).toHaveAttribute("href", "https://account.live.com/consent/Manage");
        expect(screen.queryByRole("link", { name: /My Apps/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/work or school/)).not.toBeInTheDocument();
    });

    it("offers both pages in an any-account build when the account is unknown", async () => {
        const { store, service, oneDrive } = setup({ signedIn: true, accounts: "any" });
        renderWithStorage(<StorageScreen />, store, service);
        expect(await screen.findByText(/^OneDrive: connected in this tab/)).toBeInTheDocument();
        vi.spyOn(oneDrive, "accountType").mockReturnValue(null);
        fireEvent.click(screen.getByRole("button", { name: "Disconnect OneDrive" }));
        expect(await screen.findByRole("link", { name: /My Apps/ })).toHaveAttribute("href", "https://myapps.microsoft.com/");
        expect(screen.getByRole("link", { name: /your Microsoft account's app permissions/ })).toBeInTheDocument();
    });
});
