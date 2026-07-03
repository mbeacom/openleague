"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import type { ConnectStatus } from "@/lib/actions/venue-payments";
import {
  getLeagueStripeDashboardLink,
  refreshLeagueStripeStatus,
  startLeagueStripeOnboarding,
} from "@/lib/actions/league-payments";

interface LeagueStripeConnectCardProps {
  leagueId: string;
  status: ConnectStatus;
  autoRefresh?: boolean;
}

export function LeagueStripeConnectCard({ leagueId, status, autoRefresh = false }: LeagueStripeConnectCardProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!autoRefresh) return;
    let active = true;
    startTransition(async () => {
      const result = await refreshLeagueStripeStatus({ leagueId });
      if (active && result.success) setCurrent(result.data);
    });
    return () => {
      active = false;
    };
  }, [autoRefresh, leagueId]);

  const redirectTo = (url: string) => {
    window.location.href = url;
  };

  const handleOnboard = () => {
    startTransition(async () => {
      setError(null);
      const result = await startLeagueStripeOnboarding({ leagueId });
      if (result.success) {
        redirectTo(result.data.url);
      } else {
        setError(result.error);
      }
    });
  };

  const handleRefresh = () => {
    startTransition(async () => {
      setError(null);
      const result = await refreshLeagueStripeStatus({ leagueId });
      if (result.success) {
        setCurrent(result.data);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const handleDashboard = () => {
    startTransition(async () => {
      setError(null);
      const result = await getLeagueStripeDashboardLink({ leagueId });
      if (result.success) {
        redirectTo(result.data.url);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h6" component="h2">
              Online payments
            </Typography>
            {current.onboardingComplete ? (
              <Chip size="small" color="success" label="Active" />
            ) : current.accountId ? (
              <Chip size="small" color="warning" label="Setup incomplete" />
            ) : (
              <Chip size="small" label="Not connected" />
            )}
          </Stack>

          {!current.configured ? (
            <Alert severity="info">
              Online payments are not enabled on this deployment. Set STRIPE_SECRET_KEY to accept card payments.
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Connect your Stripe account so families can pay for signup events by card. Your
              association is the merchant of record and receives payouts from Stripe.
            </Typography>
          )}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {current.configured ? (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              {!current.onboardingComplete ? (
                <Button variant="contained" onClick={handleOnboard} disabled={isPending}>
                  {current.accountId ? "Continue Stripe onboarding" : "Set up online payments"}
                </Button>
              ) : (
                <Button variant="outlined" onClick={handleDashboard} disabled={isPending}>
                  Manage payouts
                </Button>
              )}
              {current.accountId ? (
                <Button variant="text" onClick={handleRefresh} disabled={isPending}>
                  Refresh status
                </Button>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
