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
 * pulse a ripple on focus-visible, which is faint on the dark paper. The ring is
 * drawn inset so neighbours in a ToggleButtonGroup don't clip it, and uses a
 * palette token so it resolves per color scheme (#0D47A1 on light paper,
 * #64B5F6 on dark).
 */
export const FOCUS_RING_SX = {
    "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
} as const;

export const OPTION_SX = { ...TOUCH_TARGET_SX, ...FOCUS_RING_SX, px: 1.25, fontWeight: 800 } as const;

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
