"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, MenuItem, Stack, TextField } from "@mui/material";
import type { ScheduleFormat } from "@prisma/client";
import { DateField } from "@/components/ui/date";
import { createSeason, updateSeason } from "@/lib/actions/seasons";
import { SCHEDULE_FORMAT_LABELS } from "@/lib/utils/sport-catalog";
import { SCHEDULE_FORMATS } from "@/lib/utils/validation";

/** Exactly one of leagueId/teamId — a season belongs to one owner (FR-001). */
export type SeasonOwner = { leagueId?: string; teamId?: string };

export type SeasonOwnerOption = {
  name: string;
  owner: SeasonOwner;
};

export type SeasonFormInitialValues = {
  seasonId: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  format: ScheduleFormat | null;
};

interface SeasonFormProps {
  /**
   * Owner contexts the user may create seasons for (create mode). A picker is
   * shown when there is more than one; a single option is used silently.
   */
  ownerOptions?: SeasonOwnerOption[];
  /** Present in edit mode. */
  initialValues?: SeasonFormInitialValues;
  /** Called after a successful save in edit mode (e.g. to close a dialog). */
  onSaved?: () => void;
  /** Overrides the default Cancel behavior (router.back). */
  onCancel?: () => void;
}

const ownerKey = (owner: SeasonOwner) =>
  owner.leagueId ? `league:${owner.leagueId}` : `team:${owner.teamId}`;

const dateInputValue = (date: Date) => new Date(date).toISOString().slice(0, 10);

/**
 * Create/edit a season: name, description, and a date range — deliberately no
 * format, rotation, or judging inputs on the create path (FR-003). Edit mode
 * offers an optional, purely descriptive format label (FR-004/005).
 */
export function SeasonForm({ ownerOptions = [], initialValues, onSaved, onCancel }: SeasonFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialValues);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ownerValue, setOwnerValue] = useState(
    ownerOptions.length === 1 ? ownerKey(ownerOptions[0].owner) : ""
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = (name: string) => String(formData.get(name) ?? "").trim();

    const startDate = new Date(text("startDate"));
    const endDate = new Date(text("endDate"));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Enter a valid start and end date.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }

    startTransition(async () => {
      setError(null);

      if (isEdit && initialValues) {
        const formatText = text("format");
        const result = await updateSeason({
          seasonId: initialValues.seasonId,
          name: text("name"),
          description: text("description"),
          startDate,
          endDate,
          format: formatText ? (formatText as ScheduleFormat) : null,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        onSaved?.();
        router.refresh();
        return;
      }

      const selected = ownerOptions.find((option) => ownerKey(option.owner) === ownerValue);
      if (!selected) {
        setError("Choose which league or team this season is for.");
        return;
      }
      const result = await createSeason({
        name: text("name"),
        description: text("description"),
        startDate,
        endDate,
        leagueId: selected.owner.leagueId,
        teamId: selected.owner.teamId,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/seasons/${result.data.id}`);
      router.refresh();
    });
  };

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2} sx={{ pt: 1 }}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      {!isEdit && ownerOptions.length > 1 ? (
        <TextField
          select
          required
          label="Season for"
          value={ownerValue}
          onChange={(event) => setOwnerValue(event.target.value)}
          helperText="The league or standalone team this season belongs to"
        >
          {ownerOptions.map((option) => (
            <MenuItem key={ownerKey(option.owner)} value={ownerKey(option.owner)}>
              {option.name}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      <TextField
        name="name"
        label="Season name"
        required
        defaultValue={initialValues?.name ?? ""}
        placeholder="Fall 2026"
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />
      <TextField
        name="description"
        label="Description (optional)"
        multiline
        minRows={3}
        defaultValue={initialValues?.description ?? ""}
        slotProps={{ htmlInput: { maxLength: 1000 } }}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <DateField
          name="startDate"
          label="Starts"
          required
          fullWidth
          defaultValue={initialValues ? dateInputValue(initialValues.startDate) : ""}
        />
        <DateField
          name="endDate"
          label="Ends"
          required
          fullWidth
          defaultValue={initialValues ? dateInputValue(initialValues.endDate) : ""}
        />
      </Stack>

      {isEdit ? (
        <TextField
          select
          name="format"
          label="Format label (optional)"
          defaultValue={initialValues?.format ?? ""}
          helperText="Optional — a label only; it never changes how games are scheduled"
        >
          <MenuItem value="">Not specified</MenuItem>
          {SCHEDULE_FORMATS.map((format) => (
            <MenuItem key={format} value={format}>
              {SCHEDULE_FORMAT_LABELS[format]}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button onClick={() => (onCancel ? onCancel() : router.back())} disabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isPending || (!isEdit && !ownerValue)}
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create season"}
        </Button>
      </Stack>
    </Stack>
  );
}
