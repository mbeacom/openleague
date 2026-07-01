import Link from "next/link";
import { Card, CardContent, Chip, Container, Divider, Stack, Typography } from "@mui/material";
import { getMyRegistrations } from "@/lib/actions/session-registrations";
import { CancelRegistrationButton } from "@/components/features/venue-admin";
import { formatCurrencyFromCents } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  CONFIRMED: "success",
  PENDING: "warning",
  WAITLISTED: "info",
  CANCELED: "default",
  REFUNDED: "default",
  EXPIRED: "error",
};

function canCancel(status: string, amountTotal: number): boolean {
  if (status === "PENDING") return true;
  if (status === "CONFIRMED" && amountTotal === 0) return true;
  return false;
}

export default async function MyRegistrationsPage() {
  const registrations = await getMyRegistrations();

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 4, md: 6 } }}>
        <Typography variant="h4" component="h1">
          My registrations
        </Typography>

        {registrations.length === 0 ? (
          <Typography color="text.secondary">
            You haven&apos;t registered for any sessions yet. Browse a rink&apos;s schedule to get started.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {registrations.map((reg) => {
              const offeringTitle = reg.scheduleBlock?.title ?? reg.lessonOffering?.title ?? "Session";
              return (
                <Card key={reg.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={700}>{offeringTitle}</Typography>
                        <Chip size="small" color={STATUS_COLORS[reg.status] ?? "default"} label={reg.status} />
                        {reg.amountTotal > 0 ? (
                          <Chip size="small" variant="outlined" label={formatCurrencyFromCents(reg.amountTotal, reg.currency)} />
                        ) : (
                          <Chip size="small" variant="outlined" label="Free" />
                        )}
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        {reg.venue.slug ? (
                          <Link href={`/rinks/${reg.venue.slug}`}>{reg.venue.name}</Link>
                        ) : (
                          reg.venue.name
                        )}
                        {reg.scheduleBlock ? ` · ${reg.scheduleBlock.startsAt.toLocaleString()}` : ""}
                        {reg.quantity > 1 ? ` · ${reg.quantity} spots` : ""}
                      </Typography>

                      {reg.payment?.receiptUrl ? (
                        <Typography variant="body2">
                          <Link href={reg.payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                            View receipt
                          </Link>
                        </Typography>
                      ) : null}

                      {canCancel(reg.status, reg.amountTotal) ? (
                        <>
                          <Divider />
                          <Stack direction="row" justifyContent="flex-end">
                            <CancelRegistrationButton registrationId={reg.id} />
                          </Stack>
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
