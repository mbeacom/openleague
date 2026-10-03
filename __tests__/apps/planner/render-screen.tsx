/** Renders a static-planner screen with the real theme, date adapter, static platform and a memory store. */
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import theme from "@/lib/theme";
import { PlannerProvider } from "@/lib/planner-store";
import { staticPlannerPlatform } from "@/apps/planner/src/platform";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";

export function memoryStore(): { store: LocalPlannerStore; repo: ReturnType<typeof createMemoryRepo> } {
    const repo = createMemoryRepo();
    let id = 0;
    return { repo, store: createLocalPlannerStore(repo, { newId: () => `id-${++id}` }) };
}

/** The provider tree, also for `rerender`, which replaces the whole root element. */
export function wrapScreen(ui: ReactElement, store: LocalPlannerStore): ReactElement {
    return (
        <ThemeProvider theme={theme}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PlannerProvider store={store} platform={staticPlannerPlatform}>
                    {ui}
                </PlannerProvider>
            </LocalizationProvider>
        </ThemeProvider>
    );
}

export function renderScreen(ui: ReactElement, store: LocalPlannerStore): RenderResult {
    return render(wrapScreen(ui, store));
}
