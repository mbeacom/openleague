"use client";

import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import Link from "next/link";
import { format, isSameMonth, isToday } from "date-fns";
import type { CalendarItem } from "@/types/events";
import { calendarItemKey, formatItemStartTime } from "./calendar-view-utils";

/** Cells show at most this many entries; busier days collapse into "+N more". */
const MAX_PILLS = 3;

interface MonthGridProps {
  /** Full grid interval (week-aligned around the month), viewer-local days. */
  days: Date[];
  /** First of the focal month, for in/out-of-month styling. */
  monthDate: Date;
  /** Zone-correct day buckets keyed YYYY-MM-DD. */
  itemsByDay: ReadonlyMap<string, CalendarItem[]>;
  colorForItem: (item: CalendarItem) => string;
  /** Invoked by "+N more" with the day's key; switches to that day's agenda. */
  onShowDay: (dayKey: string) => void;
}

export default function MonthGrid({
  days,
  monthDate,
  itemsByDay,
  colorForItem,
  onShowDay,
}: MonthGridProps) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {days.slice(0, 7).map((day) => (
          <Typography
            key={day.getDay()}
            variant="caption"
            component="div"
            sx={{ py: 0.5, textAlign: "center", fontWeight: 600, color: "text.secondary" }}
          >
            {format(day, "EEE")}
          </Typography>
        ))}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayItems = itemsByDay.get(dayKey) ?? [];
          // When collapsing, keep one slot for the "+N more" row itself.
          const pills =
            dayItems.length > MAX_PILLS ? dayItems.slice(0, MAX_PILLS - 1) : dayItems;
          const overflow = dayItems.length - pills.length;
          const inMonth = isSameMonth(day, monthDate);
          const today = isToday(day);

          return (
            <Box
              key={dayKey}
              sx={{
                minHeight: 112,
                p: 0.5,
                borderTop: 1,
                borderColor: "divider",
                bgcolor: inMonth ? "transparent" : "action.hover",
                "&:not(:nth-of-type(7n + 1))": { borderLeft: 1, borderColor: "divider" },
              }}
            >
              <Typography
                variant="caption"
                component="div"
                sx={{
                  mb: 0.25,
                  fontWeight: today ? 700 : 500,
                  color: today
                    ? "primary.contrastText"
                    : inMonth
                      ? "text.secondary"
                      : "text.disabled",
                  ...(today && {
                    bgcolor: "primary.main",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }),
                }}
              >
                {format(day, "d")}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                {pills.map((item) => {
                  const color = colorForItem(item);
                  return (
                    <Box
                      key={calendarItemKey(item)}
                      component={Link}
                      href={item.href}
                      title={item.title}
                      sx={{
                        display: "block",
                        px: 0.5,
                        py: 0.125,
                        borderRadius: 0.5,
                        borderLeft: `3px solid ${color}`,
                        bgcolor: alpha(color, 0.12),
                        fontSize: "0.7rem",
                        lineHeight: 1.6,
                        color: "text.primary",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        "&:hover": { bgcolor: alpha(color, 0.24) },
                      }}
                    >
                      {formatItemStartTime(item)} {item.title}
                    </Box>
                  );
                })}
                {overflow > 0 && (
                  <ButtonBase
                    onClick={() => onShowDay(dayKey)}
                    sx={{
                      justifyContent: "flex-start",
                      px: 0.5,
                      py: 0.125,
                      borderRadius: 0.5,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: "primary.main",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    +{overflow} more
                  </ButtonBase>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
