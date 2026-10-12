"use client";

/**
 * The "Team colors" display option: diagrams draw the team's markers in its
 * colors (lib/utils/team-palette.ts). Display only: the stored drills never
 * change. Shown only when the team has a color a marker can wear.
 */
import { FormControlLabel, Switch } from "@mui/material";

export const TEAM_COLORS_LABEL = "Team colors";

export function TeamColorsToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
    return (
        <FormControlLabel
            control={<Switch size="small" checked={checked} onChange={(event) => onChange(event.target.checked)} />}
            label={TEAM_COLORS_LABEL}
            slotProps={{ typography: { variant: "body2" } }}
            sx={{ m: 0, minHeight: 44, gap: 0.5 }}
        />
    );
}
