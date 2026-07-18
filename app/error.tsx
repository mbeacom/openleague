"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Alert, AlertTitle, Button, Container } from "@mui/material";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={reset} sx={{ alignSelf: "center" }}>
            Try again
          </Button>
        }
      >
        <AlertTitle>Something went wrong</AlertTitle>
        We hit an unexpected error while loading this page. Try again, and if the problem
        persists, refresh the page or come back later.
      </Alert>
    </Container>
  );
}
