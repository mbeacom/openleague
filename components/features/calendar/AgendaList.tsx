"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Box, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import type { CalendarItem } from "@/types/events";
import {
  calendarItemKey,
  calendarSourceLabel,
  formatItemTimeRange,
  itemScopeName,
} from "./calendar-view-utils";

interface AgendaListProps {
  /** Ordered [dayKey, items] entries for the visible range. */
  days: ReadonlyArray<readonly [string, CalendarItem[]]>;
  colorForItem: (item: CalendarItem) => string;
  /** Day (YYYY-MM-DD) to scroll into view, from the `day` searchParam. */
  focusDay: string | null;
}

/** Interpret a YYYY-MM-DD key as a viewer-local calendar day for labeling. */
function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function AgendaList({ days, colorForItem, focusDay }: AgendaListProps) {
  useEffect(() => {
    if (!focusDay) return;
    document
      .getElementById(`agenda-day-${focusDay}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusDay]);

  return (
    <Stack spacing={2}>
      {days.map(([dayKey, items]) => (
        <Box key={dayKey} id={`agenda-day-${dayKey}`} sx={{ scrollMarginTop: 80 }}>
          <Typography
            variant="subtitle2"
            component="h3"
            sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider", pb: 0.5, mb: 1 }}
          >
            {format(parseDayKey(dayKey), "EEEE, MMMM d")}
          </Typography>
          <Stack spacing={0.5}>
            {items.map((item) => {
              const color = colorForItem(item);
              const scopeName = itemScopeName(item);
              return (
                <Box
                  key={calendarItemKey(item)}
                  component={Link}
                  href={item.href}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 1,
                    borderRadius: 1,
                    minHeight: 44,
                    color: "inherit",
                    textDecoration: "none",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flexShrink: 0 }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary", flexShrink: 0, minWidth: { xs: 64, sm: 76 } }}
                  >
                    {formatItemTimeRange(item)}
                  </Typography>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div" noWrap>
                      {[calendarSourceLabel(item), scopeName].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
