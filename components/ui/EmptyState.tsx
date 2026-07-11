import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

export interface EmptyStateProps {
  /** Usually an MUI SvgIcon element; sized and muted automatically. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Call-to-action slot (Button, or LinkButton from NextLinkComposites in RSC contexts). */
  action?: ReactNode;
}

/**
 * Centered, muted empty-state block. Server-safe.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        py: 6,
        px: 2,
      }}
    >
      {icon ? (
        <Box aria-hidden sx={{ mb: 2, color: "text.disabled", "& svg": { fontSize: 48 } }}>
          {icon}
        </Box>
      ) : null}
      <Typography variant="h6" component="p" gutterBottom>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
          {description}
        </Typography>
      ) : null}
      {action ? <Box sx={{ mt: 3 }}>{action}</Box> : null}
    </Box>
  );
}
