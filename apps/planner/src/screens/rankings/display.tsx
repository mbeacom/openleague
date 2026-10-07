/** Shared rankings display pieces: number formats, movement (icon + word), level bands, status views. */
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import type { Movement } from "@/lib/ratings";
import { staticRoutes } from "../../routes";
import type { RankingsState } from "./useRankingsDoc";

export const NO_RANKINGS_MESSAGE = "No rankings yet. Paste your league's schedule page to get started.";
export const START_OVER_LABEL = "Start over";
export const COMPONENTS_WARNING =
    "Some teams never played anyone connected to the rest, so ratings can't be compared across those groups.";
export const NOT_CONVERGED_WARNING = "The ratings didn't fully settle. Results may shift slightly.";

export function formatRating(value: number | null, digits = 1): string {
    return value === null ? "—" : value.toFixed(digits);
}

export function formatSigned(value: number | null): string {
    if (value === null) return "—";
    const text = Math.abs(value) < 0.05 ? "0.0" : value.toFixed(1);
    return value >= 0.05 ? `+${text}` : text;
}

const MOVEMENT: Record<Movement, { icon: string; word: string }> = {
    up: { icon: "▲", word: "Up" },
    same: { icon: "▬", word: "Same" },
    down: { icon: "▼", word: "Down" },
};

export function MovementLabel({ movement, startingLevel }: { movement: Movement | null; startingLevel: string | null }) {
    if (!movement) return null;
    const { icon, word } = MOVEMENT[movement];
    return (
        <Box component="span" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
            <span aria-hidden="true">{icon}</span> {word}
            {startingLevel ? ` from ${startingLevel}` : ""}
        </Box>
    );
}

/** One League Blue ramp: the top level darkest, the bottom lightest (spec, Colour). */
export function levelBandColor(theme: Theme, index: number, count: number): string {
    const strongest = 0.18;
    const weakest = 0.04;
    const t = count <= 1 ? 0 : index / (count - 1);
    return alpha(theme.palette.primary.main, strongest - (strongest - weakest) * t);
}

export function RankingsStatus({ state, onStartOver }: { state: Exclude<RankingsState, { status: "ready" }> | { status: "empty" }; onStartOver: () => void }) {
    if (state.status === "loading") {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress aria-label="Loading rankings" />
            </Box>
        );
    }
    if (state.status === "error") {
        return (
            <Alert
                severity="error"
                action={
                    <Button color="inherit" size="small" onClick={onStartOver} sx={{ minHeight: 44 }}>
                        {START_OVER_LABEL}
                    </Button>
                }
            >
                {state.message}
            </Alert>
        );
    }
    return (
        <Stack spacing={2} sx={{ alignItems: "flex-start", py: 2 }}>
            <Typography>{NO_RANKINGS_MESSAGE}</Typography>
            <Button variant="contained" href={staticRoutes.rankingsImport()} sx={{ minHeight: 44 }}>
                Import schedule
            </Button>
        </Stack>
    );
}
