import { Alert, Card, CardContent, Stack, Typography } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLeaguePaymentsOverview } from "@/lib/actions/league-payments";
import { LeagueStripeConnectCard } from "@/components/features/signup-events/LeagueStripeConnectCard";
import { formatCurrencyFromCents } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

export default async function LeaguePaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const [{ leagueId }, { onboarding }] = await Promise.all([params, searchParams]);
  const overview = await getLeaguePaymentsOverview(leagueId);

  return (
    <PageContainer maxWidth="md">
      <PageHeader title="Payments" />

      <Stack spacing={3}>
        {onboarding === "complete" ? (
          <Alert severity="success">Welcome back — checking your Stripe account status…</Alert>
        ) : null}
        {onboarding === "refresh" ? (
          <Alert severity="info">Stripe onboarding was interrupted — you can pick up where you left off.</Alert>
        ) : null}

        {!overview.success ? (
          <Alert severity="error">{overview.error}</Alert>
        ) : (
          <>
            <LeagueStripeConnectCard
              leagueId={leagueId}
              status={overview.data.status}
              autoRefresh={onboarding === "complete"}
            />

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="h6" component="h2">
                    Event revenue
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
                    <Stack>
                      <Typography variant="body2" color="text.secondary">
                        Payments
                      </Typography>
                      <Typography variant="h5">{overview.data.revenue.paidCount}</Typography>
                    </Stack>
                    <Stack>
                      <Typography variant="body2" color="text.secondary">
                        Gross
                      </Typography>
                      <Typography variant="h5">
                        {formatCurrencyFromCents(overview.data.revenue.grossCents, overview.data.revenue.currency)}
                      </Typography>
                    </Stack>
                    <Stack>
                      <Typography variant="body2" color="text.secondary">
                        Refunded
                      </Typography>
                      <Typography variant="h5">
                        {formatCurrencyFromCents(overview.data.revenue.refundedCents, overview.data.revenue.currency)}
                      </Typography>
                    </Stack>
                    <Stack>
                      <Typography variant="body2" color="text.secondary">
                        Net
                      </Typography>
                      <Typography variant="h5">
                        {formatCurrencyFromCents(overview.data.revenue.netCents, overview.data.revenue.currency)}
                      </Typography>
                    </Stack>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Online payments collected for your association&apos;s signup events. Manual payments
                    (Venmo/Zelle/Cash App/cash) are tracked on each event&apos;s roster.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
