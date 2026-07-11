"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertTitle,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { GameProposalEntryKind, GameProposalStatus } from "@prisma/client";
import { DateTimeField } from "@/components/ui/date";
import {
  acceptGameProposal,
  counterGameProposal,
  declineGameProposal,
  withdrawGameProposal,
} from "@/lib/actions/game-proposals";
import {
  formatDateTimeInZone,
  isValidTimeZone,
  parseDateTimeLocalToUtc,
  resolveTimeZone,
} from "@/lib/utils/date";
import type { GameConflictView, GameProposalEntryView, GameProposalView } from "@/types/seasons";

const STATUS_CHIPS: Record<
  GameProposalStatus,
  { label: string; color: "default" | "success" | "warning" | "error" }
> = {
  PENDING: { label: "Pending", color: "warning" },
  ACCEPTED: { label: "Accepted", color: "success" },
  DECLINED: { label: "Declined", color: "error" },
  WITHDRAWN: { label: "Withdrawn", color: "default" },
  EXPIRED: { label: "Expired", color: "default" },
};

const KIND_CHIPS: Record<
  GameProposalEntryKind,
  { label: string; color: "default" | "primary" | "info" | "success" | "error" }
> = {
  PROPOSE: { label: "Proposed", color: "primary" },
  COUNTER: { label: "Countered", color: "info" },
  ACCEPT: { label: "Accepted", color: "success" },
  DECLINE: { label: "Declined", color: "error" },
  WITHDRAW: { label: "Withdrawn", color: "default" },
};

interface ProposalThreadProps {
  proposal: GameProposalView;
  /** Viewer administers the side whose turn it is — may accept/counter/decline. */
  canAct: boolean;
  /** Viewer administers either side and the proposal is still pending. */
  canWithdraw: boolean;
  venues: Array<{ id: string; name: string; timezone: string }>;
}

function extractConflicts(details: unknown): GameConflictView[] | null {
  if (details && typeof details === "object" && "conflicts" in details) {
    const conflicts = (details as { conflicts: unknown }).conflicts;
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      return conflicts as GameConflictView[];
    }
  }
  return null;
}

// Proposal entries carry no timezone — render in the viewer's local zone.
const formatTimestamp = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));

const formatEndTime = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
    new Date(date)
  );

const termsText = (entry: GameProposalEntryView) => {
  if (!entry.startAt) return null;
  const range = entry.endAt
    ? `${formatDateTimeInZone(entry.startAt, resolveTimeZone())} – ${formatEndTime(entry.endAt)}`
    : formatDateTimeInZone(entry.startAt, resolveTimeZone());
  return `${range} · ${entry.venue?.name ?? "Venue TBD"}`;
};

/**
 * One proposal's negotiation history (FR-020): each PROPOSE/COUNTER/ACCEPT/
 * DECLINE/WITHDRAW step in order, plus the actions available to the viewer.
 * Server errors (expiry, first-decision-wins races, auth) surface verbatim;
 * venue conflicts on accept come back as a warning with an explicit
 * "Accept anyway" override, mirroring GameForm.
 */
