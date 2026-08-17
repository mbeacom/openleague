"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { DeleteOutline } from "@mui/icons-material";
import { createGearReservation } from "@/lib/actions/gear-reservations";
import type { GearReservationContext } from "@/lib/actions/gear-context";
import { createGearReservationSchema } from "@/lib/utils/validation";

type RequestLine = { key: string; catalogItemId: string; requestedQty: string };

type FieldErrors = Record<string, string>;

const lineKey = () => Math.random().toString(36).slice(2, 10);

/**
 * Zod paths are addressed positionally (`lines.0.requestedQty`), so both client
 * and server issues are flattened onto the same keys the inputs read from.
 */
function collectFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map((segment) => String(segment)).join(".");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function GearReservationRequestDialog({ data }: { data: GearReservationContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [teamId, setTeamId] = useState(data.requestableTeams[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [custodianName, setCustodianName] = useState("");
  const [custodianEmail, setCustodianEmail] = useState("");
  const [custodianPhone, setCustodianPhone] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [lines, setLines] = useState<RequestLine[]>([
    { key: lineKey(), catalogItemId: data.catalogItems[0]?.id ?? "", requestedQty: "1" },
  ]);

  if (data.requestableTeams.length === 0) return null;

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
    setFieldErrors({});
  };

  const updateLine = (key: string, patch: Partial<RequestLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const buildInput = () => ({
    leagueId: data.league.id,
    teamId,
    requestedStartDate: startDate,
    requestedEndDate: endDate,
    custodianNameSnapshot: custodianName,
    custodianEmailSnapshot: custodianEmail,
    custodianPhoneSnapshot: custodianPhone,
    requestNotes,
    lines: lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      nameSnapshot: data.catalogItems.find((item) => item.id === line.catalogItemId)?.name ?? "",
      requestedQty: line.requestedQty,
    })),
  });

  const submit = () => {
    const input = buildInput();
    const parsed = createGearReservationSchema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error.issues));
      setError("Fix the highlighted fields before submitting this request.");
      return;
    }
    setFieldErrors({});
    setError(null);
    startTransition(async () => {
      const result = await createGearReservation(input);
      if (!result.success) {
        const issues = Array.isArray(result.details)
          ? (result.details as Array<{ path?: PropertyKey[]; message?: string }>)
              .filter((issue): issue is { path: PropertyKey[]; message: string } =>
                Array.isArray(issue.path) && typeof issue.message === "string")
          : [];
        setFieldErrors(collectFieldErrors(issues));
        setError(result.error);
        return;
      }
      setLines([{ key: lineKey(), catalogItemId: data.catalogItems[0]?.id ?? "", requestedQty: "1" }]);
      setRequestNotes("");
      setOpen(false);
      router.refresh();
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
            <TextField
              select
              label="Team"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              error={Boolean(fieldErrors.teamId)}
              helperText={fieldErrors.teamId}
              required
            >
              {data.requestableTeams.map((team) => <MenuItem key={team.id} value={team.id}>{team.name}</MenuItem>)}
            </TextField>
            <TextField
              label="Start date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(fieldErrors.requestedStartDate)}
              helperText={fieldErrors.requestedStartDate}
              required
            />
            <TextField
              label="End date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(fieldErrors.requestedEndDate)}
              helperText={fieldErrors.requestedEndDate}
              required
            />
            <TextField
              label="Custodian name"
              value={custodianName}
              onChange={(event) => setCustodianName(event.target.value)}
              error={Boolean(fieldErrors.custodianNameSnapshot)}
              helperText={fieldErrors.custodianNameSnapshot}
              required
            />
            <TextField
              label="Custodian email"
              type="email"
              value={custodianEmail}
              onChange={(event) => setCustodianEmail(event.target.value)}
              error={Boolean(fieldErrors.custodianEmailSnapshot)}
              helperText={fieldErrors.custodianEmailSnapshot}
            />
            <TextField
              label="Custodian phone"
              value={custodianPhone}
              onChange={(event) => setCustodianPhone(event.target.value)}
              error={Boolean(fieldErrors.custodianPhoneSnapshot)}
              helperText={fieldErrors.custodianPhoneSnapshot}
            />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Requested items</Typography>
              <Stack spacing={2}>
                {lines.map((line, index) => (
                  <Stack key={line.key} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
                    <TextField
                      select
                      label="Gear item"
                      value={line.catalogItemId}
                      onChange={(event) => updateLine(line.key, { catalogItemId: event.target.value })}
                      error={Boolean(fieldErrors[`lines.${index}.catalogItemId`] || fieldErrors[`lines.${index}.nameSnapshot`])}
                      helperText={fieldErrors[`lines.${index}.catalogItemId`] ?? fieldErrors[`lines.${index}.nameSnapshot`]}
                      fullWidth
                      required
                    >
                      {data.catalogItems.map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                          {item.name} ({item.trackingMode === "POOLED" ? "pooled" : "tagged"})
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="Quantity"
                      type="number"
                      inputProps={{ min: 1 }}
                      value={line.requestedQty}
                      onChange={(event) => updateLine(line.key, { requestedQty: event.target.value })}
                      error={Boolean(fieldErrors[`lines.${index}.requestedQty`])}
                      helperText={fieldErrors[`lines.${index}.requestedQty`]}
                      sx={{ width: { xs: "100%", sm: 140 } }}
                      required
                    />
                    <IconButton
                      aria-label={`Remove item ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
                      disabled={lines.length === 1}
                      sx={{ minHeight: 44, minWidth: 44 }}
                    >
                      <DeleteOutline />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
              {fieldErrors.lines && <Typography variant="caption" color="error">{fieldErrors.lines}</Typography>}
              <Button
                onClick={() => setLines((current) => [
                  ...current,
                  { key: lineKey(), catalogItemId: data.catalogItems[0]?.id ?? "", requestedQty: "1" },
                ])}
                disabled={data.catalogItems.length === 0}
                sx={{ minHeight: 44, mt: 1 }}
              >
                Add another item
              </Button>
            </Box>
            <TextField
              label="Request notes"
              multiline
              minRows={2}
              value={requestNotes}
              onChange={(event) => setRequestNotes(event.target.value)}
              error={Boolean(fieldErrors.requestNotes)}
              helperText={fieldErrors.requestNotes}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={pending}>Cancel</Button>
          <Button onClick={submit} variant="contained" disabled={pending} sx={{ minHeight: 44 }}>Submit request</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
