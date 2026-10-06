"use client";

/**
 * ElementInspector: edit the selected board element's meaning (action, end,
 * role, label, kind, rotation, text) and color. Edits are emitted as patches;
 * the parent applies them through RinkBoardHandle.updateElement so they are
 * undoable.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Paper, Stack, TextField, Typography, ButtonBase } from "@mui/material";
import { OptionGroup } from "./OptionGroup";
import type { ElementPatch, SelectedElement } from "@/lib/utils/canvas/element-ops";
import { EQUIPMENT_KINDS, PLAYER_ROLES, STROKE_ACTIONS, STROKE_ENDS, VALIDATION_CONSTRAINTS, type DrawingElement } from "@/types/practice-planner";
import { ACTION_LABELS, END_LABELS, EQUIPMENT_LABELS, ROLE_LABELS } from "@/lib/utils/canvas/notation";
import { straighten } from "@/lib/utils/canvas/line-editing";

const SWATCHES = ["#212121", "#0D47A1", "#1976D2", "#D32F2F", "#2E7D32", "#F57C00", "#6A1B9A"];
const NET_ROTATIONS = ["0", "90", "180", "270"] as const;
const NET_ROTATION_LABELS: Record<(typeof NET_ROTATIONS)[number], string> = {
    "0": "Faces left",
    "90": "Faces up",
    "180": "Faces right",
    "270": "Faces down",
};
const KIND_TITLES = { drawing: "Movement", player: "Player", equipment: "Equipment", annotation: "Text" } as const;

function CommitField({ label, value, maxLength, allowEmpty, onCommit }: {
    label: string; value: string; maxLength: number; allowEmpty: boolean; onCommit: (v: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    // Resync the draft when the element's value changes (undo, another selection).
    const [seen, setSeen] = useState(value);
    if (seen !== value) {
        setSeen(value);
        setDraft(value);
    }
    // Enter then blur would otherwise commit the same draft twice before the
    // parent re-renders with the new value; any typing clears this.
    const committed = useRef<{ draft: string; value: string } | null>(null);
    const isPending = (d: string, v: string) =>
        d !== v && !(committed.current?.draft === d && committed.current.value === v);
    const commit = () => {
        if (!isPending(draft, value)) return;
        if (!allowEmpty && draft.trim() === "") { setDraft(value); return; }
        committed.current = { draft, value };
        onCommit(draft);
    };
    // The inspector is keyed by element, so a selection change unmounts this
    // field. A draft still pending then (no blur happened) commits through the
    // onCommit of the element it was typed for, never the next selection.
    const latest = useRef({ draft, value, allowEmpty, onCommit, isPending });
    useLayoutEffect(() => {
        latest.current = { draft, value, allowEmpty, onCommit, isPending };
    });
    useEffect(() => () => {
        const l = latest.current;
        if (!l.isPending(l.draft, l.value)) return;
        if (!l.allowEmpty && l.draft.trim() === "") return;
        l.onCommit(l.draft);
    }, []);
    return (
        <TextField
            label={label}
            size="small"
            value={draft}
            inputProps={{ maxLength }}
            onChange={(e) => { committed.current = null; setDraft(e.target.value); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        />
    );
}

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
        <Stack direction="row" spacing={0.5} role="group" aria-label="element color" sx={{ flexWrap: "wrap" }}>
            {SWATCHES.map((c) => (
                <ButtonBase
                    key={c}
                    aria-label={`color ${c}`}
                    aria-pressed={value.toUpperCase() === c}
                    onClick={() => onChange(c)}
                    sx={{
                        width: 44, height: 44, borderRadius: "50%", bgcolor: c,
                        // Tokens, so the selection ring reads on either scheme's
                        // paper (the old gold ring was ~1.4:1 on white).
                        outline: value.toUpperCase() === c ? "3px solid" : "1px solid",
                        outlineColor: value.toUpperCase() === c ? "text.primary" : "text.secondary",
                        outlineOffset: 2,
                    }}
                />
            ))}
        </Stack>
    );
}

/**
 * Straighten turns a curve, or a straight polyline, into a 2-point straight
 * line; Make straight does the same for a freehand line. Both keep the first
 * and last points and are one undoable update (line editing R3). Nothing to
 * offer for a 2-point straight line.
 */
function StraightenButton({ stroke, onChange }: { stroke: DrawingElement; onChange: (patch: ElementPatch) => void }) {
    const label = stroke.path === "freehand"
        ? "Make straight"
        : stroke.path === "curve" || stroke.points.length > 2 ? "Straighten" : null;
    if (!label) return null;
    return (
        <Button
            variant="outlined"
            sx={{ minHeight: 44, minWidth: 44 }}
            onClick={() => {
                const next = straighten(stroke);
                if (next !== stroke) onChange({ path: next.path, points: next.points });
            }}
        >
            {label}
        </Button>
    );
}

export interface ElementInspectorProps {
    selected: SelectedElement | null;
    onChange: (patch: ElementPatch) => void;
}

export function ElementInspector({ selected, onChange }: ElementInspectorProps) {
    if (!selected) return null;

    return (
        <Paper elevation={2} sx={{ p: 2 }} role="region" aria-label="selected element">
            <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 2 }}>
                {KIND_TITLES[selected.kind]}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mt: 1 }}>
                {selected.kind === "drawing" && (
                    <>
                        <OptionGroup label="stroke action" value={selected.element.action} options={STROKE_ACTIONS} labels={ACTION_LABELS} onChange={(action) => onChange({ action })} />
                        <OptionGroup label="stroke end" value={selected.element.end} options={STROKE_ENDS} labels={END_LABELS} onChange={(end) => onChange({ end })} />
                        <ColorRow value={selected.element.color} onChange={(color) => onChange({ color })} />
                        <StraightenButton stroke={selected.element} onChange={onChange} />
                    </>
                )}
                {selected.kind === "player" && (
                    <>
                        <OptionGroup label="player role" value={selected.element.role} options={PLAYER_ROLES} labels={ROLE_LABELS} onChange={(role) => onChange({ role })} />
                        <CommitField label="Label" value={selected.element.label} maxLength={VALIDATION_CONSTRAINTS.MAX_PLAYER_LABEL_LENGTH} allowEmpty onCommit={(label) => onChange({ label })} />
                        <ColorRow value={selected.element.color} onChange={(color) => onChange({ color })} />
                    </>
                )}
                {selected.kind === "equipment" && (
                    <>
                        <OptionGroup label="equipment kind" value={selected.element.kind} options={EQUIPMENT_KINDS} labels={EQUIPMENT_LABELS} onChange={(kind) => onChange({ kind })} />
                        {selected.element.kind === "net" && (
                            <OptionGroup
                                label="net rotation"
                                value={String(selected.element.rotation) as (typeof NET_ROTATIONS)[number]}
                                options={NET_ROTATIONS}
                                labels={NET_ROTATION_LABELS}
                                onChange={(r) => onChange({ rotation: Number(r) })}
                            />
                        )}
                    </>
                )}
                {selected.kind === "annotation" && (
                    <>
                        <CommitField label="Text" value={selected.element.text} maxLength={VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH} allowEmpty={false} onCommit={(text) => onChange({ text })} />
                        <ColorRow value={selected.element.color} onChange={(color) => onChange({ color })} />
                    </>
                )}
            </Box>
        </Paper>
    );
}
