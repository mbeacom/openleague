"use client";

import { Chip, Stack } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CircleIcon from "@mui/icons-material/Circle";
import type { CalendarScopeOption } from "@/types/events";
import { calendarScopeKey } from "./calendar-view-utils";

interface OverlayChipsProps {
  scopes: CalendarScopeOption[];
  /** Scope keys (`kind:id`) currently toggled off. */
  hiddenKeys: ReadonlySet<string>;
  colorForKey: (key: string) => string;
  onToggle: (key: string) => void;
}

/**
 * One toggle chip per team/league/venue overlay in the feed. Active chips are
 * tinted with the scope's calendar color; toggling hides that layer client-side.
 */
export default function OverlayChips({
  scopes,
  hiddenKeys,
  colorForKey,
  onToggle,
}: OverlayChipsProps) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
      {scopes.map((scope) => {
        const key = calendarScopeKey(scope);
        const color = colorForKey(key);
        const active = !hiddenKeys.has(key);
        return (
          <Chip
            key={key}
            label={scope.name}
            size="small"
            onClick={() => onToggle(key)}
            icon={<CircleIcon sx={{ fontSize: 10 }} />}
            variant={active ? "filled" : "outlined"}
            aria-pressed={active}
            sx={{
              "& .MuiChip-icon": { color: active ? color : "text.disabled" },
              ...(active
                ? {
                    bgcolor: alpha(color, 0.15),
                    border: `1px solid ${alpha(color, 0.5)}`,
                    "&:hover": { bgcolor: alpha(color, 0.25) },
                  }
                : { color: "text.secondary" }),
            }}
          />
        );
      })}
    </Stack>
  );
}
