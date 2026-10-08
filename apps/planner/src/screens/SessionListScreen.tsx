import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import { Add as AddIcon, FileUploadOutlined as UploadIcon, SportsHockey as HockeyIcon, StarBorder as StarBorderIcon, ViewQuiltOutlined as TemplateIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FavoriteToggle, FavoritesFilterChip } from "@/components/features/practice-planner/FavoriteToggle";
import { usePlannerFavorites } from "@/components/features/practice-planner/usePlannerFavorites";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";
import { favoritesFirst } from "@/lib/utils/planner-favorites";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore, LocalSessionSummary } from "../store/types";
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
            <Button variant="outlined" startIcon={<TemplateIcon />} href={staticRoutes.importPlan()}>
                Use a template
            </Button>
        </Stack>
    );
}

export function SessionListScreen({ store }: { store: LocalPlannerStore }) {
    const load = useCallback(() => store.listSessions(), [store]);
    const state = useStoreResult(load);
    // Favorites on this device (practice favorites spec): starred practices first, then newest first.
    const favorites = usePlannerFavorites("PRACTICE");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const sessions = useMemo(() => {
        if (state.kind !== "ready") return [];
        const listed = favoritesOnly ? state.data.filter((session) => favorites.isFavorite(session.id)) : state.data;
        // Stable sort: the store's order (newest first) holds within each group.
        return [...listed].sort(favoritesFirst<LocalSessionSummary>((session) => favorites.isFavorite(session.id)));
    }, [state, favoritesOnly, favorites]);

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
            {favorites.supported && (
                <Stack direction="row" sx={{ mb: 2 }}>
                    <FavoritesFilterChip active={favoritesOnly} onChange={setFavoritesOnly} />
                </Stack>
            )}
            {favorites.error && (
                <Alert severity="error" onClose={favorites.clearError} sx={{ mb: 2 }}>
                    {favorites.error}
                </Alert>
            )}
            {sessions.length === 0 ? (
                <EmptyState
                    icon={<StarBorderIcon sx={{ fontSize: 48 }} />}
                    title="No favorite practices yet"
                    description="Tap the star on a practice to find it here."
                />

            ) : (
                <Stack spacing={1.5}>
                    {sessions.map((session) => (
                        <Card key={session.id} variant="outlined" sx={{ display: "flex", alignItems: "center" }}>
                            <CardActionArea href={staticRoutes.session(session.id)} sx={{ flex: 1, minWidth: 0 }}>
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
                            {/* Beside the link, never inside it: the star doesn't open the practice. */}
                            {favorites.supported && (
                                <FavoriteToggle
                                    name={session.title}
                                    active={favorites.isFavorite(session.id)}
                                    onToggle={(next) => void favorites.setFavorite(session.id, next)}
                                    sx={{ mx: 1 }}
                                />
                            )}
                        </Card>
                    ))}
                </Stack>
            )}
        </>
    );
}
