"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import DownloadIcon from "@mui/icons-material/Download";
import UpgradeIcon from "@mui/icons-material/Upgrade";
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange";
import {
  promoteWaitlistEntry,
  refundEventRegistration,
  removeEventRegistration,
  setEventCheckIn,
  setManualPaymentStatus,
} from "@/lib/actions/event-registrations";
import { formatCurrencyFromCents } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  CONFIRMED: "success",
  PENDING_PAYMENT: "warning",
  WAITLISTED: "info",
  OFFERED: "info",
  CANCELED: "default",
  REFUNDED: "default",
  EXPIRED: "error",
};

type RosterRegistration = {
  id: string;
  status: string;
  participantName: string;
  participantEmail: string | null;
  participantPhone: string | null;
  notes: string | null;
  unitAmount: number;
  currency: string;
  manualPaymentStatus: string;
  checkedInAt: Date | null;
  waitlistJoinedAt: Date | null;
  offerExpiresAt: Date | null;
  registrant: { id: string; name: string | null; email: string };
  player: { id: string; name: string; team: { name: string } | null } | null;
  payment: { status: string } | null;
};

type RosterSlot = {
  id: string;
  name: string;
  capacity: number | null;
  priceAmount: number | null;
  priceCurrency: string;
  registrations: RosterRegistration[];
  counts: { confirmed: number; pending: number; waitlisted: number; offered: number };
};

interface RosterTableProps {
  eventId: string;
  slots: RosterSlot[];
}

function paymentLabel(registration: RosterRegistration): string {
  if (registration.payment) return registration.payment.status;
  if (registration.unitAmount === 0) return "Free";
  return registration.manualPaymentStatus;
}

