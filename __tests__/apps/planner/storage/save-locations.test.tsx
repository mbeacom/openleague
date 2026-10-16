/**
 * "Where new files go" on Saved files (storage locations design): choosing
 * the planner folder, saving everything into it, and the autosave switch,
 * over the real store and a fake File System Access disk. Made-up programs only.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { createMemoryLocationStore } from "@/apps/planner/src/store/locations";
import { createStorageService } from "@/apps/planner/src/storage/service";
import { StorageProvider } from "@/apps/planner/src/screens/storage/StorageContext";
import { AUTOSAVE_LABEL, CHOOSE_FOLDER_LABEL, RESTORE_LABEL as RESTORE_FOLDER_LABEL, TAKE_FOLDER_COPY_LABEL, NO_PLANNER_FOLDER, SAVE_ALL_LABEL, STOP_FOLDER_LABEL } from "@/apps/planner/src/screens/storage/SaveLocations";
import { StorageScreen } from "@/apps/planner/src/screens/storage/StorageScreen";
import { wrapScreen } from "../render-screen";
import { createFakeFsa, memoryHandleStore } from "./fake-fsa";

function setup() {
    const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });
    const disk = createFakeFsa();
    const locations = createMemoryLocationStore();
    const service = createStorageService(store, { pickers: disk.pickers, handles: memoryHandleStore(), locations });
    render(wrapScreen(<StorageProvider service={service}><StorageScreen /></StorageProvider>, store));
    return { store, disk, locations };
}

describe("Where new files go", () => {
    it("lists a restore's differing documents and takes the folder's copy of one", async () => {
        const { store, disk } = setup();
        const created = await store.createSession({ title: "Saturday scrimmage", date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
        if (!created.success) throw new Error(created.error);
        disk.queueDirectory("Hawks");
        fireEvent.click(await screen.findByRole("button", { name: `${CHOOSE_FOLDER_LABEL} (This computer)` }));
        fireEvent.click(await screen.findByRole("button", { name: SAVE_ALL_LABEL }));
        expect(await screen.findByText("1 added to the folder.")).toBeInTheDocument();
        fireEvent.click(await screen.findByRole("button", { name: /^Unlink/ }));
        await waitFor(async () => expect(await store.links.list()).toHaveLength(0));
        await store.updateSession(created.data.id, { title: "Changed here", date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });

        fireEvent.click(screen.getByRole("button", { name: RESTORE_FOLDER_LABEL }));
        expect(await screen.findByText(/1 differ from what's here: choose below/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: `${TAKE_FOLDER_COPY_LABEL}: Changed here` }));
        await waitFor(async () => {
            const view = await store.getSessionView(created.data.id);
            expect(view.success && view.data.title).toBe("Saturday scrimmage");
        });
        expect(await screen.findByText("Changed here")).toBeInTheDocument(); // now under Recovered copies
    });

    it("chooses a planner folder, saves everything into it, and turns autosave off", async () => {
        const { store, disk, locations } = setup();
        await store.createSession({ title: "Tuesday skills", date: new Date("2026-10-14T17:30:00"), duration: 60, plays: [] });
        expect(await screen.findByText(NO_PLANNER_FOLDER)).toBeInTheDocument();

        disk.queueDirectory("Hawks");
        fireEvent.click(screen.getByRole("button", { name: `${CHOOSE_FOLDER_LABEL} (This computer)` }));
        expect(await screen.findByText("New files will go in Hawks.")).toBeInTheDocument();
        expect(await screen.findByText("In Hawks")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: SAVE_ALL_LABEL }));
        expect(await screen.findByText("1 added to the folder.")).toBeInTheDocument();
        expect(disk.paths()).toEqual(["Hawks/Practices/tuesday-skills.olplan.json"]);
        // The page's Linked files list follows, without a reload.
        expect(await screen.findByText(/Practices\/tuesday-skills\.olplan\.json in the planner folder/)).toBeInTheDocument();

        const toggle = screen.getByRole("switch", { name: AUTOSAVE_LABEL });
        expect(toggle).toBeChecked();
        fireEvent.click(toggle);
        await waitFor(async () => expect((await locations.get("local-file"))?.autosave).toBe(false));

        fireEvent.click(screen.getByRole("button", { name: STOP_FOLDER_LABEL }));
        expect(await screen.findByText(NO_PLANNER_FOLDER)).toBeInTheDocument();
    });
});
