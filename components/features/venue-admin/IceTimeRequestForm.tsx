"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { submitIceTimeRequest } from "@/lib/actions/venue-requests";
import {
  formatDateTimeLocalInput,
  parseDateTimeLocalToUtc,
  resolveTimeZone,
} from "@/lib/utils/date";

interface IceTimeRequestFormProps {
  scheduleBlockId: string;
  venueId: string;
  venueName: string;
  startsAt: Date | string;
  endsAt: Date | string;
  /** The venue's IANA timezone; requested times are interpreted against it. */
  timezone?: string;
}

type FormMessage = { severity: "success" | "error"; text: string };

export function IceTimeRequestForm({ scheduleBlockId, venueId, venueName, startsAt, endsAt, timezone }: IceTimeRequestFormProps) {
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [isPending, startTransition] = useTransition();
  const tz = useMemo(() => resolveTimeZone(timezone), [timezone]);
  const defaultStartAt = useMemo(() => formatDateTimeLocalInput(startsAt, tz), [startsAt, tz]);
  const defaultEndAt = useMemo(() => formatDateTimeLocalInput(endsAt, tz), [endsAt, tz]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const optionalString = (name: string) => {
      const value = String(formData.get(name) ?? "").trim();
      return value.length > 0 ? value : undefined;
    };

    startTransition(async () => {
      setMessage(null);
      const result = await submitIceTimeRequest({
        scheduleBlockId,
        venueId,
        requesterOrganizationName: optionalString("requesterOrganizationName"),
        contactName: String(formData.get("contactName") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""),
        contactPhone: optionalString("contactPhone"),
        requestedStartAt: parseDateTimeLocalToUtc(String(formData.get("requestedStartAt") ?? ""), tz) ?? new Date(NaN),
        requestedEndAt: parseDateTimeLocalToUtc(String(formData.get("requestedEndAt") ?? ""), tz) ?? new Date(NaN),
        notes: optionalString("notes"),
      });

      if (result.success) {
        setMessage({ severity: "success", text: "Ice time request submitted." });
        form.reset();
        return;
      }

      setMessage({ severity: "error", text: result.error });
    });
  };

  return (
    <Stack id={`request-${scheduleBlockId}`} component="form" spacing={2} sx={{ maxWidth: 560 }} onSubmit={handleSubmit}>
      <Typography variant="h5">Request ice time</Typography>
      <Alert severity="info">Requesting ice at {venueName}</Alert>
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
      <TextField label="Requester organization" name="requesterOrganizationName" autoComplete="organization" />
      <TextField label="Contact name" name="contactName" required />
      <TextField label="Contact email" name="contactEmail" type="email" required />
      <TextField label="Contact phone" name="contactPhone" type="tel" autoComplete="tel" />
      <TextField
        label="Requested start"
        name="requestedStartAt"
        type="datetime-local"
        required
        defaultValue={defaultStartAt}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Requested end"
        name="requestedEndAt"
        type="datetime-local"
        required
        defaultValue={defaultEndAt}
        helperText={`Times are in ${tz}`}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField label="Notes" name="notes" multiline minRows={3} />
      <Button type="submit" variant="contained" disabled={isPending}>
        {isPending ? "Submitting…" : "Submit request"}
      </Button>
    </Stack>
  );
}
