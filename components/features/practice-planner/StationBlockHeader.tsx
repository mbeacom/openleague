"use client";

import { useId, useState } from "react";
import { Alert, Box, Button, Collapse, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { GridOnOutlined as GridIcon } from "@mui/icons-material";
import { MAX_ROTATE_MINUTES } from "@/types/practice-planner";
import { MIN_ROTATING_STATIONS, rotationSummary, type RotationTable } from "@/lib/utils/session-timeline";
import { RotationGridTable } from "./RotationGridTable";

export const CANT_ROTATE_MESSAGE = "To rotate, at least 2 stations must rotate. Untick Stays on a station.";

export interface StationRotationControls {
    /** The block's interval, or null when Rotate is off */
    rotateEveryMinutes: number | null;
    /** Stations not marked Stays */
    rotatingCount: number;
    /** The grid when the block rotates, else null */
    table: RotationTable | null;
    onRotateChange: (on: boolean) => void;
    onMinutesChange: (minutes: number) => void;
    disabled: boolean;
}

/**
 * The header of a station block, "Stations · N · M min", with its warnings
 * (2b) and its rotation (practice timing, spec R8): a Rotate switch, "every M
 * min", the summary, and a collapsible rotation grid. It is a sibling of the
 * block's cards, not their parent: the list renders flat so a drill joining,
 * leaving or heading a block never remounts its card (which would drop
 * keyboard focus and inline-edit drafts). It is an h3 like a standalone card's
 * title; each grouped card is a role="group" named "Station k of N: <title>"
 * (its own h4), so the header is announced once rather than repeated on every
 * card. The summary is shown only while at least 2 stations rotate; with fewer
 * the "can't rotate" note explains why instead.
 */
export function StationBlockHeader({ id, label, warnings, rotation }: { id: string; label: string; warnings: string[]; rotation: StationRotationControls }) {
    const [showGrid, setShowGrid] = useState(false);
    const gridId = useId();
    const minutes = rotation.rotateEveryMinutes;
    const canRotate = rotation.rotatingCount >= MIN_ROTATING_STATIONS;
    return (
        <Box sx={{ borderLeft: 4, borderColor: "primary.main", pl: 1.5 }}>
            <Typography
                id={id}
                variant="subtitle2"
                component="h3"
                sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
            >
                {label}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={minutes !== null}
                            onChange={(event) => rotation.onRotateChange(event.target.checked)}
                            // Every block's switch is labelled "Rotate": the header names which block.
                            slotProps={{ input: { "aria-describedby": id } }}
                        />
                    }
                    label="Rotate"
                    disabled={rotation.disabled}
                    sx={{ minHeight: 44, ml: 0 }}
                />
                {minutes !== null && (
                    <TextField
                        select
                        size="small"
                        label="Every"
                        value={String(minutes)}
                        onChange={(event) => rotation.onMinutesChange(Number(event.target.value))}
                        disabled={rotation.disabled}
                        sx={{ minWidth: 120, "& .MuiInputBase-root": { minHeight: 44 }, "& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" } }}
                    >
                        {Array.from({ length: MAX_ROTATE_MINUTES }, (_, index) => index + 1).map((option) => (
                            <MenuItem key={option} value={String(option)} sx={{ minHeight: 44 }}>
                                {`${option} min`}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                {minutes !== null && canRotate && (
                    <Typography variant="body2" color="text.secondary">
                        {rotationSummary(rotation.rotatingCount, minutes)}
                    </Typography>
                )}
            </Stack>
            {minutes !== null && !canRotate && (
                <Alert severity="info" sx={{ mt: 1 }}>
                    {CANT_ROTATE_MESSAGE}
                </Alert>
            )}
            {rotation.table && (
                <>
                    <Button
                        size="small"
                        startIcon={<GridIcon />}
                        onClick={() => setShowGrid((shown) => !shown)}
                        aria-expanded={showGrid}
                        // The collapsed grid is unmounted: point at it only while it exists.
                        aria-controls={showGrid ? gridId : undefined}
                        sx={{ minHeight: 44 }}
                    >
                        {showGrid ? "Hide rotation grid" : "Show rotation grid"}
                    </Button>
                    <Collapse in={showGrid} id={gridId} unmountOnExit>
                        <RotationGridTable table={rotation.table} caption={`Rotation grid: ${label}`} />
                    </Collapse>
                </>
            )}
            {warnings.map((warning) => (
                <Alert key={warning} severity="warning" sx={{ mt: 1 }}>
                    {warning}
                </Alert>
            ))}
        </Box>
    );
}
