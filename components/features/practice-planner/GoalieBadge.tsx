"use client";

import { Box, type SxProps, type Theme } from "@mui/material";

/**
 * "G" on a drill card: this drill needs a goalie in net (goaltender-aware
 * drills). The board's goalie marker style: a solid ink disc, a circle as in
 * the logo's orbit motif, with the meaning in its accessible name.
 */
export function GoalieBadge({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Box
            role="img"
            aria-label="Needs a goalie"
            title="Needs a goalie"
            sx={[
                {
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    bgcolor: "grey.900",
                    color: "common.white",
                    border: 2,
                    borderColor: "common.white",
                    boxShadow: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: 1,
                    flexShrink: 0,
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            G
        </Box>
    );
}
