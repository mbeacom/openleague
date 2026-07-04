"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { AgeClassification } from "@prisma/client";
import { createDivisionInline, recordPlacement } from "@/lib/actions/placements";
import {
  AGE_CLASSIFICATION_LABELS,
  AGE_CLASSIFICATION_OPTIONS,
} from "@/lib/utils/age-level";
import type { PlacementBoardRow } from "@/types/seasons";

interface PlacementBoardProps {
  seasonId: string;
  leagueId: string;
  rows: PlacementBoardRow[];
  divisions: Array<{ id: string; name: string }>;
}

/** Editable per-row fields; absent entries fall back to the server row. */
type RowEdit = { divisionId: string; rank: string; privateNote: string };

const rowToEdit = (row: PlacementBoardRow): RowEdit => ({
  divisionId: row.divisionId ?? "",
  rank: row.rank != null ? String(row.rank) : "",
  privateNote: row.privateNote ?? "",
});

const recordText = (row: PlacementBoardRow) =>
  `${row.wins ?? 0}-${row.losses ?? 0}-${row.ties ?? 0}`;

/**
 * Pre-season placement board (FR-025/026/027): league admins review each
 * team's qualifying results and assign divisions. Records are age-gated
 * below the score threshold — those teams get manual rank + private note
 * instead. Teams with no games are marked "Unevaluated" but are never
 * blocked from placement.
 */
