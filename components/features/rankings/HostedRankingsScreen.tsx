"use client";

/**
 * The hosted half of the rankings seam (ADR-0025; hosted rankings and team
 * logos spec, R3). The screens are the static app's own; this binds them to
 * one stored record:
 * - the store is the record's server actions, memoized on the id (the screens
 *   load once per store identity);
 * - the routes are paths under /rankings/<id>, and navigation is router.push.
 *
 * "Fetch it for me" (ADR-0024) hands a schedule to the static app; on hosted
 * it becomes a direct fetch in phase 2, so phase 1 shows no second action.
 */
import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { clearRankingsRecord, getRankingsRecord, saveRankingsRecord } from "@/lib/actions/rankings";
import type { RankingsOps } from "@/apps/planner/src/store/rankings";
import { RankingsPlatformProvider, type RankingsPlatform, type RankingsRoutes } from "@/apps/planner/src/screens/rankings/rankings-platform";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { RankingsImportScreen } from "@/apps/planner/src/screens/rankings/RankingsImportScreen";
import { RankingsSetupScreen } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import { RankingsWhatIfScreen } from "@/apps/planner/src/screens/rankings/RankingsWhatIfScreen";
import { RankingsTeamScreen } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import type { RankingsSetupSection } from "@/apps/planner/src/routes";
import { RANKINGS_LIST_PATH } from "./paths";

export const ALL_RANKINGS_LABEL = "All rankings";

export type HostedRankingsView = { name: "rankings" } | { name: "import"; update?: boolean } | { name: "setup"; section?: RankingsSetupSection } | { name: "whatIf" } | { name: "team"; number: string };

/** Path routes for one stored record. */
export function hostedRankingsRoutes(id: string): RankingsRoutes {
    const base = `${RANKINGS_LIST_PATH}/${encodeURIComponent(id)}`;
    return {
        rankings: () => base,
        rankingsImport: () => `${base}/import`,
        rankingsUpdate: () => `${base}/import/update`,
        rankingsSetup: (section) => (section ? `${base}/setup/${section}` : `${base}/setup`),
        rankingsWhatIf: () => `${base}/what-if`,
        rankingsTeam: (number) => `${base}/team/${encodeURIComponent(number)}`,
    };
}

/** The record's server actions in the screens' store shape. */
export function hostedRankingsStore(id: string): RankingsOps {
    return {
        getRankings: async () => {
            const result = await getRankingsRecord(id);
            return result.success ? { success: true, data: result.data.document } : result;
        },
        saveRankings: (document) => saveRankingsRecord({ id, document }),
        clearRankings: () => clearRankingsRecord(id),
    };
}

function Screen({ view, store }: { view: HostedRankingsView; store: RankingsOps }): ReactNode {
    switch (view.name) {
        case "rankings":
            return <RankingsScreen store={store} />;
        case "import":
            return <RankingsImportScreen key={view.update ? "update" : "import"} store={store} update={view.update === true} />;
        case "setup":
            return <RankingsSetupScreen store={store} section={view.section} />;
        case "whatIf":
            return <RankingsWhatIfScreen store={store} />;
        case "team":
            return <RankingsTeamScreen key={view.number} store={store} number={view.number} />;
    }
}

export function HostedRankingsScreen({ id, view }: { id: string; view: HostedRankingsView }) {
    const router = useRouter();
    const store = useMemo(() => hostedRankingsStore(id), [id]);
    const platform = useMemo<RankingsPlatform>(
        () => ({ routes: hostedRankingsRoutes(id), navigate: (href) => router.push(href), fetchAction: () => null }),
        [id, router],
    );
    return (
        <Stack spacing={2}>
            <Button component={Link} href={RANKINGS_LIST_PATH} startIcon={<ArrowBackIcon />} sx={{ alignSelf: "flex-start", minHeight: 44 }}>
                {ALL_RANKINGS_LABEL}
            </Button>
            <RankingsPlatformProvider platform={platform}>
                <Screen view={view} store={store} />
            </RankingsPlatformProvider>
        </Stack>
    );
}
