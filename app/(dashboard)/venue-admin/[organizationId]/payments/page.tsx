import { notFound } from "next/navigation";
import { Box, Card, CardContent, Container, Stack, Typography } from "@mui/material";
import { getOrganizationPaymentsOverview } from "@/lib/actions/venue-payments";
import { StripeConnectCard } from "@/components/features/venue-admin";
import { formatCurrencyFromCents } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

interface VenuePaymentsPageProps {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6">{value}</Typography>
    </Box>
  );
}

export default async function VenuePaymentsPage({ params, searchParams }: VenuePaymentsPageProps) {
  const { organizationId } = await params;
  const { onboarding } = await searchParams;
  const result = await getOrganizationPaymentsOverview(organizationId);

  if (!result.success) {
    notFound();
  }

  const { status, revenue } = result.data;

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: 4 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Payments
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Accept payments for sessions and lessons through your connected Stripe account.
          </Typography>
        </Box>

        <StripeConnectCard
          organizationId={organizationId}
          status={status}
          autoRefresh={onboarding === "complete" || onboarding === "refresh"}
        />

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">
                Revenue
              </Typography>
              <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                <Metric label="Paid registrations" value={String(revenue.paidCount)} />
                <Metric label="Gross" value={formatCurrencyFromCents(revenue.grossCents, revenue.currency)} />
                <Metric label="Refunded" value={formatCurrencyFromCents(revenue.refundedCents, revenue.currency)} />
                <Metric label="Platform fees" value={formatCurrencyFromCents(revenue.platformFeeCents, revenue.currency)} />
                <Metric label="Net to rink" value={formatCurrencyFromCents(revenue.netCents, revenue.currency)} />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
