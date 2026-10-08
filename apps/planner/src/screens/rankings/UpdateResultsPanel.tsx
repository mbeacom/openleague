/**
 * Update results (static rankings spec, Updating results): one action that opens
 * the saved league schedule page in a new tab and takes the user to the import
 * screen, ready for a paste. The app itself never fetches the page (spec R2).
 */
import type { MouseEvent, ReactNode } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import type { RankingsSource } from "@/lib/rankings-document";
import { navigateTo } from "../../platform";
import { staticRoutes } from "../../routes";

export const UPDATE_RESULTS_LABEL = "Update results";
export const ADD_SCHEDULE_PAGE_LABEL = "Add the schedule page";
export const IMPORT_BY_HAND_LABEL = "Import by hand";
export const NO_SCHEDULE_PAGE_MESSAGE = "Save the league schedule page's address and updating takes one step.";
export const NEVER_UPDATED_LABEL = "Not updated from this page yet";

const DAY_MS = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "today", "yesterday", "3 days ago", "last week", "2 months ago": calendar days in local time. */
export function relativeDay(iso: string, now: Date): string {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return "";
    const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS));
    const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    if (days < 7) return format.format(-days, "day");
    if (days < 30) return format.format(-Math.floor(days / 7), "week");
    if (days < 365) return format.format(-Math.floor(days / 30), "month");
    return format.format(-Math.floor(days / 365), "year");
}

export function lastUpdatedText(source: RankingsSource, now: Date): string {
    return source.lastReadAt ? `Last updated ${relativeDay(source.lastReadAt, now)}` : NEVER_UPDATED_LABEL;
}

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
};

export interface UpdateResultsPanelProps {
    /** The saved league schedule page, or null when none is saved. */
    source: RankingsSource | null;
    now?: Date;
    /**
     * A second action next to Update results: RankingsScreen passes the hosted "Fetch it for me"
     * link (FetchForMeAction, ADR-0024). The static app itself never fetches.
     */
    fetchAction?: ReactNode;
}

export function UpdateResultsPanel({ source, now = new Date(), fetchAction }: UpdateResultsPanelProps) {
    const open = (event: MouseEvent<HTMLAnchorElement>) => {
        if (!source) return;
        event.preventDefault();
        // A new tab for the league page; this tab goes on to the paste box.
        window.open(source.url, "_blank", "noopener,noreferrer");
        navigateTo(staticRoutes.rankingsUpdate());
    };
    return (
        <Paper
            component="section"
            aria-label={UPDATE_RESULTS_LABEL}
            variant="outlined"
            sx={{ p: 2, borderRadius: 1, borderLeft: 4, borderLeftColor: "secondary.main", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5 }}
        >
            <Box sx={{ flex: "1 1 14rem", minWidth: 0 }}>
                {source ? (
                    <>
                        <Typography sx={{ fontWeight: 700 }}>{lastUpdatedText(source, now)}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                            {`From ${hostOf(source.url)}`}
                        </Typography>
                    </>
                ) : (
                    <Typography color="text.secondary">{NO_SCHEDULE_PAGE_MESSAGE}</Typography>
                )}
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                {source ? (
                    <Button variant="contained" href={source.url} target="_blank" rel="noopener noreferrer" onClick={open} sx={{ minHeight: 44 }}>
                        {UPDATE_RESULTS_LABEL}
                    </Button>
                ) : (
                    <>
                        <Button variant="contained" href={staticRoutes.rankingsSetup("pages")} sx={{ minHeight: 44 }}>
                            {ADD_SCHEDULE_PAGE_LABEL}
                        </Button>
                        <Button href={staticRoutes.rankingsImport()} sx={{ minHeight: 44 }}>
                            {IMPORT_BY_HAND_LABEL}
                        </Button>
                    </>
                )}
                {fetchAction}
            </Stack>
        </Paper>
    );
}
