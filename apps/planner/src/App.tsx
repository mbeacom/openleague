/**
 * The static planner (ADR-0020). The store comes in as a prop, created once
 * in main.tsx, and the platform is a module constant, so neither identity
 * changes between renders (PlayLibrary's loadPlays depends on the store).
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Box, Button } from "@mui/material";
import { PlannerProvider } from "@/lib/planner-store";
import { staticPlannerPlatform, useHashRoute } from "./platform";
import { navSection, type StaticRoute } from "./routes";
import type { StaleSignal } from "./store/open-store";
import type { LocalPlannerStore } from "./store/types";
import { StaticThemeProvider } from "./theme";
import { AppShell } from "./screens/AppShell";
import { BenchSheetScreen } from "./screens/BenchSheetScreen";
import { DrillEditorScreen } from "./screens/DrillEditorScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { SessionDetailScreen } from "./screens/SessionDetailScreen";
import { SessionEditorScreen } from "./screens/SessionEditorScreen";
import { SessionListScreen } from "./screens/SessionListScreen";
import { NotFoundScreen } from "./screens/StatusScreens";
import { YourTeamButton } from "./screens/YourTeam";

export const CRASH_MESSAGE = "Something went wrong. Your saved practices are safe in this browser.";

class RootErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown, info: ErrorInfo) {
        console.error("Planner crashed:", error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <Box sx={{ p: 3 }}>
                <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                            Reload
                        </Button>
                    }
                >
                    {CRASH_MESSAGE}
                </Alert>
            </Box>
        );
    }
}

function RouteView({ route, store }: { route: StaticRoute; store: LocalPlannerStore }) {
    switch (route.name) {
        case "list":
            return <SessionListScreen store={store} />;
        case "sessionNew":
            return <SessionEditorScreen key="new" store={store} />;
        case "sessionEdit":
            return <SessionEditorScreen key={route.id} store={store} id={route.id} />;
        case "session":
            return <SessionDetailScreen key={route.id} store={store} id={route.id} />;
        case "library":
            return <LibraryScreen />;
        case "libraryNew":
            return <DrillEditorScreen key="new" store={store} />;
        case "libraryEdit":
            return <DrillEditorScreen key={route.id} store={store} id={route.id} />;
        case "import":
        case "planLink":
            // One key for both: replacing #plan=… with #/import must not remount the screen.
            return <ImportScreen key="import" store={store} linkValue={route.name === "planLink" ? route.value : null} />;
        default:
            return <NotFoundScreen />;
    }
}

export interface PlannerAppProps {
    store: LocalPlannerStore;
    durable: boolean;
    stale: StaleSignal;
}

export function PlannerApp({ store, durable, stale }: PlannerAppProps) {
    const route = useHashRoute();
    return (
        <StaticThemeProvider>
            <RootErrorBoundary>
                <PlannerProvider store={store} platform={staticPlannerPlatform}>
                    {route.name === "sessionPrint" ? (
                        <BenchSheetScreen key={route.id} store={store} id={route.id} />
                    ) : (
                        <AppShell durable={durable} stale={stale} section={navSection(route)} teamControl={<YourTeamButton store={store} />}>
                            <RouteView route={route} store={store} />
                        </AppShell>
                    )}
                </PlannerProvider>
            </RootErrorBoundary>
        </StaticThemeProvider>
    );
}
