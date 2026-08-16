"use client";

import { useState, useTransition } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField,
} from "@mui/material";
import { createGearReservation } from "@/lib/actions/gear-reservations";
import type { GearReservationContext } from "@/lib/actions/gear-context";

export function GearReservationRequestDialog({ data }: { data: GearReservationContext }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState(data.requestableTeams[0]?.id ?? "");
  const [catalogItemId, setCatalogItemId] = useState(data.catalogItems[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [custodianName, setCustodianName] = useState("");
  const [custodianEmail, setCustodianEmail] = useState("");
  const [quantity, setQuantity] = useState("1");

  if (data.requestableTeams.length === 0) return null;

  const close = () => {
    if (!pending) {
      setOpen(false);
      setError(null);
    }
  };

  const submit = () => {
    const item = data.catalogItems.find((candidate) => candidate.id === catalogItemId);
    if (!item) {
      setError("Choose an active catalog item.");
      return;
    }
    startTransition(async () => {
      const result = await createGearReservation({
        leagueId: data.league.id,
        teamId,
        requestedStartDate: startDate,
        requestedEndDate: endDate,
        custodianNameSnapshot: custodianName,
        custodianEmailSnapshot: custodianEmail,
        lines: [{ catalogItemId: item.id, nameSnapshot: item.name, requestedQty: Number(quantity) }],
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      close();
    });
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)} sx={{ minHeight: 44 }}>
        Request gear
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="gear-request-title">
        <DialogTitle id="gear-request-title">Request association gear</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField select label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
              {data.requestableTeams.map((team) => <MenuItem key={team.id} value={team.id}>{team.name}</MenuItem>)}
            </TextField>
            <TextField select label="Gear item" value={catalogItemId} onChange={(event) => setCatalogItemId(event.target.value)} required>
              {data.catalogItems.map((item) => <MenuItem key={item.id} value={item.id}>{item.name} ({item.trackingMode === "POOLED" ? "pooled" : "tagged"})</MenuItem>)}
            </TextField>
            <TextField label="Quantity" type="number" inputProps={{ min: 1 }} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            <TextField label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
            <TextField label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
            <TextField label="Custodian name" value={custodianName} onChange={(event) => setCustodianName(event.target.value)} required />
            <TextField label="Custodian email" type="email" value={custodianEmail} onChange={(event) => setCustodianEmail(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={pending}>Cancel</Button>
          <Button onClick={submit} variant="contained" disabled={pending}>Submit request</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
