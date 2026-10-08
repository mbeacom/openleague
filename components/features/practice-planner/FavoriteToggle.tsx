"use client";

/** The star on a drill or practice, and the "Favorites" filter chip (practice favorites spec R7). */
import type { MouseEvent } from "react";
import { Chip, IconButton, type SxProps, type Theme } from "@mui/material";
import { Star as StarIcon, StarBorder as StarBorderIcon } from "@mui/icons-material";

export interface FavoriteToggleProps {
    /** The drill's or practice's name, for the label. */
    name: string;
    active: boolean;
    onToggle: (next: boolean) => void;
    sx?: SxProps<Theme>;
}

/** A 44px toggle; aria-pressed carries the state, so the label stays fixed. Never selects or follows the card under it. */
export function FavoriteToggle({ name, active, onToggle, sx }: FavoriteToggleProps) {
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        event.preventDefault();
        onToggle(!active);
    };
    return (
        <IconButton
            aria-label={`Favorite ${name}`}
            aria-pressed={active}
            onClick={handleClick}
            onMouseDown={(event) => event.stopPropagation()}
            sx={[
                { width: 44, height: 44, flexShrink: 0, color: active ? "warning.main" : "text.secondary" },
                ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
            ]}
        >
            {active ? <StarIcon /> : <StarBorderIcon />}
        </IconButton>
    );
}

export interface FavoritesFilterChipProps {
    active: boolean;
    onChange: (next: boolean) => void;
}

/** "Favorites" on or off, styled like the drill filter chips. */
export function FavoritesFilterChip({ active, onChange }: FavoritesFilterChipProps) {
    return (
        <Chip
            icon={active ? <StarIcon /> : <StarBorderIcon />}
            label="Favorites"
            clickable
            color={active ? "primary" : "default"}
            variant={active ? "filled" : "outlined"}
            aria-pressed={active}
            onClick={() => onChange(!active)}
            // A 44px touch target on phones.
            sx={{ minHeight: { xs: 44, sm: 32 }, alignSelf: "flex-start" }}
        />
    );
}
