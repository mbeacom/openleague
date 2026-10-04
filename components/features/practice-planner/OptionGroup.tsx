"use client";

import React from "react";
import { ToggleButtonGroup, ToggleButton, Tooltip } from "@mui/material";

/**
 * Option buttons keep a 44px minimum touch target. Each has an accessible name
 * and a tooltip. Wrapping in Tooltip is safe here: ToggleButtonGroup passes
 * value/onChange to its buttons through context, not by cloning children.
 */
export const TOUCH_TARGET_SX = { minWidth: 44, minHeight: 44 } as const;

/**
 * Keyboard focus ring for the editor chrome. MUI's ToggleButton/IconButton only
 * pulse a ripple on focus-visible, which is faint on the dark paper. The ring
 * sits OUTSIDE the button (raised above its group neighbours so they can't
 * cover it), so it is drawn against the container rather than against the
 * primary-filled selected state, where a primary ring would vanish. It uses a
 * palette token so it resolves per color scheme (#0D47A1 on light paper,
 * #64B5F6 on dark).
 */
export const FOCUS_RING_SX = {
    "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2, zIndex: 1 },
} as const;

/**
 * Selected state for tool and option toggles. MUI's default (an 8% / 16% tint)
 * sits at 1.2:1 (light) and 1.6:1 (dark) against an unselected button, too
 * faint to tell which tool is active. A primary fill with its contrast text
 * reads in both schemes: #0D47A1 vs white paper is 8.6:1, #64B5F6 vs the dark
 * paper 6.6:1, and the icon/label on the fill clears 4.5:1 in each.
 */
export const SELECTED_SX = {
    "&.Mui-selected": {
        bgcolor: "primary.main",
        color: "primary.contrastText",
        "&:hover": { bgcolor: "primary.dark" },
    },
} as const;

export const OPTION_SX = { ...TOUCH_TARGET_SX, ...FOCUS_RING_SX, ...SELECTED_SX, px: 1.25, fontWeight: 800 } as const;

export function OptionGroup<T extends string>({ label, value, options, labels, onChange }: {
    label: string;
    value: T;
    options: readonly T[];
    labels: Record<T, string>;
    onChange: (value: T) => void;
}) {
    return (
        <ToggleButtonGroup
            value={value}
            exclusive
            onChange={(_e, next: T | null) => next !== null && onChange(next)}
            aria-label={label}
            role="group"
            size="small"
            sx={{ flexWrap: "wrap" }}
        >
            {options.map((option) => (
                <Tooltip key={option} title={labels[option]}>
                    <ToggleButton value={option} aria-label={labels[option]} sx={OPTION_SX}>
                        {labels[option]}
                    </ToggleButton>
                </Tooltip>
            ))}
        </ToggleButtonGroup>
    );
}
