/** Shared rankings display pieces: number formats, movement (icon + word), level bands, status views. */
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import type { Movement } from "@/lib/ratings";
import { rankedTeamCount, type RankingsDocument } from "@/lib/rankings-document";
import type { RankingsState } from "./useRankingsDoc";
import { useRankingsPlatform } from "./rankings-platform";

export const NO_RANKINGS_MESSAGE = "No rankings yet. Paste your league's schedule page to get started.";
export const START_OVER_LABEL = "Start over";
export const COMPONENTS_WARNING =
    "Some teams never played anyone connected to the rest, so ratings can't be compared across those groups.";
export const NOT_CONVERGED_WARNING = "The ratings didn't fully settle. Results may shift slightly.";
export const NO_GAMES_LABEL = "No games yet";
export const BELOW_LAST_LEVEL = "Below the last level";

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

/** "▲ Up from White Strong": always an icon plus a word, with the real starting bracket (spec). */
export function MovementLabel({ movement, startingBracket }: { movement: Movement | null; startingBracket: string | null }) {
    if (!movement) return null;
    const { icon, word } = MOVEMENT[movement];
    return (
        <Box component="span" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
            <span aria-hidden="true">{icon}</span> {word}
            {startingBracket ? ` ${movement === "same" ? "as" : "from"} ${startingBracket}` : ""}
        </Box>
    );
}

/** How many teams the levels hold; a size being typed (NaN) counts as 0. */
export const levelsHeld = (method: { levels: ReadonlyArray<{ size: number }> }) =>
    method.levels.reduce((sum, level) => sum + (Number.isFinite(level.size) ? level.size : 0), 0);

/**
 * The levels against the teams they must place: `held` from the level sizes,
 * `ranked` the teams that get a rank. Setup and Rankings both use this, so they
 * always agree.
 */
export function levelFit(doc: Pick<RankingsDocument, "method" | "teams" | "games">): { held: number; ranked: number; short: number } {
    const held = levelsHeld(doc.method);
    const ranked = rankedTeamCount(doc);
    return { held, ranked, short: Math.max(0, ranked - held) };
}

/** "Your levels hold 46 teams but 51 are ranked, so 5 have no suggested level." */
export function levelsShortMessage(held: number, ranked: number): string {
    const left = ranked - held;
    return `Your levels hold ${held} teams but ${ranked} are ranked, so ${left} ${left === 1 ? "has" : "have"} no suggested level.`;
}

/** What to show instead of a bare level: why a team has none. */
export function levelText(row: { level: string | null; rank: number | null; games: number; excluded: boolean }): string {
    if (row.level) return row.level;
    if (row.excluded) return "Excluded";
    if (row.games === 0) return NO_GAMES_LABEL;
    return row.rank !== null ? BELOW_LAST_LEVEL : "—";
}

export type ColorScheme = "light" | "dark";

/**
 * Band opacity on one League Blue ramp (spec, Colour): the top level most
 * emphasised, the bottom least. Dark needs stronger steps to read on the Night
 * Rink canvas. Each top end is as strong as it can be while secondary text on
 * the band stays at AA: light 0.26 (4.9:1), dark 0.28 (4.6:1; 0.32 drops it to
 * 4.3:1). Pure, so each scheme's ramp is tested directly.
 */
export const LEVEL_BAND_RAMP: Record<ColorScheme, { strongest: number; weakest: number }> = {
    light: { strongest: 0.26, weakest: 0.06 },
    dark: { strongest: 0.28, weakest: 0.08 },
};

export function levelBandAlpha(scheme: ColorScheme, index: number, count: number): number {
    const { strongest, weakest } = LEVEL_BAND_RAMP[scheme];
    const t = count <= 1 ? 0 : Math.min(Math.max(index / (count - 1), 0), 1);
    return strongest - (strongest - weakest) * t;
}

/**
 * The band background for one level, light and dark. Under cssVariables the JS
 * `theme.palette` is always the light palette, so the dark colour comes from the
 * dark colour scheme and is emitted with `theme.applyStyles("dark", …)`.
 */
export function levelBandSx(theme: Theme, index: number, count: number) {
    const light = theme.colorSchemes?.light?.palette.primary.main ?? theme.palette.primary.main;
    const dark = theme.colorSchemes?.dark?.palette.primary.main ?? light;
    return {
        backgroundColor: alpha(light, levelBandAlpha("light", index, count)),
        ...theme.applyStyles("dark", { backgroundColor: alpha(dark, levelBandAlpha("dark", index, count)) }),
    };
}

export function RankingsStatus({ state, onStartOver }: { state: Exclude<RankingsState, { status: "ready" }> | { status: "empty" }; onStartOver: () => void }) {
    const { routes } = useRankingsPlatform();
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
            <Button variant="contained" href={routes.rankingsImport()} sx={{ minHeight: 44 }}>
                Import schedule
            </Button>
        </Stack>
    );
}
