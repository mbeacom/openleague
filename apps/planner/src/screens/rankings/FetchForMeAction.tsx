/**
 * "Fetch it for me" (ADR-0024): the Update results panel's second action. A plain link to the
 * hosted app's fetch page, carrying the saved schedule page's address in the fragment. The
 * static app makes no request itself; the hosted page sends the games back to #/rankings/import.
 */
import { Box, Button, Typography } from "@mui/material";
import type { RankingsSource } from "@/lib/rankings-document";
import { hostedFetchUrl } from "../../config";

export const FETCH_FOR_ME_LABEL = "Fetch it for me";
export const FETCH_FOR_ME_NOTE = "Opens OpenLeague's hosted app, where a signed-in account fetches the page.";

/** Nothing when no schedule page is saved: there is no address to fetch. */
export function FetchForMeAction({ source }: { source: RankingsSource | null }) {
    if (!source) return null;
    return (
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1, rowGap: 0.5 }}>
            <Button variant="outlined" href={hostedFetchUrl(source.url)} aria-describedby="fetch-for-me-note" sx={{ minHeight: 44 }}>
                {FETCH_FOR_ME_LABEL}
            </Button>
            <Typography id="fetch-for-me-note" variant="caption" color="text.secondary" sx={{ maxWidth: "22rem" }}>
                {FETCH_FOR_ME_NOTE}
            </Typography>
        </Box>
    );
}
