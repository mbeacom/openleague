"use client";

import { useRef, useState } from "react";
import { Alert, Button, Card, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";

type PledgeItem = {
  id: string;
  name: string;
  targetQty: number;
  pledgedQty: number;
  receivedQty: number;
};

type PledgeInput = {
  wishlistToken: string;
  wishlistItemId: string;
  donorName: string;
  donorEmail: string;
  donorPhone: string;
  contactConsent: boolean;
  quantity: number;
  note: string;
  idempotencyKey: string;
  website: string;
};

type PledgeResult = { success: boolean; error?: string; details?: unknown };

export function GearPledgeForm({
  token,
  items,
  submit,
}: {
  token: string;
  items: PledgeItem[];
  submit: (input: PledgeInput) => Promise<PledgeResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setMessage(null);
    setFieldErrors({});
    const result = await submit({
      wishlistToken: token,
      wishlistItemId: String(formData.get("wishlistItemId") ?? ""),
      donorName: String(formData.get("donorName") ?? ""),
      donorEmail: String(formData.get("donorEmail") ?? ""),
      donorPhone: String(formData.get("donorPhone") ?? ""),
      contactConsent: formData.get("contactConsent") === "on",
      quantity: Number(formData.get("quantity") ?? 0),
      note: String(formData.get("note") ?? ""),
      idempotencyKey,
      website: String(formData.get("website") ?? ""),
    });
    setIsSubmitting(false);
    if (result.success) {
      formRef.current?.reset();
      setIdempotencyKey(crypto.randomUUID());
      setMessage("Thank you. The association will use your contact details only to coordinate this donation.");
    } else {
      setFieldErrors(actionFieldErrors(result.details));
      setMessage(result.error ?? "We could not record your pledge. Please try again.");
    }
  }

  return (
    <Card ref={formRef} component="form" action={handleSubmit} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h5">Pledge an item</Typography>
        {message && <Alert severity={message.startsWith("Thank") ? "success" : "error"}>{message}</Alert>}
        <TextField select name="wishlistItemId" label="Item" required defaultValue={items[0]?.id ?? ""}>
          {items.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name} ({item.receivedQty}/{item.targetQty} received)
            </MenuItem>
          ))}
        </TextField>
        <TextField name="quantity" label="Quantity" type="number" inputProps={{ min: 1 }} error={Boolean(fieldErrors.quantity)} helperText={fieldErrors.quantity} required />
        <TextField name="donorName" label="Your name" required autoComplete="name" />
        <TextField name="donorEmail" label="Email" type="email" autoComplete="email" error={Boolean(fieldErrors.donorEmail)} helperText={fieldErrors.donorEmail} />
        <TextField name="donorPhone" label="Phone" type="tel" autoComplete="tel" error={Boolean(fieldErrors.donorPhone)} helperText={fieldErrors.donorPhone} />
        <Typography variant="body2" color="text.secondary">Include at least one contact method: email or phone.</Typography>
        <TextField name="note" label="Donation note" multiline minRows={2} />
        <input
          name="website"
          aria-hidden="true"
          tabIndex={-1}
          autoComplete="new-password"
          inert
          style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}
        />
        <FormControlLabel
          control={<Checkbox name="contactConsent" required />}
          label="I agree that the association may contact me only to coordinate this in-kind donation."
        />
        <Button type="submit" disabled={isSubmitting || items.length === 0} variant="contained" sx={{ minHeight: 44 }}>
          {isSubmitting ? "Submitting..." : "Submit pledge"}
        </Button>
      </Stack>
    </Card>
  );
}

function actionFieldErrors(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.flatMap((issue) => {
    if (
      typeof issue !== "object"
      || issue === null
      || !("message" in issue)
      || !("path" in issue)
      || typeof issue.message !== "string"
      || !Array.isArray(issue.path)
      || typeof issue.path[0] !== "string"
    ) return [];
    return [[issue.path[0], issue.message]];
  }));
}
