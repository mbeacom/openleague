"use client";

import { Checkbox, FormControlLabel, FormGroup, Stack, Typography } from "@mui/material";

interface SkillLevelOption {
  id: string;
  label: string;
  discipline?: string;
  source?: string;
}

export function SkillLevelSelector({
  skillLevels,
  selectedIds = [],
}: {
  skillLevels: SkillLevelOption[];
  selectedIds?: string[];
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">Skill levels</Typography>
      <FormGroup>
        {skillLevels.map((level) => (
          <FormControlLabel
            key={level.id}
            control={<Checkbox name="skillLevelIds" value={level.id} defaultChecked={selectedIds.includes(level.id)} />}
            label={level.label}
          />
        ))}
      </FormGroup>
    </Stack>
  );
}
