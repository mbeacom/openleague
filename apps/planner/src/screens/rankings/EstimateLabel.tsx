/**
 * Ratings are estimates (team directory spec, R10; ADR-0026). Every computed
 * rating, rank, level and tier the rankings screens show carries the label, and
 * each screen carries the note once. Shared by the static and hosted apps, so
 * nothing here may import Next.js.
 *
 * No method has a validation record yet, so there is one wording. The stronger
 * "Unverified estimate" waits for per-level validation (spec phase 4).
 *
 * The label is text, never colour alone, and isn't interactive. It prints with
 * the page.
 */
import { Box, Chip, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

export const ESTIMATE_LABEL = "Estimate";
export const ESTIMATE_NOTE = "Estimated from the games in these rankings; not checked against the league's published results.";

const extra = (sx: SxProps<Theme> | undefined) => (sx === undefined ? [] : Array.isArray(sx) ? sx : [sx]);

/** A small outlined "Estimate" chip, inline beside a rating, rank or level. */
export function EstimateLabel({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Chip
            component="span"
            size="small"
            variant="outlined"
            label={ESTIMATE_LABEL}
            sx={[
                {
                    height: 20,
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "text.secondary",
                    borderColor: "divider",
                    verticalAlign: "middle",
                    "& .MuiChip-label": { px: 0.75 },
                },
                ...extra(sx),
            ]}
        />
    );
}

/** The label with the one-line note: once per screen that shows ratings. */
export function EstimateNote({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Box role="note" sx={[{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1, rowGap: 0.5 }, ...extra(sx)]}>
            <EstimateLabel />
            <Typography variant="body2" color="text.secondary">
                {ESTIMATE_NOTE}
            </Typography>
        </Box>
    );
}
