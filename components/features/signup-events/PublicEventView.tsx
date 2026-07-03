import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import type { PublicSignupEventView } from "@/lib/actions/signup-events";
import { RegisterDialog } from "./RegisterDialog";
import { AGE_CLASSIFICATION_LABELS } from "@/lib/utils/age-level";
import { formatCurrencyFromCents } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";

interface PublicEventViewProps {
  view: PublicSignupEventView;
  isAuthenticated: boolean;
  loginRedirect: string;
  linkToken?: string;
}

function paymentNote(event: PublicSignupEventView["event"]): string | null {
  const methods = [
    event.venmoHandle ? `Venmo ${event.venmoHandle}` : null,
    event.cashAppHandle ? `Cash App ${event.cashAppHandle}` : null,
    event.zelleHandle ? `Zelle ${event.zelleHandle}` : null,
    event.paymentPhone ? `phone ${event.paymentPhone}` : null,
  ].filter(Boolean);
  const parts = [
    methods.length > 0 ? `Pay via ${methods.join(", ")}` : null,
    event.paymentInstructions,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(". ") : null;
}

export function PublicEventView({ view, isAuthenticated, loginRedirect, linkToken }: PublicEventViewProps) {
  const { event, availability, viewerPhase, onlinePaymentReady } = view;
  const hostName =
    event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "Organizer";
  const now = new Date();
  const hasPhases = event.phases.length > 0;
  // Global window: published and not past the close/start. Opening is governed
  // by phases when they exist, else by the event-level open time.
  const withinGlobalWindow =
    event.status === "PUBLISHED" &&
    now < event.startAt &&
    (!event.registrationClosesAt || now <= event.registrationClosesAt);
  const openForViewer =
    withinGlobalWindow &&
    (hasPhases
      ? viewerPhase.eligibleNow
      : !event.registrationOpensAt || now >= event.registrationOpensAt);
  // Outside the viewer's phase (or before the event-level open), the waitlist
  // is still joinable while the global window is open.
  const waitlistJoinable = withinGlobalWindow && !openForViewer && hasPhases;
  const note = paymentNote(event);

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="h4" component="h1">
            {event.title}
          </Typography>
          {event.status === "CANCELED" ? <Chip color="error" label="Canceled" /> : null}
        </Stack>
        <Typography color="text.secondary">
          Hosted by {hostName} · {AGE_CLASSIFICATION_LABELS[event.ageClassification]}
        </Typography>
        <Typography>
          {formatDateTime(event.startAt)} – {formatDateTime(event.endAt)}
        </Typography>
        <Typography color="text.secondary">
          {event.venue
            ? `${event.venue.name}${event.venue.city ? ` — ${event.venue.city}${event.venue.state ? `, ${event.venue.state}` : ""}` : ""}`
            : null}
          {event.venue && event.locationText ? " · " : null}
          {event.locationText}
        </Typography>
      </Stack>

      {event.status === "CANCELED" ? (
        <Alert severity="error">This event has been canceled by the organizer.</Alert>
      ) : null}
      {event.status === "PUBLISHED" && !hasPhases && event.registrationOpensAt && now < event.registrationOpensAt ? (
        <Alert severity="info">Registration opens {formatDateTime(event.registrationOpensAt)}.</Alert>
      ) : null}
      {event.status === "PUBLISHED" && event.registrationClosesAt && now > event.registrationClosesAt ? (
        <Alert severity="info">Registration is closed for this event.</Alert>
      ) : null}
      {waitlistJoinable ? (
        <Alert severity="info">
          Registration isn&apos;t open for you yet
          {viewerPhase.nextOpensAt ? ` — the next window opens ${formatDateTime(viewerPhase.nextOpensAt)}` : ""}.
          You can join the waitlist now and you&apos;ll be offered a spot automatically when one is available.
        </Alert>
      ) : null}

      {hasPhases ? (
        <Stack spacing={0.5}>
          <Typography variant="subtitle2">Registration phases</Typography>
          {event.phases.map((phase) => (
            <Typography key={phase.id} variant="body2" color="text.secondary">
              {phase.name} — opens {formatDateTime(phase.opensAt)}
            </Typography>
          ))}
        </Stack>
      ) : null}

      {event.description ? (
        <Typography sx={{ whiteSpace: "pre-line" }}>{event.description}</Typography>
      ) : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Signup slots</Typography>
            {event.slots.map((slot, index) => {
              const slotAvailability = availability[slot.id];
              const remaining = slotAvailability?.remaining ?? null;
              return (
                <Box key={slot.id}>
                  {index > 0 ? <Divider sx={{ mb: 2 }} /> : null}
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle1">{slot.name}</Typography>
                      {slot.description ? (
                        <Typography variant="body2" color="text.secondary">
                          {slot.description}
                        </Typography>
                      ) : null}
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {slot.capacity != null ? (
                          <Chip
                            size="small"
                            variant="outlined"
                            color={remaining === 0 ? "error" : "default"}
                            label={
                              remaining === 0
                                ? "Full"
                                : `${remaining ?? slot.capacity} of ${slot.capacity} spots left`
                            }
                          />
                        ) : (
                          <Chip size="small" variant="outlined" label="Unlimited spots" />
                        )}
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            (slot.priceAmount ?? 0) > 0
                              ? formatCurrencyFromCents(slot.priceAmount ?? 0, slot.priceCurrency)
                              : "Free"
                          }
                        />
                      </Stack>
                    </Stack>
                    {openForViewer || (waitlistJoinable && slot.waitlistEnabled) ? (
                      <RegisterDialog
                        eventId={event.id}
                        slotId={slot.id}
                        slotName={slot.name}
                        priceAmount={slot.priceAmount}
                        currency={slot.priceCurrency}
                        spotsRemaining={remaining}
                        isAuthenticated={isAuthenticated}
                        loginRedirect={loginRedirect}
                        linkToken={linkToken}
                        paymentNote={note}
                        waitlistMode={waitlistJoinable || (remaining === 0 && slot.waitlistEnabled)}
                        waitlistEnabled={slot.waitlistEnabled}
                        onlineAvailable={onlinePaymentReady}
                        manualAvailable={event.acceptsManualPayment}
                      />
                    ) : null}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      {(event.contactName || event.contactEmail || event.contactPhone) && (
        <Typography variant="body2" color="text.secondary">
          Questions? Contact {event.contactName ?? "the organizer"}
          {event.contactEmail ? ` · ${event.contactEmail}` : ""}
          {event.contactPhone ? ` · ${event.contactPhone}` : ""}
        </Typography>
      )}
    </Stack>
  );
}
