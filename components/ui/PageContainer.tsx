import type { ReactNode } from "react";
import { Container, type ContainerProps } from "@mui/material";

export interface PageContainerProps {
  children: ReactNode;
  /** Override the dashboard-wide default width ("lg"). */
  maxWidth?: ContainerProps["maxWidth"];
  /** Remove the standard vertical padding (e.g. for full-bleed editors). */
  disablePadding?: boolean;
}

/**
 * Standard dashboard page container: Container maxWidth="lg" with py: 4 —
 * the dominant convention across existing dashboard pages. Server-safe.
 */
export function PageContainer({
  children,
  maxWidth = "lg",
  disablePadding = false,
}: PageContainerProps) {
  return (
    <Container maxWidth={maxWidth} sx={{ py: disablePadding ? 0 : 4 }}>
      {children}
    </Container>
  );
}
