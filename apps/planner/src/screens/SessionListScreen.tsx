import { useCallback } from "react";
import { Alert, Button, Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import { Add as AddIcon, FileUploadOutlined as UploadIcon, SportsHockey as HockeyIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { LoadingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

function Actions() {
    return (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" startIcon={<AddIcon />} href={staticRoutes.sessionNew()}>
                New practice
            </Button>
            <Button variant="outlined" startIcon={<UploadIcon />} href={staticRoutes.importPlan()}>
                Import plan
            </Button>
        </Stack>
    );
}

export function SessionListScreen({ store }: { store: LocalPlannerStore }) {
    const load = useCallback(() => store.listSessions(), [store]);
    const state = useStoreResult(load);

    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <Alert severity="error">{state.message}</Alert>;
    if (state.data.length === 0) {
        return (
            <EmptyState
                icon={<HockeyIcon sx={{ fontSize: 48 }} />}
                title="Plan your first practice"
                description="Build a practice from drills, print a bench sheet, and share it as a file."
                action={<Actions />}
            />
        );
    }
    return (
        <>
            <PageHeader title="Practices" subtitle="Saved in this browser" actions={<Actions />} />
            <Stack spacing={1.5}>
                {state.data.map((session) => (
                    <Card key={session.id} variant="outlined">
                        <CardActionArea href={staticRoutes.session(session.id)}>
                            <CardContent>
                                <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
                                    {session.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {formatLongDate(session.date)} · {formatClockTime(session.date)} · {session.duration} min ·{" "}
                                    {session.drillCount} drill{session.drillCount === 1 ? "" : "s"}
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                ))}
            </Stack>
        </>
    );
}
