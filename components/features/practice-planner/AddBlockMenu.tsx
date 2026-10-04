"use client";

import { useId, useState } from "react";
import { Button, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { MoreTimeOutlined as AddBlockIcon } from "@mui/icons-material";
import { BLOCK_DEFAULTS, BLOCK_KINDS, type BlockKind } from "@/types/practice-planner";
import { BLOCK_ICONS } from "./BlockRowCard";

/** "Add block": a warm-up, water break, transition or cool-down, appended at the end (spec R8). */
export function AddBlockMenu({ onAdd, disabled = false }: { onAdd: (kind: BlockKind) => void; disabled?: boolean }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const menuId = useId();
    return (
        <>
            <Button
                variant="outlined"
                startIcon={<AddBlockIcon />}
                onClick={(event) => setAnchor(event.currentTarget)}
                disabled={disabled}
                aria-haspopup="menu"
                aria-controls={anchor ? menuId : undefined}
                aria-expanded={anchor ? "true" : undefined}
                sx={{ minHeight: 44 }}
            >
                Add block
            </Button>
            <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {BLOCK_KINDS.map((kind) => {
                    const Icon = BLOCK_ICONS[kind];
                    return (
                        <MenuItem
                            key={kind}
                            sx={{ minHeight: 44 }}
                            onClick={() => {
                                setAnchor(null);
                                onAdd(kind);
                            }}
                        >
                            <ListItemIcon>
                                <Icon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary={BLOCK_DEFAULTS[kind].label} secondary={`${BLOCK_DEFAULTS[kind].minutes} min`} />
                        </MenuItem>
                    );
                })}
            </Menu>
        </>
    );
}
