"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { correctGearPledgeReceipt, declineGearPledge, expireGearPledge, receiveGearPledge } from "@/lib/actions/gear-pledges";

type InventoryOption = { id: string; name: string };
type PoolStockOption = { id: string; catalogName: string; locationName: string };
type ReceiptOption = { id: string; quantity: number; receivedAt: string };
const conditions = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;
type Condition = (typeof conditions)[number];

export function GearPledgeAdminActions({
  leagueId,
  pledgeId,
  pledgeVersion,
  status,
  catalogItems,
  pooledCatalogItems,
  locations,
  poolStock,
  remainingQuantity,
  receipts,
}: {
  leagueId: string;
  pledgeId: string;
  pledgeVersion: number;
  status: "PLEDGED" | "RECEIVED" | "DECLINED" | "CANCELED" | "EXPIRED";
  catalogItems: InventoryOption[];
  pooledCatalogItems: InventoryOption[];
  locations: InventoryOption[];
  poolStock: PoolStockOption[];
  remainingQuantity: number;
  receipts: ReceiptOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"pooled" | "tagged">("pooled");
  const [condition, setCondition] = useState<Condition | "">("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [correctionReceiptId, setCorrectionReceiptId] = useState(receipts[0]?.id ?? "");
  const [correctionReason, setCorrectionReason] = useState("");
  const [operationKey, setOperationKey] = useState(() => {
    const storageKey = `gear-pledge-receipt:${pledgeId}:${pledgeVersion}`;
    return typeof window === "undefined" ? crypto.randomUUID() : sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
  });
  useEffect(() => {
    sessionStorage.setItem(`gear-pledge-receipt:${pledgeId}:${pledgeVersion}`, operationKey);
  }, [operationKey, pledgeId, pledgeVersion]);

  async function receive(formData: FormData) {
    setPending(true);
    setFieldErrors({});
    const assetTags = String(formData.get("assetTags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const result = await receiveGearPledge({
      leagueId,
      pledgeId,
      expectedVersion: pledgeVersion,
      idempotencyKey: operationKey,
      poolStockId: mode === "pooled" ? String(formData.get("poolStockId") ?? "") : "",
      catalogItemId: String(formData.get("catalogItemId") ?? ""),
      locationId: String(formData.get("locationId") ?? ""),
      condition: condition || undefined,
      assetTags: mode === "tagged" ? assetTags : [],
      quantity: Number(formData.get("quantity") ?? 0),
      notes: String(formData.get("notes") ?? ""),
    });
    setPending(false);
    if (result.success) {
      sessionStorage.removeItem(`gear-pledge-receipt:${pledgeId}:${pledgeVersion}`);
      setOperationKey(crypto.randomUUID());
      setMessage("Receipt recorded.");
      router.refresh();
    } else {
      setFieldErrors(actionFieldErrors(result.details));
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

  async function expire() {
    setPending(true);
    const result = await expireGearPledge({ leagueId, pledgeId, expectedVersion: pledgeVersion });
    setPending(false);
    if (result.success) {
      setMessage("Pledge expired.");
      router.refresh();
    } else {
      setMessage(result.error);
    }
  }

  async function correct() {
    setPending(true);
    setFieldErrors({});
    const result = await correctGearPledgeReceipt({
      leagueId,
      pledgeId,
      receiptId: correctionReceiptId,
      expectedVersion: pledgeVersion,
      reason: correctionReason,
    });
    setPending(false);
    if (result.success) {
      setMessage("Receipt correction recorded.");
      router.refresh();
    } else {
      setFieldErrors(actionFieldErrors(result.details));
      setMessage(result.error);
    }
  }

  const canReceive = status === "PLEDGED" && remainingQuantity > 0;
  const canCorrect = ["PLEDGED", "RECEIVED"].includes(status) && receipts.length > 0;
  if (!canReceive && !canCorrect) return null;
  return (
    <Stack spacing={1} sx={{ pt: 1 }}>
      {message && <Alert severity={message.endsWith(".") && !message.includes("error") ? "success" : "error"}>{message}</Alert>}
      {canReceive && <Stack component="form" action={receive} spacing={1}>
      <TextField select label="Receipt type" value={mode} onChange={(event) => setMode(event.target.value as "pooled" | "tagged")}>
        <MenuItem value="pooled">Pooled inventory</MenuItem>
        <MenuItem value="tagged">Individually tagged units</MenuItem>
      </TextField>
      {mode === "pooled" ? (
        <>
          <TextField select name="poolStockId" label="Existing pooled stock destination" defaultValue="" error={Boolean(fieldErrors.poolStockId)} helperText={fieldErrors.poolStockId}>
          <MenuItem value="">Create or select a destination below</MenuItem>
          {poolStock.map((stock) => <MenuItem key={stock.id} value={stock.id}>{stock.catalogName} - {stock.locationName}</MenuItem>)}
          </TextField>
          <TextField select name="catalogItemId" label="Pooled catalog item" defaultValue="" error={Boolean(fieldErrors.catalogItemId)} helperText={fieldErrors.catalogItemId}>
          <MenuItem value="">Select when creating a new pooled destination</MenuItem>
          {pooledCatalogItems.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </TextField>
        </>
      ) : (
        <>
          <TextField select name="catalogItemId" label="Catalog item" required defaultValue="" error={Boolean(fieldErrors.catalogItemId)} helperText={fieldErrors.catalogItemId}>
            <MenuItem value="" disabled>Select item</MenuItem>
            {catalogItems.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </TextField>
          <TextField name="assetTags" label="Asset tags" error={Boolean(fieldErrors.assetTags)} helperText={fieldErrors.assetTags ?? "One unique tag per unit, separated by commas."} required />
        </>
      )}
      <TextField select name="locationId" label="Storage location" required defaultValue="" error={Boolean(fieldErrors.locationId)} helperText={fieldErrors.locationId}>
        <MenuItem value="" disabled>Select location</MenuItem>
        {locations.map((location) => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}
      </TextField>
      <TextField select label="Observed condition" value={condition} onChange={(event) => setCondition(event.target.value as Condition)} error={Boolean(fieldErrors.condition)} helperText={fieldErrors.condition} required>
        <MenuItem value="" disabled>Select observed condition</MenuItem>
        {conditions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <TextField name="quantity" label="Received quantity" type="number" inputProps={{ min: 1, max: remainingQuantity }} error={Boolean(fieldErrors.quantity)} helperText={fieldErrors.quantity ?? `${remainingQuantity} remaining on this pledge`} required />
      <TextField name="notes" label="Receipt notes" multiline minRows={2} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>Record receipt</Button>
        <Button type="button" color="inherit" disabled={pending} onClick={decline} sx={{ minHeight: 44 }}>Decline pledge</Button>
        <Button type="button" color="inherit" disabled={pending} onClick={expire} sx={{ minHeight: 44 }}>Expire pledge</Button>
      </Stack>
      </Stack>}
      {canCorrect && (
        <Stack spacing={1} sx={{ pt: 1 }}>
          <Typography variant="subtitle2">Correct a receipt</Typography>
          <TextField select label="Receipt to correct" value={correctionReceiptId} onChange={(event) => setCorrectionReceiptId(event.target.value)}>
            {receipts.map((receipt) => <MenuItem key={receipt.id} value={receipt.id}>{receipt.id} · {receipt.quantity} · {new Date(receipt.receivedAt).toLocaleDateString()}</MenuItem>)}
          </TextField>
          <TextField label="Correction reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} error={Boolean(fieldErrors.reason)} helperText={fieldErrors.reason} required />
          <Button type="button" color="warning" disabled={pending || !correctionReceiptId || !correctionReason} onClick={correct} sx={{ alignSelf: "start", minHeight: 44 }}>Correct receipt</Button>
        </Stack>
      )}
    </Stack>
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
