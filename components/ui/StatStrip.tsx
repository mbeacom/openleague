import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";

export interface Stat {
  /** Micro-label. Written in sentence case; the strip sets it in small caps. */
  label: string;
  value: number | string;
}

export interface StatStripProps {
  stats: Stat[];
  /** "sm" for cards, "md" for page headers. */
  size?: "sm" | "md";
  sx?: SxProps<Theme>;
}

const SCALE = {
  sm: { value: "1.125rem", label: "0.5625rem", gap: 1.5, py: 1 },
  md: { value: "1.75rem", label: "0.625rem", gap: 2.5, py: 1.5 },
} as const;

/**
 * The scoreboard strip: counts as tabular mono numerals over hairline-ruled
 * cells with small-caps labels.
 *
 * This exists because "👥 12 players" as body copy makes a roster count read
 * like prose, and these numbers are the fastest thing on the page to scan.
 * Setting them in JetBrains Mono — already loaded for exactly this purpose and
 * until now unused — gives the figures their own voice and keeps columns from
 * shifting as values change.
 *
 * Server-safe.
 */
export function StatStrip({ stats, size = "sm", sx }: StatStripProps) {
  const scale = SCALE[size];

  return (
    <Box
      sx={{
        display: "grid",
        gridAutoFlow: "column",
        // A floor per cell rather than a plain 1fr: five stats on a 360px
        // phone would otherwise squeeze each column under 60px and clip the
        // labels. Below the floor the strip scrolls, which keeps it one row —
        // wrapping would put a cell's left rule at the start of a line, where
        // it reads as a stray mark rather than a separator.
        gridAutoColumns: "minmax(72px, 1fr)",
        overflowX: "auto",
        borderTop: "1px solid",
        borderColor: "divider",
        pt: scale.py,
        columnGap: scale.gap,
        ...sx,
      }}
    >
      {stats.map((stat, index) => (
        <Box
          key={stat.label}
          sx={{
            minWidth: 0,
            ...(index > 0 && {
              borderLeft: "1px solid",
              borderColor: "divider",
              pl: scale.gap,
            }),
          }}
        >
          <Box
            component="p"
            sx={{
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontVariantNumeric: "tabular-nums",
              fontSize: scale.value,
              fontWeight: 500,
              lineHeight: 1.1,
              color: "text.primary",
            }}
          >
            {stat.value}
          </Box>
          <Box
            component="p"
            sx={{
              mt: 0.5,
              fontSize: scale.label,
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "text.secondary",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {stat.label}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
