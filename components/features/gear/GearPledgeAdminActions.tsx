"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, MenuItem, Stack, TextField } from "@mui/material";
import { declineGearPledge, receiveGearPledge } from "@/lib/actions/gear-pledges";

type InventoryOption = { id: string; name: string };
type PoolStockOption = { id: string; catalogName: string; locationName: string };

export function GearPledgeAdminActions({
  leagueId,
  pledgeId,
  pledgeVersion,
  status,
  catalogItems,
  locations,
  poolStock,
}: {
  leagueId: string;
  pledgeId: string;
  pledgeVersion: number;
  status: "PLEDGED" | "RECEIVED" | "DECLINED" | "CANCELED" | "EXPIRED";
  catalogItems: InventoryOption[];
  locations: InventoryOption[];
  poolStock: PoolStockOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"pooled" | "tagged">("pooled");

  async function receive(formData: FormData) {
    setPending(true);
    const assetTags = String(formData.get("assetTags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const result = await receiveGearPledge({
      leagueId,
      pledgeId,
      expectedVersion: pledgeVersion,
      idempotencyKey: crypto.randomUUID(),
      poolStockId: mode === "pooled" ? String(formData.get("poolStockId") ?? "") : "",
      catalogItemId: mode === "tagged" ? String(formData.get("catalogItemId") ?? "") : "",
      locationId: mode === "tagged" ? String(formData.get("locationId") ?? "") : "",
      condition: mode === "tagged" ? "GOOD" : undefined,
      assetTags: mode === "tagged" ? assetTags : [],
      quantity: Number(formData.get("quantity") ?? 0),
      notes: String(formData.get("notes") ?? ""),
    });
    setPending(false);
    if (result.success) {
      setMessage("Receipt recorded.");
      router.refresh();
    } else {
      setMessage(result.error);
    }
  }

  async function decline() {
    setPending(true);
    const result = await declineGearPledge({ leagueId, pledgeId, expectedVersion: pledgeVersion });
    setPending(false);
    if (result.success) {
      setMessage("Pledge declined.");
      router.refresh();
    } else {
      setMessage(result.error);
    }
  }

  if (status !== "PLEDGED") return null;
  return (
    <Stack component="form" action={receive} spacing={1} sx={{ pt: 1 }}>
      {message && <Alert severity={message.endsWith(".") && !message.includes("error") ? "success" : "error"}>{message}</Alert>}
      <TextField select label="Receipt type" value={mode} onChange={(event) => setMode(event.target.value as "pooled" | "tagged")}>
        <MenuItem value="pooled">Pooled inventory</MenuItem>
        <MenuItem value="tagged">Individually tagged units</MenuItem>
      </TextField>
      {mode === "pooled" ? (
        <TextField select name="poolStockId" label="Pooled stock destination" required defaultValue="">
          <MenuItem value="" disabled>Select stock</MenuItem>
          {poolStock.map((stock) => <MenuItem key={stock.id} value={stock.id}>{stock.catalogName} - {stock.locationName}</MenuItem>)}
        </TextField>
      ) : (
        <>
          <TextField select name="catalogItemId" label="Catalog item" required defaultValue="">
            <MenuItem value="" disabled>Select item</MenuItem>
            {catalogItems.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </TextField>
          <TextField select name="locationId" label="Storage location" required defaultValue="">
            <MenuItem value="" disabled>Select location</MenuItem>
            {locations.map((location) => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}
          </TextField>
          <TextField name="assetTags" label="Asset tags" helperText="One unique tag per unit, separated by commas." required />
        </>
      )}
      <TextField name="quantity" label="Received quantity" type="number" inputProps={{ min: 1 }} required />
      <TextField name="notes" label="Receipt notes" multiline minRows={2} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>Record receipt</Button>
        <Button type="button" color="inherit" disabled={pending} onClick={decline} sx={{ minHeight: 44 }}>Decline pledge</Button>
      </Stack>
    </Stack>
  );
}
