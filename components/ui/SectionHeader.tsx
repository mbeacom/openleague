import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

export interface SectionHeaderProps {
  title: string;
  /** Right-aligned link or button for the section. */
  action?: ReactNode;
  /** Count or status shown beside the title, set in mono like a scoreboard. */
  badge?: string | number;
  /** Heading level. Sections inside a page default to h2. */
  component?: "h2" | "h3";
}

/**
 * The divider-ruled heading every dashboard section shares.
 *
 * The widgets each grew their own `variant="h5"` heading, which left the
 * dashboard reading as a pile of unrelated panels at slightly different
 * weights. One ruled header at a consistent size turns the stack into a single
 * document — and the rule is what makes the sections feel like rows on a sheet
 * rather than floating cards.
 *
 * Server-safe.
 */
export function SectionHeader({
  title,
  action,
  badge,
  component = "h2",
}: SectionHeaderProps) {
  return (
    <Stack
      direction="row"
      alignItems="baseline"
      justifyContent="space-between"
      spacing={2}
      sx={{
        mb: 2,
        pb: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack direction="row" alignItems="baseline" spacing={1.25} sx={{ minWidth: 0 }}>
        <Typography
          variant="h6"
          component={component}
          sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}
        >
          {title}
        </Typography>
        {badge != null ? (
          <Box
            component="span"
            sx={{
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontVariantNumeric: "tabular-nums",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            {badge}
          </Box>
        ) : null}
      </Stack>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Stack>
  );
}
