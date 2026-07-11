"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  CalendarViewMonth as CalendarViewMonthIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Event as EventIcon,
  ViewAgenda as ViewAgendaIcon,
} from "@mui/icons-material";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarItem, CalendarScopeOption } from "@/types/events";
import { EmptyState } from "@/components/ui/EmptyState";
import AgendaList from "./AgendaList";
import MonthGrid from "./MonthGrid";
import OverlayChips from "./OverlayChips";
import {
  calendarScopeKey,
  groupItemsByDay,
  hashString,
  itemColorScopeKey,
  itemScopeKeys,
} from "./calendar-view-utils";

type CalendarViewMode = "month" | "agenda";

export interface CalendarViewProps {
  /** Unified feed rows covering (at least) the displayed month, sorted by startAt. */
  items: CalendarItem[];
  /** Overlay chips: scopes in the feed and/or the viewer's memberships. */
  scopes: CalendarScopeOption[];
  /** Month shown by the grid, "YYYY-MM" (validated by the RSC page). */
  initialMonth: string;
  /**
   * League-locked mode (league schedule page): that league's chip is not
   * rendered and its layer can never be toggled off.
   */
  locked?: { leagueId: string };
}

/**
 * Unified calendar: month grid (md+) with a toggleable agenda view, agenda-only
 * on mobile. Month/view/filters live in URL searchParams so views are shareable;
 * month changes navigate (the RSC page refetches the windowed feed), while
 * view/filter/day changes update the URL shallowly and filter client-side.
 */
export default function CalendarView({ items, scopes, initialMonth, locked }: CalendarViewProps) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lockedKey = locked ? `league:${locked.leagueId}` : null;

  const view: CalendarViewMode = searchParams.get("view") === "agenda" ? "agenda" : "month";
  const focusDay = searchParams.get("day");
  const hiddenKeys = useMemo(() => {
    const hidden = new Set((searchParams.get("hide") ?? "").split(",").filter(Boolean));
    if (lockedKey) hidden.delete(lockedKey);
    return hidden;
  }, [searchParams, lockedKey]);

  const monthDate = useMemo(() => {
    const [year, month] = initialMonth.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [initialMonth]);

  const gridDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(monthDate)),
        end: endOfWeek(endOfMonth(monthDate)),
      }),
    [monthDate]
  );

  const chipScopes = useMemo(
    () => (lockedKey ? scopes.filter((scope) => calendarScopeKey(scope) !== lockedKey) : scopes),
    [scopes, lockedKey]
  );

  const palette = useMemo(
    () => [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.success.main,
      theme.palette.warning.main,
      theme.palette.info.main,
      theme.palette.error.main,
      theme.palette.primary.dark,
      theme.palette.success.dark,
    ],
    [theme]
  );
  const colorForKey = useCallback(
    (key: string) => palette[hashString(key) % palette.length],
    [palette]
  );
  const colorForItem = useCallback(
    (item: CalendarItem) => {
      const key = itemColorScopeKey(item);
      return key ? colorForKey(key) : theme.palette.grey[500];
    },
    [colorForKey, theme]
  );

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        // Overlay semantics: show while any of the item's layers is enabled.
        // The locked league layer is implicit, so it never keeps an item alone.
        const keys = itemScopeKeys(item).filter((key) => key !== lockedKey);
        return keys.length === 0 || keys.some((key) => !hiddenKeys.has(key));
      }),
    [items, hiddenKeys, lockedKey]
  );

  const itemsByDay = useMemo(() => groupItemsByDay(visibleItems), [visibleItems]);

  // Agenda covers the grid interval (incl. adjacent-month days shown in the
  // grid) but not the page's fetch buffer beyond it.
  const agendaDays = useMemo(() => {
    const first = format(gridDays[0], "yyyy-MM-dd");
    const last = format(gridDays[gridDays.length - 1], "yyyy-MM-dd");
    return [...itemsByDay.entries()]
      .filter(([key]) => key >= first && key <= last)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [itemsByDay, gridDays]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void, options?: { refetch?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (options?.refetch) {
        router.replace(url, { scroll: false });
      } else {
        // Shallow update: Next syncs useSearchParams without an RSC round-trip.
        window.history.replaceState(null, "", url);
      }
    },
    [searchParams, pathname, router]
  );

  const goToMonth = useCallback(
    (target: Date) =>
      replaceParams(
        (params) => {
          params.set("month", format(target, "yyyy-MM"));
          params.delete("day");
        },
        { refetch: true }
      ),
    [replaceParams]
  );

  const setView = useCallback(
    (next: CalendarViewMode) =>
      replaceParams((params) => {
        params.set("view", next);
        if (next === "month") params.delete("day");
      }),
    [replaceParams]
  );

  const toggleScope = useCallback(
    (key: string) =>
      replaceParams((params) => {
        const hidden = new Set((params.get("hide") ?? "").split(",").filter(Boolean));
        if (hidden.has(key)) hidden.delete(key);
        else hidden.add(key);
        if (hidden.size > 0) params.set("hide", [...hidden].join(","));
        else params.delete("hide");
      }),
    [replaceParams]
  );

  const showDayAgenda = useCallback(
    (dayKey: string) =>
      replaceParams((params) => {
        params.set("view", "agenda");
        params.set("day", dayKey);
      }),
    [replaceParams]
  );

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        sx={{ mb: 2 }}
      >
        <IconButton
          aria-label="Previous month"
          size="small"
          onClick={() => goToMonth(addMonths(monthDate, -1))}
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          aria-label="Next month"
          size="small"
          onClick={() => goToMonth(addMonths(monthDate, 1))}
        >
          <ChevronRightIcon />
        </IconButton>
        <Button size="small" variant="outlined" onClick={() => goToMonth(new Date())}>
          Today
        </Button>
        <Typography variant="h6" component="h2" sx={{ ml: 1 }}>
          {format(monthDate, "MMMM yyyy")}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, next: CalendarViewMode | null) => next && setView(next)}
          aria-label="Calendar view"
          sx={{ display: { xs: "none", md: "inline-flex" } }}
        >
          <ToggleButton value="month" aria-label="Month grid">
            <CalendarViewMonthIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="agenda" aria-label="Agenda list">
            <ViewAgendaIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {chipScopes.length > 0 && (
        <OverlayChips
          scopes={chipScopes}
          hiddenKeys={hiddenKeys}
          colorForKey={colorForKey}
          onToggle={toggleScope}
        />
      )}

      {/* Both views render; CSS picks one so SSR/hydration match at any width. */}
      <Box sx={{ display: { xs: "none", md: view === "month" ? "block" : "none" } }}>
        <MonthGrid
          days={gridDays}
          monthDate={monthDate}
          itemsByDay={itemsByDay}
          colorForItem={colorForItem}
          onShowDay={showDayAgenda}
        />
      </Box>
      <Box sx={{ display: { xs: "block", md: view === "agenda" ? "block" : "none" } }}>
        {agendaDays.length === 0 ? (
          <EmptyState
            icon={<EventIcon />}
            title="Nothing scheduled"
            description={
              hiddenKeys.size > 0
                ? "Everything this month is filtered out — re-enable a calendar above."
                : `No games, practices, signups, or venue bookings in ${format(monthDate, "MMMM yyyy")}.`
            }
          />
        ) : (
          <AgendaList days={agendaDays} colorForItem={colorForItem} focusDay={focusDay} />
        )}
      </Box>
    </Box>
  );
}
