/**
 * The static planner (ADR-0020). The store comes in as a prop, created once
 * in main.tsx, and the platform is a module constant, so neither identity
 * changes between renders (PlayLibrary's loadPlays depends on the store).
 */
import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
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
import { RankingsImportScreen } from "./screens/rankings/RankingsImportScreen";
import { RankingsScreen } from "./screens/rankings/RankingsScreen";
import { RankingsSetupScreen } from "./screens/rankings/RankingsSetupScreen";
import { RankingsTeamScreen } from "./screens/rankings/RankingsTeamScreen";
import { RankingsWhatIfScreen } from "./screens/rankings/RankingsWhatIfScreen";
import { NotFoundScreen } from "./screens/StatusScreens";
import { YourTeamButton } from "./screens/YourTeam";

// AI screens and lib/ai load only when opened (ADR-0023): the build check keeps adapter code out of the entry chunk.
const AiSettingsScreen = lazy(() => import("./ai/AiSettingsScreen").then((module) => ({ default: module.AiSettingsScreen })));
const NotesDraftScreen = lazy(() => import("./ai/NotesDraftScreen").then((module) => ({ default: module.NotesDraftScreen })));

function LazyScreen({ children }: { children: ReactNode }) {
    return <Suspense fallback={<Typography color="text.secondary">Loading…</Typography>}>{children}</Suspense>;
}

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
        case "rankings":
            return <RankingsScreen store={store} />;
        case "rankingsImport":
            // A pull (ADR-0024) keeps the "import" key: dropping it from the hash must not remount the screen.
            return <RankingsImportScreen key={route.update ? "update" : "import"} store={store} update={route.update === true} pull={route.pull} />;
        case "rankingsSetup":
            return <RankingsSetupScreen store={store} />;
        case "rankingsWhatIf":
            return <RankingsWhatIfScreen store={store} />;
        case "rankingsTeam":
            return <RankingsTeamScreen key={route.number} store={store} number={route.number} />;
        case "aiSettings":
            return (
                <LazyScreen>
                    <AiSettingsScreen store={store} />
                </LazyScreen>
            );
        case "importNotes":
            return (
                <LazyScreen>
                    <NotesDraftScreen store={store} />
                </LazyScreen>
            );
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
