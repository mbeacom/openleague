"use client";

/**
 * "Fetch it for me" confirm screen (ADR-0024). The static planner opens this
 * page with `#src=<league page URL>`; login carries the fragment over. One
 * card, one primary button: the server action fetches and parses the page,
 * then this page goes to the static planner's import with the result. The
 * league URL is dropped from the address bar as soon as it is read.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Box, Button, Card, CardActions, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import { CloudDownloadOutlined as FetchIcon } from "@mui/icons-material";
import { fetchLeagueSchedule } from "@/lib/actions/league-fetch";
import { takeIncomingLeagueSource } from "@/lib/plan-document/pending";

export const FETCH_BUTTON_LABEL = "Fetch schedule";
export const NO_SOURCE_MESSAGE =
  "There's no league page to fetch. Start from “Fetch it for me” in the planner's rankings.";
export const UNSUPPORTED_MESSAGE = "OpenLeague can't fetch pages from that site yet. Save the page and open it in the planner instead.";

type Source = { kind: "none" } | { kind: "unsupported"; host: string | null } | { kind: "ready"; url: string; host: string };

function toSource(raw: string | null, allowedHosts: readonly string[]): Source {
  if (!raw) return { kind: "none" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "unsupported", host: null };
  }
  // Normalized as the server's guard does: lower case, without a trailing dot.
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // A first check for a clear message; the server action re-checks everything.
  if (url.protocol !== "https:" || url.port !== "" || !allowedHosts.includes(host)) return { kind: "unsupported", host };
  return { kind: "ready", url: url.toString(), host };
}

export interface LeagueFetchViewProps {
  allowedHosts: readonly string[];
  plannerUrl: string;
  /** Replace: going back must not land on a spent confirm page. A seam for tests. */
  navigate?: (url: string) => void;
}

const replaceLocation = (url: string) => window.location.replace(url);

export function LeagueFetchView({ allowedHosts, plannerUrl, navigate = replaceLocation }: LeagueFetchViewProps) {
  // undefined = not looked yet. takeIncomingLeagueSource consumes the hash and
  // the stash, so StrictMode's effect replay must reuse this value.
  const incoming = useRef<string | null | undefined>(undefined);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (incoming.current === undefined) incoming.current = takeIncomingLeagueSource();
    setSource(toSource(incoming.current, allowedHosts));
  }, [allowedHosts]);

  const fetchIt = (url: string) => {
    setError(null);
    startTransition(async () => {
      const result = await fetchLeagueSchedule({ url });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setLeaving(true);
      navigate(result.data.redirectUrl);
    });
  };

  const busy = pending || leaving;

  return (
    <Box sx={{ maxWidth: 560, mx: "auto", py: { xs: 2, sm: 4 } }}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        {source === null ? (
          <CardContent sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress aria-label="Loading" />
          </CardContent>
        ) : source.kind === "ready" ? (
          <>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Rankings · Fetch it for me
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 800, mt: 0.5, overflowWrap: "anywhere" }}>
                Fetch {source.host} schedule page?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                OpenLeague reads this one public page now and sends its games to your planner. Nothing is saved here, and
                nothing changes in your rankings until you review it and choose Save.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1.5, fontFamily: "monospace", overflowWrap: "anywhere" }}>
                {source.url}
              </Typography>
              {error ? (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              ) : null}
            </CardContent>
            <CardActions sx={{ px: 2, pb: 2, gap: 1, flexWrap: "wrap" }}>
              <Button
                variant="contained"
                size="large"
                startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <FetchIcon />}
                onClick={() => fetchIt(source.url)}
                disabled={busy}
                sx={{ minHeight: 44, flex: { xs: "1 1 100%", sm: "0 0 auto" } }}
              >
                {leaving ? "Opening the planner…" : pending ? "Fetching…" : FETCH_BUTTON_LABEL}
              </Button>
              <Button href={plannerUrl} disabled={busy} sx={{ minHeight: 44 }}>
                Back to the planner
              </Button>
            </CardActions>
          </>
        ) : (
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
                Fetch schedule
              </Typography>
              <Alert severity={source.kind === "none" ? "info" : "warning"}>
                {source.kind === "none" ? NO_SOURCE_MESSAGE : UNSUPPORTED_MESSAGE}
              </Alert>
              <Box>
                <Button href={plannerUrl} variant="outlined" sx={{ minHeight: 44 }}>
                  Open the planner
                </Button>
              </Box>
            </Stack>
          </CardContent>
        )}
      </Card>
    </Box>
  );
}
