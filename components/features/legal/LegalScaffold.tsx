import { Alert, Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

/**
 * Shared building blocks for the legal pages (privacy, terms, cookies).
 *
 * These pages are structural drafts: real section hierarchy and anchors, but
 * every substantive paragraph is an explicitly marked counsel placeholder.
 * Do NOT add invented legal language here or in the pages — only factual,
 * non-legal descriptions of what a section will cover.
 *
 * Server-component safe: no event handlers, no next/link passed as a prop.
 */

export function DraftNotice() {
  return (
    <Alert severity="warning" sx={{ mb: 4 }}>
      Draft — pending legal review. This page shows the planned structure of
      this document; the final text will be provided by counsel before public
      launch and does not constitute legal advice.
    </Alert>
  );
}

export function CounselPlaceholder({ note }: { note?: string }) {
  return (
    <Box
      sx={{
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 1,
        px: 2,
        py: 1.5,
        mt: 1,
        bgcolor: "action.hover",
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
        [{note ?? "Section content to be provided by counsel"}]
      </Typography>
    </Box>
  );
}

export function LegalSection({
  id,
  title,
  covers,
  children,
}: {
  id: string;
  title: string;
  /** One-line factual, non-legal description of what this section will cover. */
  covers?: string;
  children?: ReactNode;
}) {
  return (
    <Box id={id} component="section" sx={{ scrollMarginTop: 96 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {title}
      </Typography>
      {covers && (
        <Typography variant="body1" color="text.secondary">
          {covers}
        </Typography>
      )}
      {children ?? <CounselPlaceholder />}
    </Box>
  );
}

export function LegalToc({ items }: { items: Array<{ id: string; title: string }> }) {
  return (
    <Box
      component="nav"
      aria-label="Table of contents"
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        px: 2.5,
        py: 2,
        mb: 4,
      }}
    >
      <Typography variant="overline" color="text.secondary" component="p" sx={{ mb: 1 }}>
        Contents
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 3, "& li": { mb: 0.5 } }}>
        {items.map((item) => (
          <li key={item.id}>
            <Typography
              component="a"
              href={`#${item.id}`}
              variant="body2"
              sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
            >
              {item.title}
            </Typography>
          </li>
        ))}
      </Box>
    </Box>
  );
}
