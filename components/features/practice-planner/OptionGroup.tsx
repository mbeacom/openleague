"use client";

import React from "react";
import { ToggleButtonGroup, ToggleButton } from "@mui/material";

/** Option buttons keep a 44px minimum touch target. */
export const OPTION_SX = { minWidth: 44, minHeight: 44, px: 1.25, fontWeight: 800 } as const;

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
                <ToggleButton key={option} value={option} aria-label={labels[option]} sx={OPTION_SX}>
                    {labels[option]}
                </ToggleButton>
            ))}
        </ToggleButtonGroup>
    );
}
