"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import CampaignIcon from "@mui/icons-material/Campaign";
import {
  assignToEventTeam,
  deleteEventTeam,
  publishEventTeams,
  removeTeamAssignment,
  setFloater,
  upsertEventTeam,
} from "@/lib/actions/event-teams";

type BoardParticipant = {
  id: string;
  participantName: string;
  isFloater: boolean;
  slot: { name: string };
  player: { team: { name: string } | null } | null;
};

type BoardTeam = {
  id: string;
  name: string;
  colorHex: string | null;
  assignments: Array<{ registration: BoardParticipant }>;
  positionCounts: Record<string, number>;
};

interface TeamBoardProps {
  eventId: string;
  teams: BoardTeam[];
  unassigned: BoardParticipant[];
  teamsPublishedAt: Date | null;
}

export function TeamBoard({ eventId, teams, unassigned, teamsPublishedAt }: TeamBoardProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ success: boolean; error?: string; note?: string }>) => {
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (!result.success) {
        setMessage({ severity: "error", text: result.error ?? "Something went wrong." });
        return;
      }
      if (result.note) setMessage({ severity: "success", text: result.note });
      router.refresh();
    });
  };

  const participantChip = (participant: BoardParticipant, onRemove?: () => void) => (
    <Chip
      key={participant.id}
      size="small"
      label={`${participant.participantName}${participant.isFloater ? " ↻" : ""} · ${participant.slot.name}${
        participant.player?.team ? ` · ${participant.player.team.name}` : ""
      }`}
      onDelete={onRemove}
      deleteIcon={onRemove ? <CloseIcon /> : undefined}
    />
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6">Teams</Typography>
          {teamsPublishedAt ? (
            <Chip size="small" color="success" label="Posted to participants" />
          ) : (
            <Chip size="small" color="warning" label="Draft — not visible yet" />
          )}
        </Stack>
        <Button
          startIcon={<CampaignIcon />}
          variant="contained"
          disabled={isPending || teams.every((team) => team.assignments.length === 0)}
          onClick={() =>
            run(async () => {
              const result = await publishEventTeams({ eventId });
              return result.success
                ? { success: true, note: `Teams posted — ${result.data.notified} famil${result.data.notified === 1 ? "y" : "ies"} notified.` }
                : { success: false, error: result.error };
            })
          }
        >
          {teamsPublishedAt ? "Re-post teams" : "Post teams"}
        </Button>
      </Stack>
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          label="New team name"
          value={newTeamName}
          onChange={(event) => setNewTeamName(event.target.value)}
          placeholder="Red / White / House Gold…"
          slotProps={{ htmlInput: { maxLength: 60 } }}
        />
        <Button
          startIcon={<AddIcon />}
          disabled={isPending || !newTeamName.trim()}
          onClick={() =>
            run(async () => {
              const result = await upsertEventTeam({ eventId, name: newTeamName.trim() });
              if (result.success) setNewTeamName("");
              return result.success ? { success: true } : { success: false, error: result.error };
            })
          }
        >
          Add team
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1">
              Unassigned confirmed participants ({unassigned.length})
            </Typography>
            {unassigned.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Everyone confirmed has a team.
              </Typography>
            ) : (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {unassigned.map((participant) => (
                    <Stack key={participant.id} direction="row" alignItems="center">
                      <Checkbox
                        size="small"
                        checked={selected.includes(participant.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, participant.id]
                              : current.filter((id) => id !== participant.id)
                          )
                        }
                        slotProps={{ input: { "aria-label": `Select ${participant.participantName}` } }}
                      />
                      {participantChip(participant)}
                      <FormControlLabel
                        sx={{ ml: 0.5 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={participant.isFloater}
                            disabled={isPending}
                            onChange={(event) =>
                              run(async () => {
                                const result = await setFloater({
                                  registrationId: participant.id,
                                  isFloater: event.target.checked,
                                });
                                return result.success ? { success: true } : { success: false, error: result.error };
                              })
                            }
                          />
                        }
                        label={<Typography variant="caption">floater</Typography>}
                      />
                    </Stack>
                  ))}
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    select
                    label="Assign selected to"
                    value={targetTeamId}
                    onChange={(event) => setTargetTeamId(event.target.value)}
                    sx={{ minWidth: 220 }}
                  >
                    {teams.map((team) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    variant="contained"
                    disabled={isPending || selected.length === 0 || !targetTeamId}
                    onClick={() =>
                      run(async () => {
                        const result = await assignToEventTeam({
                          eventTeamId: targetTeamId,
                          registrationIds: selected,
                        });
                        if (result.success) setSelected([]);
                        return result.success ? { success: true } : { success: false, error: result.error };
                      })
                    }
                  >
                    Assign {selected.length > 0 ? `(${selected.length})` : ""}
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(280px, 1fr))" },
        }}
      >
        {teams.map((team) => (
          <Card key={team.id} variant="outlined" sx={{ borderTop: 3, borderTopColor: team.colorHex ?? "divider" }}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle1">{team.name}</Typography>
                  <Tooltip title="Delete team">
                    <span>
                      <IconButton
                        size="small"
                        disabled={isPending}
                        aria-label={`Delete ${team.name}`}
                        onClick={() =>
                          run(async () => {
                            const result = await deleteEventTeam({ teamId: team.id });
                            return result.success ? { success: true } : { success: false, error: result.error };
                          })
                        }
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {Object.entries(team.positionCounts)
                    .map(([slotName, count]) => `${count} ${slotName.toLowerCase()}${count === 1 ? "" : "s"}`)
                    .join(" · ") || "No players yet"}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {team.assignments.map((assignment) =>
                    participantChip(assignment.registration, () =>
                      run(async () => {
                        const result = await removeTeamAssignment({
                          registrationId: assignment.registration.id,
                        });
                        return result.success ? { success: true } : { success: false, error: result.error };
                      })
                    )
                  )}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}
