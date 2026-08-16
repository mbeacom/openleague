"use client";

import { useState } from "react";
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

type PledgeResult = { success: boolean; error?: string };

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
  const [key] = useState(() => crypto.randomUUID());

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setMessage(null);
    const result = await submit({
      wishlistToken: token,
      wishlistItemId: String(formData.get("wishlistItemId") ?? ""),
      donorName: String(formData.get("donorName") ?? ""),
      donorEmail: String(formData.get("donorEmail") ?? ""),
      donorPhone: String(formData.get("donorPhone") ?? ""),
      contactConsent: formData.get("contactConsent") === "on",
      quantity: Number(formData.get("quantity") ?? 0),
      note: String(formData.get("note") ?? ""),
      idempotencyKey: key,
      website: String(formData.get("website") ?? ""),
    });
    setIsSubmitting(false);
    setMessage(result.success
      ? "Thank you. The association will use your contact details only to coordinate this donation."
      : result.error ?? "We could not record your pledge. Please try again.");
  }

  return (
    <Card component="form" action={handleSubmit} variant="outlined" sx={{ p: 2 }}>
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
        <TextField name="quantity" label="Quantity" type="number" inputProps={{ min: 1 }} required />
        <TextField name="donorName" label="Your name" required autoComplete="name" />
        <TextField name="donorEmail" label="Email" type="email" autoComplete="email" />
        <TextField name="donorPhone" label="Phone" type="tel" autoComplete="tel" />
        <TextField name="note" label="Donation note" multiline minRows={2} />
        <TextField
          name="website"
          label="Website"
          tabIndex={-1}
          autoComplete="off"
          sx={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}
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
