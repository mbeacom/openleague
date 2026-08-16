"use client";

import { useState } from "react";
import { AddOutlined, DeleteOutline } from "@mui/icons-material";
import { Alert, Button, Card, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { createTeamGearNeed } from "@/lib/actions/gear-needs";

type NeedLine = { nameSnapshot: string; requestedQty: number; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" };

export function GearNeedCreateForm({ leagueId, teamIds }: { leagueId: string; teamIds: string[] }) {
  const [lines, setLines] = useState<NeedLine[]>([{ nameSnapshot: "", requestedQty: 1, priority: "NORMAL" }]);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    const result = await createTeamGearNeed({
      leagueId,
      teamId: String(formData.get("teamId") ?? ""),
      title: String(formData.get("title") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      lines,
    });
    setMessage(result.success ? "Draft need created. Submit it from the need details page when ready for association review." : result.error);
  }

  function updateLine(index: number, patch: Partial<NeedLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  return (
    <Card component="form" action={submit} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        {message && <Alert severity={message.startsWith("Draft") ? "success" : "error"}>{message}</Alert>}
        <TextField name="teamId" select label="Team" required defaultValue={teamIds[0] ?? ""}>
          {teamIds.map((teamId) => <MenuItem key={teamId} value={teamId}>{teamId}</MenuItem>)}
        </TextField>
        <TextField name="title" label="Need title" required />
        <TextField name="notes" label="Team notes" multiline minRows={2} />
        <Typography variant="h6">Requested items</Typography>
        {lines.map((line, index) => (
          <Stack key={index} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
            <TextField
              label="Item or description"
              required
              value={line.nameSnapshot}
              onChange={(event) => updateLine(index, { nameSnapshot: event.target.value })}
              fullWidth
            />
            <TextField
              label="Quantity"
              type="number"
              required
              inputProps={{ min: 1 }}
              value={line.requestedQty}
              onChange={(event) => updateLine(index, { requestedQty: Number(event.target.value) })}
              sx={{ minWidth: { sm: 130 } }}
            />
            <TextField
              select
              label="Priority"
              value={line.priority}
              onChange={(event) => updateLine(index, { priority: event.target.value as NeedLine["priority"] })}
              sx={{ minWidth: { sm: 140 } }}
            >
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
            </TextField>
            <IconButton aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
              <DeleteOutline />
            </IconButton>
          </Stack>
        ))}
        <Button startIcon={<AddOutlined />} onClick={() => setLines((current) => [...current, { nameSnapshot: "", requestedQty: 1, priority: "NORMAL" }])} sx={{ alignSelf: "start", minHeight: 44 }}>
          Add item
        </Button>
        <Alert severity="info">A need records demand only. It does not allocate, reserve, or check out gear.</Alert>
        <Button type="submit" variant="contained" sx={{ minHeight: 44 }}>Save draft need</Button>
      </Stack>
    </Card>
  );
}
