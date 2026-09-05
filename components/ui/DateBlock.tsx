import { Box } from "@mui/material";

export interface DateBlockProps {
  value: Date | string;
  /** IANA zone the event is scheduled in, so the block reads in local terms. */
  timezone?: string | null;
  /** Dims the block for events that have already happened. */
  muted?: boolean;
}

/**
 * A fixed-width calendar tile: weekday, day number, month.
 *
 * Every schedule row starts with one so a column of events aligns on the date
 * rather than on however long each title happens to be. Set in mono for the
 * same reason the scoreboard strip is — the figures are what the eye is
 * actually scanning for, and they should not reflow as values change.
 *
 * Server-safe.
 */
export function DateBlock({ value, timezone, muted = false }: DateBlockProps) {
  const date = typeof value === "string" ? new Date(value) : value;
  const zone = timezone ?? undefined;

  const parts = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone }).format(date);

  return (
    <Box
      sx={{
        flexShrink: 0,
        width: 52,
        textAlign: "center",
        py: 0.75,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.default",
        opacity: muted ? 0.7 : 1,
      }}
    >
      <Box
        component="p"
        sx={{
          fontSize: "0.5625rem",
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "text.secondary",
        }}
      >
        {parts({ weekday: "short" })}
      </Box>
      <Box
        component="p"
        sx={{
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: "1.375rem",
          fontWeight: 500,
          lineHeight: 1.15,
        }}
      >
        {parts({ day: "numeric" })}
      </Box>
      <Box
        component="p"
        sx={{
          fontSize: "0.5625rem",
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "text.secondary",
        }}
      >
        {parts({ month: "short" })}
      </Box>
    </Box>
  );
}
