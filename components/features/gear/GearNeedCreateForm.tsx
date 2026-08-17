"use client";

import { useState } from "react";
import { AddOutlined, DeleteOutline } from "@mui/icons-material";
import { Alert, Box, Button, Card, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { createTeamGearNeed } from "@/lib/actions/gear-needs";

type NeedLine = { nameSnapshot: string; requestedQty: number; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" };

export function GearNeedCreateForm({
  leagueId,
  teams,
}: {
  leagueId: string;
  teams: Array<{ id: string; name: string }>;
}) {
  const [lines, setLines] = useState<NeedLine[]>([{ nameSnapshot: "", requestedQty: 1, priority: "NORMAL" }]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  async function submit(formData: FormData) {
    setIsSaving(true);
    setMessage(null);
    const result = await createTeamGearNeed({
      leagueId,
      teamId: String(formData.get("teamId") ?? ""),
      idempotencyKey,
      title: String(formData.get("title") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      lines,
    });
    setIsSaving(false);
    if (result.success) setIdempotencyKey(crypto.randomUUID());
    setMessage(result.success ? "Draft need created. Submit it from the need details page when ready for association review." : result.error);
  }

  function updateLine(index: number, patch: Partial<NeedLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  return (
    <Card component="form" action={submit} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        {message && <Alert severity={message.startsWith("Draft") ? "success" : "error"}>{message}</Alert>}
        <Box component="fieldset" disabled={isSaving} sx={{ border: 0, p: 0, m: 0 }}>
          <Stack spacing={2}>
            <TextField name="teamId" select label="Team" required defaultValue={teams[0]?.id ?? ""}>
              {teams.map((team) => <MenuItem key={team.id} value={team.id}>{team.name}</MenuItem>)}
            </TextField>
            <TextField name="title" label="Need title" required />
            <TextField name="notes" label="Team notes" multiline minRows={2} />
            <Typography variant="h6">Requested items</Typography>
            {lines.map((line, index) => (
              <Stack key={index} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <TextField label="Item or description" required value={line.nameSnapshot} onChange={(event) => updateLine(index, { nameSnapshot: event.target.value })} fullWidth />
                <TextField label="Quantity" type="number" required inputProps={{ min: 1 }} value={line.requestedQty} onChange={(event) => updateLine(index, { requestedQty: Number(event.target.value) })} sx={{ minWidth: { sm: 130 } }} />
                <TextField select label="Priority" value={line.priority} onChange={(event) => updateLine(index, { priority: event.target.value as NeedLine["priority"] })} sx={{ minWidth: { sm: 140 } }}>
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
                </TextField>
                <IconButton aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><DeleteOutline /></IconButton>
              </Stack>
            ))}
            <Button startIcon={<AddOutlined />} onClick={() => setLines((current) => [...current, { nameSnapshot: "", requestedQty: 1, priority: "NORMAL" }])} sx={{ alignSelf: "start", minHeight: 44 }}>Add item</Button>
          </Stack>
        </Box>
        <Alert severity="info">A need records demand only. It does not allocate, reserve, or check out gear.</Alert>
        <Button type="submit" variant="contained" disabled={isSaving} sx={{ minHeight: 44 }}>{isSaving ? "Saving..." : "Save draft need"}</Button>
      </Stack>
    </Card>
  );
}