export function PlacementBoard({ seasonId, leagueId, rows, divisions }: PlacementBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(
    null
  );
  const [divisionDialogOpen, setDivisionDialogOpen] = useState(false);
  const [divisionError, setDivisionError] = useState<string | null>(null);

  const editFor = (row: PlacementBoardRow): RowEdit => edits[row.teamId] ?? rowToEdit(row);

  const setField = (row: PlacementBoardRow, field: keyof RowEdit, value: string) => {
    setEdits((current) => ({
      ...current,
      [row.teamId]: { ...editFor(row), [field]: value },
    }));
  };

  const handleSave = (row: PlacementBoardRow) => {
    const edit = editFor(row);
    setSavingTeamId(row.teamId);
    startTransition(async () => {
      setMessage(null);
      const result = await recordPlacement({
        seasonId,
        teamId: row.teamId,
        divisionId: edit.divisionId || null,
        rank: edit.rank.trim() === "" ? undefined : Number(edit.rank),
        privateNote: edit.privateNote.trim() === "" ? undefined : edit.privateNote.trim(),
      });
      setSavingTeamId(null);
      if (!result.success) {
        setMessage({ severity: "error", text: `${row.teamName}: ${result.error}` });
        return;
      }
      // Drop the local edit so the row reflects refreshed server truth.
      setEdits((current) => {
        const next = { ...current };
        delete next[row.teamId];
        return next;
      });
      setMessage({ severity: "success", text: `Placement recorded for ${row.teamName}.` });
      router.refresh();
    });
  };

  const handleCreateDivision = (formData: FormData) => {
    const name = String(formData.get("name") ?? "").trim();
    const ageClassification = String(formData.get("ageClassification") ?? "").trim();
    if (!name) {
      setDivisionError("Division name is required.");
      return;
    }
    startTransition(async () => {
      setDivisionError(null);
      const result = await createDivisionInline({
        leagueId,
        name,
        ageClassification: ageClassification || undefined,
      });
      if (!result.success) {
        setDivisionError(result.error);
        return;
      }
      setDivisionDialogOpen(false);
      router.refresh();
    });
  };

  const statusChips = (row: PlacementBoardRow) => (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {row.gamesPlayed === 0 ? (
        <Chip size="small" variant="outlined" label="Unevaluated" />
      ) : null}
      {row.scoresGated ? (
        <Chip size="small" variant="outlined" label="Not shown at this level" />
      ) : null}
    </Stack>
  );

  const opponentsCell = (row: PlacementBoardRow) =>
    row.opponents.length === 0 ? (
      <Typography variant="body2" color="text.secondary" component="span">
        —
      </Typography>
    ) : (
      <Tooltip title={row.opponents.join(", ")}>
        <Chip
          size="small"
          variant="outlined"
          label={`${row.opponents.length} opponent${row.opponents.length === 1 ? "" : "s"}`}
        />
      </Tooltip>
    );

  const divisionSelect = (row: PlacementBoardRow) => (
    <TextField
      select
      label="Division"
      size="small"
      fullWidth
      value={editFor(row).divisionId}
      onChange={(event) => setField(row, "divisionId", event.target.value)}
    >
      <MenuItem value="">Unassigned</MenuItem>
      {divisions.map((division) => (
        <MenuItem key={division.id} value={division.id}>
          {division.name}
        </MenuItem>
      ))}
    </TextField>
  );

  const rankField = (row: PlacementBoardRow) => (
    <TextField
      label="Rank"
      size="small"
      type="number"
      fullWidth
      value={editFor(row).rank}
      onChange={(event) => setField(row, "rank", event.target.value)}
      slotProps={{ htmlInput: { min: 1, max: 999 } }}
    />
  );

  const noteField = (row: PlacementBoardRow) => (
    <TextField
      label="Private note"
      size="small"
      multiline
      fullWidth
      value={editFor(row).privateNote}
      onChange={(event) => setField(row, "privateNote", event.target.value)}
      helperText="Visible to league admins only"
      slotProps={{ htmlInput: { maxLength: 2000 } }}
    />
  );

  const saveButton = (row: PlacementBoardRow) => (
    <Button
      size="small"
      variant="contained"
      disabled={isPending}
      onClick={() => handleSave(row)}
      sx={{ minHeight: 44 }}
    >
      {isPending && savingTeamId === row.teamId ? "Saving…" : "Save"}
    </Button>
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">Teams</Typography>
        <Button
          startIcon={<AddIcon />}
          variant="outlined"
          disabled={isPending}
          onClick={() => {
            setDivisionError(null);
            setDivisionDialogOpen(true);
          }}
          sx={{ minHeight: 44 }}
        >
          New division
        </Button>
      </Stack>

      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No active teams in this league yet.
        </Typography>
      ) : (
        <>
          {/* Mobile: cards */}
          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {rows.map((row) => (
              <Card key={row.teamId} variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="subtitle1">{row.teamName}</Typography>
                      {statusChips(row)}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {row.divisionName ?? "Unassigned"} · {row.gamesPlayed} game
                      {row.gamesPlayed === 1 ? "" : "s"} played
                      {row.scoresGated ? "" : ` · ${recordText(row)}`}
                    </Typography>
                    {opponentsCell(row)}
                    {divisionSelect(row)}
                    {rankField(row)}
                    {noteField(row)}
                    {saveButton(row)}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {/* Desktop: table */}
          <Box sx={{ display: { xs: "none", md: "block" } }}>
            <TableContainer component={Card} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Team</TableCell>
                    <TableCell align="right">GP</TableCell>
                    <TableCell>W-L-T</TableCell>
                    <TableCell>Opponents</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Division</TableCell>
                    <TableCell sx={{ width: 100 }}>Rank</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>Private note</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.teamId} hover>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Typography variant="body2">{row.teamName}</Typography>
                          {statusChips(row)}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{row.gamesPlayed}</TableCell>
                      <TableCell>
                        {row.scoresGated ? (
                          <Chip size="small" variant="outlined" label="Not shown at this level" />
                        ) : (
                          recordText(row)
                        )}
                      </TableCell>
                      <TableCell>{opponentsCell(row)}</TableCell>
                      <TableCell>{divisionSelect(row)}</TableCell>
                      <TableCell>{rankField(row)}</TableCell>
                      <TableCell>{noteField(row)}</TableCell>
                      <TableCell align="right">{saveButton(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}

      {/* Inline division creation (FR-027) */}
      <Dialog
        open={divisionDialogOpen}
        onClose={() => (isPending ? undefined : setDivisionDialogOpen(false))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>New division</DialogTitle>
        <Stack component="form" action={(formData: FormData) => handleCreateDivision(formData)}>
          <DialogContent>
            <Stack spacing={2}>
              {divisionError ? <Alert severity="error">{divisionError}</Alert> : null}
              <TextField
                name="name"
                label="Division name"
                required
                fullWidth
                placeholder="Mite Red"
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <TextField
                select
                name="ageClassification"
                label="Age classification (optional)"
                fullWidth
                defaultValue=""
              >
                <MenuItem value="">Not specified</MenuItem>
                {AGE_CLASSIFICATION_OPTIONS.map((classification: AgeClassification) => (
                  <MenuItem key={classification} value={classification}>
                    {AGE_CLASSIFICATION_LABELS[classification]}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setDivisionDialogOpen(false)}
              disabled={isPending}
              sx={{ minHeight: 44 }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isPending} sx={{ minHeight: 44 }}>
              {isPending ? "Creating…" : "Create division"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
    </Stack>
  );
}
