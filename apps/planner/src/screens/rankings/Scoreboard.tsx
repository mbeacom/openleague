/** Counts as tabular figures in ruled cells, like a scoreboard: Setup's header and a team's record. */
import { Box } from "@mui/material";

export function Scoreboard({ stats, columns = stats.length, width }: { stats: ReadonlyArray<{ label: string; value: number }>; columns?: number; width?: { xs?: string | number; md?: string | number } }) {
    return (
        <Box
            component="dl"
            sx={{
                m: 0,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                width: width ?? "100%",
                flexShrink: 0,
                // Each cell draws its top and left rule; the frame clips the outer ones.
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
                overflow: "hidden",
            }}
        >
            {stats.map((stat) => (
                <Box
                    key={stat.label}
                    sx={{ px: 1.25, py: 0.75, minWidth: 0, display: "flex", flexDirection: "column-reverse", boxShadow: "-1px -1px 0 var(--mui-palette-divider)" }}
                >
                    <Box component="dt" sx={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {stat.label}
                    </Box>
                    <Box component="dd" sx={{ fontFamily: "var(--font-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", m: 0, fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.2, color: "primary.main" }}>
                        {stat.value}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}
