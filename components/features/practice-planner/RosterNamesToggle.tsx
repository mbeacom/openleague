"use client";

/**
 * The Export menu's "Include player names" (roster and suggestions spec R10):
 * a checkbox item that toggles without closing the menu. It applies to the
 * downloaded plan file and the HTML and Word bench sheets, never to a plan
 * link. Off every time the menu mounts; never remembered.
 */
import { Checkbox, ListItemIcon, ListItemText, MenuItem } from "@mui/material";

export const INCLUDE_NAMES_LABEL = "Include player names";
export const INCLUDE_NAMES_HELP = "Names and numbers go into downloaded files only. Plan links never include them.";

export function RosterNamesToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
    return (
        <MenuItem
            role="menuitemcheckbox"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            sx={{ minHeight: 44, alignItems: "flex-start", whiteSpace: "normal", maxWidth: 360 }}
        >
            <ListItemIcon sx={{ mt: -0.5 }}>
                <Checkbox edge="start" size="small" checked={checked} tabIndex={-1} disableRipple slotProps={{ input: { "aria-hidden": true } }} />
            </ListItemIcon>
            <ListItemText primary={INCLUDE_NAMES_LABEL} secondary={INCLUDE_NAMES_HELP} />
        </MenuItem>
    );
}
