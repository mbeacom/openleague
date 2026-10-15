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
import { AUTOSAVE_LABEL, CHOOSE_FOLDER_LABEL, NO_PLANNER_FOLDER, SAVE_ALL_LABEL, SaveLocations, STOP_FOLDER_LABEL } from "@/apps/planner/src/screens/storage/SaveLocations";
import { wrapScreen } from "../render-screen";
import { createFakeFsa, memoryHandleStore } from "./fake-fsa";

function setup() {
    const store = createLocalPlannerStore(createMemoryRepo(), { newId: () => crypto.randomUUID() });
    const disk = createFakeFsa();
    const locations = createMemoryLocationStore();
    const service = createStorageService(store, { pickers: disk.pickers, handles: memoryHandleStore(), locations });
    render(wrapScreen(<StorageProvider service={service}><SaveLocations connectors={service.connectors} /></StorageProvider>, store));
    return { store, disk, locations };
}

describe("Where new files go", () => {
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

        const toggle = screen.getByRole("switch", { name: AUTOSAVE_LABEL });
        expect(toggle).toBeChecked();
        fireEvent.click(toggle);
        await waitFor(async () => expect((await locations.get("local-file"))?.autosave).toBe(false));

        fireEvent.click(screen.getByRole("button", { name: STOP_FOLDER_LABEL }));
        expect(await screen.findByText(NO_PLANNER_FOLDER)).toBeInTheDocument();
    });
});
