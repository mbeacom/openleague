import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned action slot. From Server Components pass RSC-safe elements
   *  (e.g. LinkButton from components/ui/NextLinkComposites). */
  actions?: ReactNode;
  /** Rendered above the title row (e.g. a Breadcrumbs element). */
  breadcrumbs?: ReactNode;
}

/**
 * Standard dashboard page header: h4/h1 title, optional muted subtitle,
 * optional action buttons. Server-safe (no hooks, no client directive).
 */
export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs ? <Box sx={{ mb: 1 }}>{breadcrumbs}</Box> : null}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        spacing={2}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? (
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
