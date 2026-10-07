/** Boot: open storage, seed starters, create the store once, render once. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { STORED_THUMBNAIL_PIXEL_RATIO } from "@/lib/utils/thumbnail-rules";
import { waitForDiagramFont } from "@/lib/utils/canvas/diagram-fonts";
import { CRASH_MESSAGE, PlannerApp } from "./App";
import { createStaleSignal, openPlannerStore } from "./store/open-store";
import "./static.css";

async function boot(): Promise<void> {
    const container = document.getElementById("root");
    if (!container) throw new Error("index.html has no #root");
    const stale = createStaleSignal();
    // Seeding and the thumbnail refresh store diagrams: wait for their font (at most 1.5 s).
    await waitForDiagramFont();
    const { store, durable } = await openPlannerStore({
        stale,
        storeOptions: { makeThumbnail: (playData) => generateThumbnail(playData, { pixelRatio: STORED_THUMBNAIL_PIXEL_RATIO }) },
    });
    createRoot(container).render(
        <StrictMode>
            <PlannerApp store={store} durable={durable} stale={stale} />
        </StrictMode>,
    );
}

/** A boot failure must never leave a blank page: say so in plain text. */
function showBootFailure(error: unknown): void {
    console.error("The planner failed to start:", error);
    const target = document.getElementById("root") ?? document.body;
    target.textContent = CRASH_MESSAGE;
}

boot().catch(showBootFailure);
