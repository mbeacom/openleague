"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import {
  approveAndAllocateGearReservation,
  cancelGearReservation,
  declineGearReservation,
  recordGearPickup,
  recordGearReturn,
  releaseGearAllocation,
} from "@/lib/actions/gear-reservations";
import type { GearInventoryContext, GearReservationContext } from "@/lib/actions/gear-context";

type Reservation = GearReservationContext["reservations"][number];

export function GearReservationLifecycleControls({
  leagueId,
  reservation,
  canManage,
  inventory,
}: {
  leagueId: string;
  reservation: Reservation;
  canManage: boolean;
  inventory: GearInventoryContext | null;
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
  const selectedLine = reservation.lines.find((line) => line.id === lineId);
  const allocatable = useMemo(() => [
    ...(inventory?.pooledStock.filter((stock) =>
      stock.availableQuantity > 0 && stock.catalogItemId === selectedLine?.catalogItemId,
    )
      .map((stock) => ({ value: `pool:${stock.id}`, label: `${stock.catalogName} — ${stock.locationName} (${stock.condition}, ${stock.availableQuantity} available)` })) ?? []),
    ...(inventory?.units.filter((unit) =>
      unit.status === "AVAILABLE" && unit.catalogItemId === selectedLine?.catalogItemId,
    )
      .map((unit) => ({ value: `unit:${unit.id}`, label: `${unit.catalogName} — ${unit.assetTag ?? "tagged unit"} (${unit.currentCondition})` })) ?? []),
  ], [inventory, selectedLine?.catalogItemId]);

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

  return (
    <Stack spacing={1}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {canManage && ["REQUESTED", "APPROVED"].includes(reservation.status) && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button variant="contained" onClick={() => setAllocationOpen(true)} disabled={pending} sx={{ minHeight: 44 }}>
            Review and allocate
          </Button>
          {reservation.status === "REQUESTED" && (
            <Button color="error" variant="outlined" disabled={pending} onClick={() => run(() => declineGearReservation({
              leagueId, reservationId: reservation.id, expectedVersion: reservation.version,
            }))} sx={{ minHeight: 44 }}>
              Decline request
            </Button>
          )}
        </Stack>
      )}
      {canManage && reservation.allocations.some((allocation) => allocation.status === "ALLOCATED") && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {reservation.allocations.filter((allocation) => allocation.status === "ALLOCATED").map((allocation) => (
            <Stack key={allocation.id} direction="row" spacing={1}>
              <Button variant="outlined" disabled={pending} onClick={() => run(() => recordGearPickup({
                leagueId, allocationId: allocation.id, expectedVersion: allocation.version, quantity: allocation.allocatedQty,
              }))} sx={{ minHeight: 44 }}>
                Confirm pickup ({allocation.assetTag ?? allocation.locationName ?? "pooled"})
              </Button>
              <Button color="inherit" disabled={pending} onClick={() => run(() => releaseGearAllocation({
                leagueId, allocationId: allocation.id, expectedVersion: allocation.version,
              }))} sx={{ minHeight: 44 }}>
                Release
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
      {canManage && reservation.allocations.some((allocation) => ["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status)) && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {reservation.allocations.filter((allocation) => ["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status)).map((allocation) => (
            <Button key={allocation.id} variant="outlined" disabled={pending} onClick={() => setReturnAllocationId(allocation.id)} sx={{ minHeight: 44 }}>
              Record return ({allocation.assetTag ?? allocation.locationName ?? "pooled"})
            </Button>
          ))}
        </Stack>
      )}
      {reservation.canCancel && (
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
            <TextField select label="Reservation line" value={lineId} onChange={(event) => setLineId(event.target.value)}>
              {reservation.lines.map((line) => <MenuItem key={line.id} value={line.id}>{line.name} (requested {line.requestedQty})</MenuItem>)}
            </TextField>
            <TextField select label="Inventory" value={resource} onChange={(event) => setResource(event.target.value)} required>
              {allocatable.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField
              label="Approved start date"
              type="date"
              value={approvedStartDate}
              onChange={(event) => setApprovedStartDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
            <TextField
              label="Approved end date"
              type="date"
              value={approvedEndDate}
              onChange={(event) => setApprovedEndDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
            <TextField
              label="Quantity"
              type="number"
              inputProps={{ min: 1, max: resource.startsWith("unit:") ? 1 : undefined }}
              value={resource.startsWith("unit:") ? "1" : quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={resource.startsWith("unit:")}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAllocationOpen(false)} disabled={pending}>Cancel</Button>
          <Button variant="contained" disabled={pending || !resource || !lineId} onClick={() => {
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
            <TextField label="Quantity returned" type="number" inputProps={{ min: 1, max: selectedReturn ? selectedReturn.pickedUpQty - selectedReturn.returnedQty : 1 }} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
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
