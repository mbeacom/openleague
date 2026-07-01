import { Box, Card, CardContent, Chip, Container, Divider, Stack, Typography } from "@mui/material";
import { getVenueRegistrations } from "@/lib/actions/session-registrations";
import { RefundRegistrationButton } from "@/components/features/venue-admin";
import { formatCurrencyFromCents } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

interface VenueRegistrationsPageProps {
  params: Promise<{ organizationId: string; venueId: string }>;
}

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  CONFIRMED: "success",
  PENDING: "warning",
  WAITLISTED: "info",
  CANCELED: "default",
  REFUNDED: "default",
  EXPIRED: "error",
};

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

export default async function VenueRegistrationsPage({ params }: VenueRegistrationsPageProps) {
  const { organizationId, venueId } = await params;
  const { registrations, summary } = await getVenueRegistrations({ organizationId, venueId });

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Registrations
        </Typography>

        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
              <Metric label="Paid registrations" value={String(summary.paidCount)} />
              <Metric label="Gross" value={formatCurrencyFromCents(summary.grossCents)} />
              <Metric label="Refunded" value={formatCurrencyFromCents(summary.refundedCents)} />
              <Metric label="Net to rink" value={formatCurrencyFromCents(summary.netCents)} />
            </Stack>
          </CardContent>
        </Card>

        {registrations.length === 0 ? (
          <Typography color="text.secondary">No registrations yet.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {registrations.map((reg) => {
              const offeringTitle = reg.scheduleBlock?.title ?? reg.lessonOffering?.title ?? "Session";
              const isRefundable = reg.payment?.status === "PAID";
              return (
                <Card key={reg.id} variant="outlined">
                  <CardContent>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                    >
                      <Stack spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography fontWeight={700}>{reg.participantName}</Typography>
                          <Chip size="small" color={STATUS_COLORS[reg.status] ?? "default"} label={reg.status} />
                          {reg.amountTotal > 0 ? (
                            <Chip size="small" variant="outlined" label={formatCurrencyFromCents(reg.amountTotal, reg.currency)} />
                          ) : (
                            <Chip size="small" variant="outlined" label="Free" />
                          )}
                          {reg.quantity > 1 ? <Chip size="small" variant="outlined" label={`x${reg.quantity}`} /> : null}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {offeringTitle}
                          {reg.scheduleBlock ? ` · ${reg.scheduleBlock.startsAt.toLocaleString()}` : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {reg.participantEmail}
                          {reg.skillLevelNote ? ` · ${reg.skillLevelNote}` : ""}
                        </Typography>
                      </Stack>
                      {isRefundable ? (
                        <>
                          <Divider flexItem sx={{ display: { xs: "block", md: "none" } }} />
                          <RefundRegistrationButton
                            organizationId={organizationId}
                            venueId={venueId}
                            registrationId={reg.id}
                          />
                        </>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
