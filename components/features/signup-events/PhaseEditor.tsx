"use client";

import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { HostGroupOptions } from "@/lib/actions/signup-events";
import { PHASE_AUDIENCES } from "@/lib/utils/validation";
import { DateTimeField } from "@/components/ui/date";

export type PhaseRow = {
  id?: string;
  name: string;
  opensAt: string; // datetime-local value
  audience: (typeof PHASE_AUDIENCES)[number];
  divisionIds: string[];
  teamIds: string[];
};

const AUDIENCE_LABELS: Record<(typeof PHASE_AUDIENCES)[number], string> = {
  HOST_MEMBERS: "Host members (association/team/rink community)",
  SELECTED_GROUPS: "Specific divisions or teams",
  INVITEES: "Invited people only",
  EVERYONE: "Everyone with access to the event",
};

interface PhaseEditorProps {
  phases: PhaseRow[];
  onChange: (phases: PhaseRow[]) => void;
  groupOptions: HostGroupOptions;
}

export function PhaseEditor({ phases, onChange, groupOptions }: PhaseEditorProps) {
  const updatePhase = (index: number, patch: Partial<PhaseRow>) => {
    onChange(phases.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)));
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">Registration phases (optional)</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() =>
            onChange([
              ...phases,
              {
                name: phases.length === 0 ? "Members first" : "Open registration",
                opensAt: "",
                audience: phases.length === 0 ? "HOST_MEMBERS" : "EVERYONE",
                divisionIds: [],
                teamIds: [],
              },
            ])
          }
        >
          Add phase
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Give priority access — e.g. association members register first, then everyone else. People
        outside an open phase can join the waitlist and are offered spots automatically when their
        window opens or capacity frees up. Without phases, registration opens for everyone at the
        time set above.
      </Typography>

      {phases.map((phase, index) => (
        <Box key={phase.id ?? `phase-${index}`}>
          {index > 0 ? <Divider sx={{ mb: 2 }} /> : null}
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
              <TextField
                label="Phase name"
                value={phase.name}
                required
                onChange={(event) => updatePhase(index, { name: event.target.value })}
                sx={{ flex: 1 }}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              {/* The shared field takes no sx; a Box carries the row's flex sizing. */}
              <Box sx={{ flex: 1 }}>
                <DateTimeField
                  label="Opens at"
                  required
                  value={phase.opensAt}
                  onChange={(value) => updatePhase(index, { opensAt: value })}
                />
              </Box>
              <IconButton
                aria-label={`Remove phase ${phase.name || index + 1}`}
                onClick={() => onChange(phases.filter((_, i) => i !== index))}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </Stack>
            <TextField
              select
              label="Who may register in this phase"
              value={phase.audience}
              onChange={(event) =>
                updatePhase(index, { audience: event.target.value as PhaseRow["audience"] })
              }
            >
              {PHASE_AUDIENCES.map((audience) => (
                <MenuItem key={audience} value={audience}>
                  {AUDIENCE_LABELS[audience]}
                </MenuItem>
              ))}
            </TextField>
            {phase.audience === "SELECTED_GROUPS" ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                {groupOptions.divisions.length > 0 ? (
                  <TextField
                    select
                    label="Divisions"
                    fullWidth
                    value={phase.divisionIds}
                    onChange={(event) =>
                      updatePhase(index, {
                        divisionIds:
                          typeof event.target.value === "string"
                            ? event.target.value.split(",")
                            : (event.target.value as unknown as string[]),
                      })
                    }
                    slotProps={{
                      select: {
                        multiple: true,
                        renderValue: (selected) => (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {(selected as string[]).map((id) => (
                              <Chip
                                key={id}
                                size="small"
                                label={groupOptions.divisions.find((d) => d.id === id)?.name ?? id}
                              />
                            ))}
                          </Stack>
                        ),
                      },
                    }}
                  >
                    {groupOptions.divisions.map((division) => (
                      <MenuItem key={division.id} value={division.id}>
                        {division.name}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
                <TextField
                  select
                  label="Teams"
                  fullWidth
                  value={phase.teamIds}
                  onChange={(event) =>
                    updatePhase(index, {
                      teamIds:
                        typeof event.target.value === "string"
                          ? event.target.value.split(",")
                          : (event.target.value as unknown as string[]),
                    })
                  }
                  slotProps={{
                    select: {
                      multiple: true,
                      renderValue: (selected) => (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {(selected as string[]).map((id) => (
                            <Chip
                              key={id}
                              size="small"
                              label={groupOptions.teams.find((t) => t.id === id)?.name ?? id}
                            />
                          ))}
                        </Stack>
                      ),
                    },
                  }}
                >
                  {groupOptions.teams.length === 0 ? (
                    <MenuItem disabled value="">
                      No teams available for this host
                    </MenuItem>
                  ) : (
                    groupOptions.teams.map((team) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>
                    ))
                  )}
                </TextField>
              </Stack>
            ) : null}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
