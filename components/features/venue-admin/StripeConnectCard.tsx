"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import {
  getStripeDashboardLink,
  refreshStripeAccountStatus,
  startStripeOnboarding,
  type ConnectStatus,
} from "@/lib/actions/venue-payments";

interface StripeConnectCardProps {
  organizationId: string;
  status: ConnectStatus;
  autoRefresh?: boolean;
}

export function StripeConnectCard({ organizationId, status, autoRefresh = false }: StripeConnectCardProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!autoRefresh) return;
    startTransition(async () => {
      const result = await refreshStripeAccountStatus({ organizationId });
      if (result.success) setCurrent(result.data);
    });
  }, [autoRefresh, organizationId]);

  const redirectTo = (url: string) => {
    window.location.href = url;
  };

  const handleOnboard = () => {
    startTransition(async () => {
      setError(null);
      const result = await startStripeOnboarding({ organizationId });
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
      const result = await refreshStripeAccountStatus({ organizationId });
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
      const result = await getStripeDashboardLink({ organizationId });
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
              Connect your Stripe account so skaters can pay for sessions and lessons directly. Your rink is the
              merchant of record and receives payouts from Stripe.
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
