"use client";

/**
 * Keyboard-accessible editor for a drill's custom ice area (phase 2a): four
 * numeric fields in rink feet, an alternative to dragging the area on the
 * board. A field commits on blur or Enter; the rectangle is kept inside the
 * rink (size first, then position), then snapped to 5 ft with a 20 ft minimum
 * by the same `rectFromDrag` the drag tool uses.
 *
 * Fields are derived from `rect`: the parent keys this component on the
 * stored rectangle, so an undo/redo resets any in-progress text.
 */
import React, { useState } from "react";
import { Stack, TextField } from "@mui/material";
import { rectFromDrag } from "@/lib/utils/canvas/element-ops";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { MIN_AREA_FT, type RinkRect } from "@/types/practice-planner";

type Field = keyof RinkRect;

const FIELDS: readonly { key: Field; label: string }[] = [
    { key: "x", label: "Area left (ft)" },
    { key: "y", label: "Area top (ft)" },
    { key: "w", label: "Area width (ft)" },
    { key: "h", label: "Area height (ft)" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The custom area typed values describe: inside the rink, snapped, at least the minimum size. */
export function rectFromFields(values: RinkRect): RinkRect {
    const w = clamp(values.w, MIN_AREA_FT, RINK_DIMENSIONS.width);
    const h = clamp(values.h, MIN_AREA_FT, RINK_DIMENSIONS.height);
    const x = clamp(values.x, 0, RINK_DIMENSIONS.width - w);
    const y = clamp(values.y, 0, RINK_DIMENSIONS.height - h);
    return rectFromDrag({ x, y }, { x: x + w, y: y + h });
}

const toText = (rect: RinkRect): Record<Field, string> => ({
    x: String(rect.x),
    y: String(rect.y),
    w: String(rect.w),
    h: String(rect.h),
});

export interface CustomAreaFieldsProps {
    rect: RinkRect;
    onCommit: (rect: RinkRect) => void;
}

export function CustomAreaFields({ rect, onCommit }: CustomAreaFieldsProps) {
    const [text, setText] = useState(() => toText(rect));

    const commit = () => {
        const values = { x: Number(text.x), y: Number(text.y), w: Number(text.w), h: Number(text.h) };
        const blank = (Object.keys(text) as Field[]).some((k) => text[k].trim() === "");
        if (blank || Object.values(values).some((v) => !Number.isFinite(v))) {
            setText(toText(rect));
            return;
        }
        const next = rectFromFields(values);
        // Show the corrected values even when the stored area is unchanged (no re-key)
        setText(toText(next));
        onCommit(next);
    };

    return (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {FIELDS.map(({ key, label }) => (
                <TextField
                    key={key}
                    id={`play-area-${key}`}
                    label={label}
                    type="number"
                    size="small"
                    value={text[key]}
                    onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commit();
                        }
                    }}
                    slotProps={{ htmlInput: { step: 5, min: 0, inputMode: "numeric" } }}
                    sx={{ width: 130, "& .MuiInputBase-root": { minHeight: 44 } }}
                />
            ))}
        </Stack>
    );
}
