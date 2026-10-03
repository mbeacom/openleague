/** Boot: open storage, seed starters, create the store once, render once. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { PlannerApp } from "./App";
import { createStaleSignal, openPlannerStore } from "./store/open-store";
import "./static.css";

async function boot(): Promise<void> {
    const container = document.getElementById("root");
    if (!container) throw new Error("index.html has no #root");
    const stale = createStaleSignal();
    const { store, durable } = await openPlannerStore({
        stale,
        storeOptions: { makeThumbnail: (playData) => generateThumbnail(playData) },
    });
    createRoot(container).render(
        <StrictMode>
            <PlannerApp store={store} durable={durable} stale={stale} />
        </StrictMode>,
    );
}

void boot();