export function ProposalThread({ proposal, canAct, canWithdraw, venues }: ProposalThreadProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [acceptConflicts, setAcceptConflicts] = useState<GameConflictView[] | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterVenueId, setCounterVenueId] = useState("");
  const [confirm, setConfirm] = useState<"decline" | "withdraw" | null>(null);
  const [reason, setReason] = useState("");

  const teamName = (teamId: string) =>
    teamId === proposal.proposingTeam.id
      ? proposal.proposingTeam.name
      : proposal.receivingTeam.name;

  const status = proposal.isExpired ? "EXPIRED" : proposal.status;
  const actionable = status === "PENDING";

  const handleAccept = (overrideConflicts: boolean) => {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await acceptGameProposal({ proposalId: proposal.id, overrideConflicts });
      if (!result.success) {
        const conflicts = extractConflicts(result.details);
        if (conflicts) {
          // Venue conflict warning — "Accept anyway" resubmits with an
          // explicit override, mirroring GameForm's schedule-anyway flow.
          setAcceptConflicts(conflicts);
          return;
        }
        setAcceptConflicts(null);
        setError(result.error);
        return;
      }
      setAcceptConflicts(null);
      setSuccess("Game scheduled");
      router.refresh();
    });
  };

  const handleCounter = (formData: FormData) => {
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    const counterZone = isValidTimeZone(
      venues.find((venue) => venue.id === counterVenueId)?.timezone
    )
      ? venues.find((venue) => venue.id === counterVenueId)!.timezone
      : resolveTimeZone();
    const startAt = parseDateTimeLocalToUtc(text("startAt"), counterZone);
    const endAt = parseDateTimeLocalToUtc(text("endAt"), counterZone);
    if (!startAt || !endAt) {
      setError("Enter a valid proposed start and end time.");
      return;
    }
    if (endAt <= startAt) {
      setError("End time must be after the start time.");
      return;
    }
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await counterGameProposal({
        proposalId: proposal.id,
        startAt,
        endAt,
        venueId: counterVenueId || undefined,
        note: text("note") || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCounterOpen(false);
      setCounterVenueId("");
      router.refresh();
    });
  };

  const handleConfirmed = () => {
    if (!confirm) return;
    const kind = confirm;
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const input = { proposalId: proposal.id, reason: reason.trim() || undefined };
      const result =
        kind === "decline"
          ? await declineGameProposal(input)
          : await withdrawGameProposal(input);
      setConfirm(null);
      setReason("");
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip size="small" label={STATUS_CHIPS[status].label} color={STATUS_CHIPS[status].color} />
        <Typography variant="body2" color="text.secondary">
          {proposal.proposingTeam.name} → {proposal.receivingTeam.name}
        </Typography>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}
      {acceptConflicts ? (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={isPending}
              onClick={() => handleAccept(true)}
            >
              Accept anyway
            </Button>
          }
        >
          <AlertTitle>
            This time overlaps {acceptConflicts.length} existing booking
            {acceptConflicts.length === 1 ? "" : "s"} at the venue
          </AlertTitle>
          {acceptConflicts.map((conflict, index) => (
            <Typography key={`${conflict.title}-${index}`} variant="body2">
              {conflict.title} — {formatDateTimeInZone(conflict.startAt, resolveTimeZone())}
              {conflict.endAt ? ` – ${formatDateTimeInZone(conflict.endAt, resolveTimeZone())}` : ""}
            </Typography>
          ))}
        </Alert>
      ) : null}

      <Stack spacing={1.5} divider={<Divider flexItem />}>
        {proposal.entries.map((entry) => (
          <Stack key={entry.id} spacing={0.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                variant="outlined"
                label={KIND_CHIPS[entry.kind].label}
                color={KIND_CHIPS[entry.kind].color}
              />
              <Typography variant="body2">{teamName(entry.actorTeamId)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatTimestamp(entry.createdAt)}
              </Typography>
            </Stack>
            {termsText(entry) ? (
              <Typography variant="body2">{termsText(entry)}</Typography>
            ) : null}
            {entry.note ? (
              <Typography variant="body2" color="text.secondary">
                “{entry.note}”
              </Typography>
            ) : null}
          </Stack>
        ))}
      </Stack>

      {actionable && (canAct || canWithdraw) ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {canAct ? (
            <>
              <Button
                variant="contained"
                size="small"
                disabled={isPending}
                onClick={() => handleAccept(false)}
                sx={{ minHeight: 44 }}
              >
                Accept
              </Button>
              <Button
                size="small"
                disabled={isPending}
                onClick={() => setCounterOpen((open) => !open)}
                sx={{ minHeight: 44 }}
              >
                Counter
              </Button>
              <Button
                size="small"
                color="error"
                disabled={isPending}
                onClick={() => setConfirm("decline")}
                sx={{ minHeight: 44 }}
              >
                Decline
              </Button>
            </>
          ) : null}
          {canWithdraw ? (
            <Button
              size="small"
              color="error"
              disabled={isPending}
              onClick={() => setConfirm("withdraw")}
              sx={{ minHeight: 44 }}
            >
              Withdraw
            </Button>
          ) : null}
        </Stack>
      ) : null}

      {counterOpen && actionable && canAct ? (
        <Stack
          component="form"
          action={(formData: FormData) => handleCounter(formData)}
          spacing={2}
          sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <Typography variant="subtitle2">Counter-propose new terms</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <DateTimeField name="startAt" label="New start" required fullWidth />
            <DateTimeField name="endAt" label="New end" required fullWidth />
          </Stack>
          <TextField
            select
            label="Venue (optional)"
            fullWidth
            value={counterVenueId}
            onChange={(event) => setCounterVenueId(event.target.value)}
          >
            <MenuItem value="">To be determined</MenuItem>
            {venues.map((venue) => (
              <MenuItem key={venue.id} value={venue.id}>
                {venue.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            name="note"
            label="Note (optional)"
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              onClick={() => setCounterOpen(false)}
              disabled={isPending}
              sx={{ minHeight: 44 }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isPending} sx={{ minHeight: 44 }}>
              {isPending ? "Sending…" : "Send counter"}
            </Button>
          </Stack>
        </Stack>
      ) : null}

      {/* Decline / withdraw confirmation with optional reason */}
      <Dialog
        open={Boolean(confirm)}
        onClose={() => (isPending ? undefined : setConfirm(null))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {confirm === "decline" ? "Decline this proposal?" : "Withdraw this proposal?"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              {confirm === "decline"
                ? "The proposing team is notified and no game is created."
                : "The proposal is closed and the other team is notified."}
            </DialogContentText>
            <TextField
              label="Reason (optional)"
              multiline
              minRows={2}
              fullWidth
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={isPending} sx={{ minHeight: 44 }}>
            Keep proposal
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmed}
            disabled={isPending}
            sx={{ minHeight: 44 }}
          >
            {isPending ? "Working…" : confirm === "decline" ? "Decline" : "Withdraw"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
