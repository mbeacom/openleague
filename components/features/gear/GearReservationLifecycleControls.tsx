"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import {
  approveAndAllocateGearReservation,
  cancelGearReservation,
  declineGearReservation,
  getGearReservationAllocationOptions,
  recordGearPickup,
  recordGearReturn,
  releaseGearAllocation,
} from "@/lib/actions/gear-reservations";
import type { GearReservationAllocationOption } from "@/lib/actions/gear-reservations";
import type { GearReservationContext } from "@/lib/actions/gear-context";

type Reservation = GearReservationContext["reservations"][number];

export function GearReservationLifecycleControls({
  leagueId,
  reservation,
}: {
  leagueId: string;
  reservation: Reservation;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [returnAllocationId, setReturnAllocationId] = useState<string | null>(null);
  const [lineId, setLineId] = useState(reservation.lines[0]?.id ?? "");
  const [resource, setResource] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [approvedStartDate, setApprovedStartDate] = useState(
    (reservation.approvedStartDate ?? reservation.requestedStartDate).slice(0, 10),
  );
  const [approvedEndDate, setApprovedEndDate] = useState(
    (reservation.approvedEndDate ?? reservation.requestedEndDate).slice(0, 10),
  );
  const [disposition, setDisposition] = useState<"GOOD" | "DAMAGED" | "LOST" | "CONSUMED">("GOOD");
  const [allocatable, setAllocatable] = useState<GearReservationAllocationOption[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const hasValidApprovalWindow = Boolean(
    lineId && approvedStartDate && approvedEndDate && approvedEndDate >= approvedStartDate,
  );

  useEffect(() => {
    if (!allocationOpen || !hasValidApprovalWindow) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoadingAvailability(true);
    });
    getGearReservationAllocationOptions({
      leagueId,
      reservationId: reservation.id,
      reservationLineId: lineId,
      approvedStartDate,
      approvedEndDate,
      expectedVersion: reservation.version,
    }).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setAllocatable(result.data);
      } else {
        setAllocatable([]);
        setError(result.error);
      }
    }).catch(() => {
      if (!cancelled) {
        setAllocatable([]);
        setError("Unable to refresh date-specific inventory availability.");
      }
    }).finally(() => {
      if (!cancelled) setLoadingAvailability(false);
    });
    return () => { cancelled = true; };
  }, [allocationOpen, approvedEndDate, approvedStartDate, hasValidApprovalWindow, leagueId, lineId, reservation.id, reservation.version]);

  const run = (operation: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      const result = await operation();
      if (!result.success) {
        setError(result.error ?? "Unable to update the reservation.");
        return;
      }
      setError(null);
      setAllocationOpen(false);
      setReturnAllocationId(null);
      router.refresh();
    });
  };

  const selectedReturn = reservation.allocations.find((allocation) => allocation.id === returnAllocationId);
  const pickupAllocations = reservation.allocations.filter((allocation) => allocation.capabilities.canRecordPickup);
  const releasableAllocations = reservation.allocations.filter((allocation) => allocation.capabilities.canRelease);
  const returnableAllocations = reservation.allocations.filter((allocation) => allocation.capabilities.canRecordReturn);
  const blockedPickups = reservation.allocations.filter((allocation) =>
    allocation.status === "ALLOCATED" && !allocation.capabilities.canRecordPickup && allocation.capabilities.canRelease,
  );
  const allocationLabel = (allocation: Reservation["allocations"][number]) =>
    allocation.assetTag ?? allocation.locationName ?? "pooled";

  return (
    <Stack spacing={1}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {blockedPickups.length > 0 && (
        <Alert severity="warning">
          {blockedPickups.length === 1 ? "An allocation is" : `${blockedPickups.length} allocations are`}
          {" "}past the approved return date and can no longer be checked out. Reschedule the reservation or release the gear.
        </Alert>
      )}
      {(reservation.capabilities.canApproveAndAllocate || reservation.capabilities.canDecline) && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {reservation.capabilities.canApproveAndAllocate && (
            <Button variant="contained" onClick={() => {
              setResource("");
              setAllocationOpen(true);
            }} disabled={pending} sx={{ minHeight: 44 }}>
              Review and allocate
            </Button>
          )}
          {reservation.capabilities.canDecline && (
            <Button color="error" variant="outlined" disabled={pending} onClick={() => run(() => declineGearReservation({
              leagueId, reservationId: reservation.id, expectedVersion: reservation.version,
            }))} sx={{ minHeight: 44 }}>
              Decline request
            </Button>
          )}
        </Stack>
      )}
      {(pickupAllocations.length > 0 || releasableAllocations.length > 0) && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap" useFlexGap>
          {pickupAllocations.map((allocation) => (
            <Button key={`pickup-${allocation.id}`} variant="outlined" disabled={pending} onClick={() => run(() => recordGearPickup({
              leagueId, allocationId: allocation.id, expectedVersion: allocation.version, quantity: allocation.allocatedQty,
            }))} sx={{ minHeight: 44 }}>
              Confirm pickup ({allocationLabel(allocation)})
            </Button>
          ))}
          {releasableAllocations.map((allocation) => (
            <Button key={`release-${allocation.id}`} color="inherit" disabled={pending} onClick={() => run(() => releaseGearAllocation({
              leagueId, allocationId: allocation.id, expectedVersion: allocation.version,
            }))} sx={{ minHeight: 44 }}>
              Release ({allocationLabel(allocation)})
            </Button>
          ))}
        </Stack>
      )}
      {returnableAllocations.length > 0 && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap" useFlexGap>
          {returnableAllocations.map((allocation) => (
            <Button key={allocation.id} variant="outlined" disabled={pending} onClick={() => {
              setQuantity(String(allocation.outstandingQty));
              setReturnAllocationId(allocation.id);
            }} sx={{ minHeight: 44 }}>
              Record return ({allocationLabel(allocation)})
            </Button>
          ))}
        </Stack>
      )}
      {reservation.capabilities.canCancel && (
        <Button color="inherit" variant="text" disabled={pending} onClick={() => run(() => cancelGearReservation({
          leagueId, reservationId: reservation.id, expectedVersion: reservation.version,
        }))} sx={{ alignSelf: "flex-start", minHeight: 44 }}>
          Cancel reservation
        </Button>
      )}

      <Dialog open={allocationOpen} onClose={() => !pending && setAllocationOpen(false)} fullWidth maxWidth="sm" aria-labelledby="gear-allocate-title">
        <DialogTitle id="gear-allocate-title">Review and allocate gear</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">Choose a pooled location and condition quantity, or one available tagged unit.</Typography>
            <TextField select label="Reservation line" value={lineId} onChange={(event) => {
              setResource("");
              setLineId(event.target.value);
            }}>
              {reservation.lines.map((line) => <MenuItem key={line.id} value={line.id}>{line.name} (requested {line.requestedQty})</MenuItem>)}
            </TextField>
            <TextField select label="Inventory" value={resource} onChange={(event) => setResource(event.target.value)} required disabled={loadingAvailability || !hasValidApprovalWindow}>
              {(hasValidApprovalWindow ? allocatable : []).map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField
              label="Approved start date"
              type="date"
              value={approvedStartDate}
              onChange={(event) => {
                setResource("");
                setApprovedStartDate(event.target.value);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
            <TextField
              label="Approved end date"
              type="date"
              value={approvedEndDate}
              onChange={(event) => {
                setResource("");
                setApprovedEndDate(event.target.value);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
            <TextField
              label="Quantity"
              type="number"
              inputProps={{ min: 1, max: allocatable.find((option) => option.value === resource)?.maxQuantity }}
              value={resource.startsWith("unit:") ? "1" : quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={resource.startsWith("unit:")}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAllocationOpen(false)} disabled={pending}>Cancel</Button>
          <Button variant="contained" disabled={pending || loadingAvailability || !resource || !lineId} onClick={() => {
            const [kind, id] = resource.split(":");
            run(() => approveAndAllocateGearReservation({
              leagueId,
              reservationId: reservation.id,
              expectedVersion: reservation.version,
              approvedStartDate,
              approvedEndDate,
              allocations: [{
                reservationLineId: lineId,
                quantity: resource.startsWith("unit:") ? 1 : Number(quantity),
                ...(kind === "pool" ? { poolStockId: id } : { gearUnitId: id }),
              }],
            }));
          }}>Approve and allocate</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(selectedReturn)} onClose={() => !pending && setReturnAllocationId(null)} fullWidth maxWidth="xs" aria-labelledby="gear-return-title">
        <DialogTitle id="gear-return-title">Record gear return</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Quantity returned" type="number" inputProps={{ min: 1, max: selectedReturn?.outstandingQty ?? 1 }} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <TextField select label="Disposition" value={disposition} onChange={(event) => setDisposition(event.target.value as typeof disposition)}>
              {["GOOD", "DAMAGED", "LOST", "CONSUMED"].map((value) => <MenuItem key={value} value={value}>{value.replace("_", " ")}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnAllocationId(null)} disabled={pending}>Cancel</Button>
          <Button variant="contained" disabled={pending || !selectedReturn} onClick={() => selectedReturn && run(() => recordGearReturn({
            leagueId,
            allocationId: selectedReturn.id,
            expectedVersion: selectedReturn.version,
            quantity: Number(quantity),
            returnDisposition: disposition,
          }))}>Save return</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
