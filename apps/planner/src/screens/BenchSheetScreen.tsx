/** The bench sheet print surface: no chrome, pinned light, with the hosted print stylesheet. */
import { useCallback } from "react";
import { Box } from "@mui/material";
import LightThemeScope from "@/components/ui/LightThemeScope";
import { BenchSheet } from "@/components/features/practice-planner/print/BenchSheet";
import "@/app/(print)/print.css";
import type { LocalPlannerStore } from "../store/types";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";
import { useTeamProfileVersion } from "./useTeamProfile";

export function BenchSheetScreen({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getSessionView(id), [store, id]);
    // A "Your team" change shows on an open practice without a reload (practice logo spec R4).
    const state = useStoreResult(load, useTeamProfileVersion(store));
    return (
        <LightThemeScope component="main" className="bench-print-root" sx={{ minHeight: "100vh", bgcolor: "#fff", color: "#000" }}>
            {state.kind === "ready" ? (
                <BenchSheet session={state.data} />
            ) : (
                <Box sx={{ p: 3 }}>{state.kind === "loading" ? <LoadingScreen /> : <MissingScreen message={state.message} />}</Box>
            )}
        </LightThemeScope>
    );
}
