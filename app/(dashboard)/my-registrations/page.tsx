import Link from "next/link";
import { Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMyRegistrations } from "@/lib/actions/session-registrations";
import { getMyEventRegistrations } from "@/lib/actions/event-registrations";
import { CancelRegistrationButton } from "@/components/features/venue-admin";
import { CancelEventRegistrationButton } from "@/components/features/signup-events/CancelEventRegistrationButton";
import { WaitlistOfferActions } from "@/components/features/signup-events/WaitlistOfferActions";
import { formatCurrencyFromCents } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";

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

const EVENT_STATUS_COLORS: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  CONFIRMED: "success",
  PENDING_PAYMENT: "warning",
  WAITLISTED: "info",
  OFFERED: "info",
  CANCELED: "default",
  REFUNDED: "default",
  EXPIRED: "error",
};

const ACTIVE_EVENT_STATUSES = ["CONFIRMED", "PENDING_PAYMENT", "WAITLISTED", "OFFERED"];

export default async function MyRegistrationsPage() {
  const [registrations, eventRegistrations] = await Promise.all([
    getMyRegistrations(),
    getMyEventRegistrations(),
  ]);

  return (
    <PageContainer maxWidth="md">
      <PageHeader title="My registrations" />
      <Stack spacing={3}>
        <Typography variant="h5" component="h2">
          Rink sessions &amp; lessons
        </Typography>
        {registrations.length === 0 ? (
          <EmptyState
            icon={<ReceiptLongIcon />}
            title="No session registrations yet"
            description="Browse a rink's schedule to register for public sessions and lessons."
            action={
              <LinkButton href="/rinks" variant="outlined">
                Browse rinks
              </LinkButton>
            }
          />
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

        <Typography variant="h5" component="h2" sx={{ pt: 2 }}>
          Event signups
        </Typography>
        {eventRegistrations.length === 0 ? (
          <EmptyState
            icon={<EventAvailableIcon />}
            title="No event signups yet"
            description="Browse upcoming events to join one."
            action={
              <LinkButton href="/signups" variant="outlined">
                Browse upcoming events
              </LinkButton>
            }
          />
        ) : (
          <Stack spacing={2}>
            {eventRegistrations.map((reg) => {
              const hostName =
                reg.event.hostOrganization?.name ??
                reg.event.hostLeague?.name ??
                reg.event.hostTeam?.name ??
                "";
              // Mirror the server's cancellation rule so the button never
              // renders as a dead end after the cutoff passes.
              const cancelCutoff = reg.event.cancellationCutoffAt ?? reg.event.startAt;
              const cancelable =
                ACTIVE_EVENT_STATUSES.includes(reg.status) &&
                reg.payment?.status !== "PAID" &&
                new Date() <= cancelCutoff;
              return (
                <Card key={reg.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={700}>
                          <Link href={`/signups/${reg.event.id}`}>{reg.event.title}</Link>
                        </Typography>
                        <Chip
                          size="small"
                          color={EVENT_STATUS_COLORS[reg.status] ?? "default"}
                          label={
                            reg.status === "WAITLISTED" && reg.waitlistPosition
                              ? `WAITLISTED · #${reg.waitlistPosition}`
                              : reg.status.replace("_", " ")
                          }
                        />
                        <Chip size="small" variant="outlined" label={reg.slot.name} />
                        {reg.unitAmount > 0 ? (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${formatCurrencyFromCents(reg.unitAmount, reg.currency)}${
                              reg.manualPaymentStatus === "UNPAID" ? " · unpaid" : ""
                            }`}
                          />
                        ) : (
                          <Chip size="small" variant="outlined" label="Free" />
                        )}
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        {reg.participantName} · {formatDateTime(reg.event.startAt, reg.event.timezone)} ·{" "}
                        {reg.event.venue?.name ?? reg.event.locationText ?? "Location TBD"}
                        {hostName ? ` · ${hostName}` : ""}
                      </Typography>

                      {reg.payment?.receiptUrl ? (
                        <Typography variant="body2">
                          <Link href={reg.payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                            View receipt
                          </Link>
                        </Typography>
                      ) : null}

                      {reg.status === "OFFERED" && reg.offerExpiresAt ? (
                        <>
                          <Divider />
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ sm: "center" }}
                            justifyContent="space-between"
                          >
                            <Typography variant="body2" color="warning.main">
                              A spot opened up! Claim it by {formatDateTime(reg.offerExpiresAt)}.
                            </Typography>
                            <WaitlistOfferActions
                              registrationId={reg.id}
                              participantName={reg.participantName}
                            />
                          </Stack>
                        </>
                      ) : cancelable ? (
                        <>
                          <Divider />
                          <Stack direction="row" justifyContent="flex-end">
                            <CancelEventRegistrationButton
                              registrationId={reg.id}
                              participantName={reg.participantName}
                            />
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
    </PageContainer>
  );
}