export function RosterTable({ eventId, slots }: RosterTableProps) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (slots.length === 0) {
    return <Typography color="text.secondary">No slots yet.</Typography>;
  }
  const activeSlot = slots[Math.min(tab, slots.length - 1)];

  const toggleCheckIn = (registration: RosterRegistration) => {
    startTransition(async () => {
      setError(null);
      const result = await setEventCheckIn({
        registrationId: registration.id,
        checkedIn: !registration.checkedInAt,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const remove = (registration: RosterRegistration) => {
    if (!window.confirm(`Remove ${registration.participantName} from this event?`)) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await removeEventRegistration({ registrationId: registration.id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const offerSpot = (registration: RosterRegistration) => {
    startTransition(async () => {
      setError(null);
      const result = await promoteWaitlistEntry({ registrationId: registration.id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const markPayment = (registration: RosterRegistration, status: "UNPAID" | "PAID" | "WAIVED") => {
    startTransition(async () => {
      setError(null);
      const result = await setManualPaymentStatus({ registrationId: registration.id, status });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const refund = (registration: RosterRegistration) => {
    if (
      !window.confirm(
        `Refund ${registration.participantName}'s payment of ${formatCurrencyFromCents(registration.unitAmount, registration.currency)}? The charge is reversed and the spot is offered to the waitlist.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await refundEventRegistration({ registrationId: registration.id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Tabs
          value={Math.min(tab, slots.length - 1)}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {slots.map((slot) => (
            <Tab
              key={slot.id}
              label={`${slot.name} (${slot.counts.confirmed}${slot.capacity != null ? `/${slot.capacity}` : ""})`}
            />
          ))}
        </Tabs>
        <Button
          component="a"
          href={`/api/signup-events/${eventId}/roster/export`}
          startIcon={<DownloadIcon />}
          size="small"
        >
          Export CSV
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" color="success" label={`${activeSlot.counts.confirmed} confirmed`} />
        {activeSlot.counts.pending > 0 ? (
          <Chip size="small" color="warning" label={`${activeSlot.counts.pending} pending payment`} />
        ) : null}
        {activeSlot.counts.waitlisted + activeSlot.counts.offered > 0 ? (
          <Chip
            size="small"
            color="info"
            label={`${activeSlot.counts.waitlisted + activeSlot.counts.offered} waitlisted`}
          />
        ) : null}
      </Stack>

      {activeSlot.registrations.length === 0 ? (
        <Typography color="text.secondary">No signups for this slot yet.</Typography>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Participant</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Registered by</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell align="center">Checked in</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activeSlot.registrations.map((registration) => {
                const active = ["CONFIRMED", "PENDING_PAYMENT", "WAITLISTED", "OFFERED"].includes(
                  registration.status
                );
                return (
                  <TableRow key={registration.id} sx={{ opacity: active ? 1 : 0.55 }}>
                    <TableCell>
                      <Typography variant="body2">{registration.participantName}</Typography>
                      {registration.player?.team ? (
                        <Typography variant="caption" color="text.secondary">
                          {registration.player.team.name}
                        </Typography>
                      ) : null}
                      {registration.notes ? (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {registration.notes}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={registration.status.replace("_", " ").toLowerCase()}
                        color={STATUS_COLORS[registration.status] ?? "default"}
                      />
                      {registration.status === "OFFERED" && registration.offerExpiresAt ? (
                        <Typography variant="caption" color="text.secondary" display="block">
                          claim by {formatDateTime(registration.offerExpiresAt)}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {registration.registrant.name ?? registration.registrant.email}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {registration.participantEmail ?? registration.registrant.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <Chip
                          size="small"
                          variant="outlined"
                          color={
                            registration.payment?.status === "PAID" || registration.manualPaymentStatus === "PAID"
                              ? "success"
                              : registration.unitAmount > 0 && registration.manualPaymentStatus === "UNPAID"
                                ? "warning"
                                : "default"
                          }
                          label={paymentLabel(registration).replace("_", " ").toLowerCase()}
                        />
                        {registration.unitAmount > 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrencyFromCents(registration.unitAmount, registration.currency)}
                          </Typography>
                        ) : null}
                        {registration.unitAmount > 0 &&
                        !registration.payment &&
                        registration.status === "CONFIRMED" ? (
                          <Stack direction="row" spacing={0.5}>
                            {registration.manualPaymentStatus !== "PAID" ? (
                              <Button size="small" disabled={isPending} onClick={() => markPayment(registration, "PAID")}>
                                Mark paid
                              </Button>
                            ) : (
                              <Button size="small" disabled={isPending} onClick={() => markPayment(registration, "UNPAID")}>
                                Mark unpaid
                              </Button>
                            )}
                            {registration.manualPaymentStatus !== "WAIVED" ? (
                              <Button size="small" disabled={isPending} onClick={() => markPayment(registration, "WAIVED")}>
                                Waive
                              </Button>
                            ) : null}
                          </Stack>
                        ) : null}
                        {registration.payment?.status === "PAID" ||
                        registration.payment?.status === "PARTIALLY_REFUNDED" ? (
                          <Button
                            size="small"
                            color="error"
                            startIcon={<CurrencyExchangeIcon fontSize="small" />}
                            disabled={isPending}
                            onClick={() => refund(registration)}
                          >
                            Refund
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={Boolean(registration.checkedInAt)}
                        disabled={isPending || registration.status !== "CONFIRMED"}
                        onChange={() => toggleCheckIn(registration)}
                        slotProps={{
                          input: { "aria-label": `Check in ${registration.participantName}` },
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {registration.status === "WAITLISTED" ? (
                        <Tooltip title="Offer this spot now (skips the queue)">
                          <IconButton
                            size="small"
                            disabled={isPending}
                            onClick={() => offerSpot(registration)}
                            aria-label={`Offer a spot to ${registration.participantName}`}
                          >
                            <UpgradeIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      {active ? (
                        <Tooltip title="Remove registration">
                          <IconButton
                            size="small"
                            disabled={isPending}
                            onClick={() => remove(registration)}
                            aria-label={`Remove ${registration.participantName}`}
                          >
                            <PersonRemoveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Box />
    </Stack>
  );
}
