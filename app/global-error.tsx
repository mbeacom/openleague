"use client";

// Replaces the root layout when it (or the theme providers) crash, so it must
// render its own <html>/<body> and stay free of MUI/Emotion dependencies.
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F7F9FC",
          color: "#10203A",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: 480, padding: "32px 24px", textAlign: "center" }}>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#1976D2",
            }}
          >
            OpenLeague
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, lineHeight: 1.2 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.6, color: "#3A4A63" }}>
            We hit an unexpected error and couldn&apos;t load the app. Try again, and if the
            problem persists, come back in a few minutes.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "10px 28px",
              fontSize: 15,
              fontWeight: 600,
              color: "#FFFFFF",
              background: "#1976D2",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
