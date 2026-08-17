"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddOutlined, DeleteOutline } from "@mui/icons-material";
import { Alert, Button, Card, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { saveGearWishlist } from "@/lib/actions/gear-wishlist";

type WishlistItem = {
  catalogItemId: string;
  nameSnapshot: string;
  categorySnapshot: string;
  sizeSnapshot: string;
  description: string;
  targetQty: number;
};

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  size: string | null;
};

export function GearWishlistEditor({
  leagueId,
  catalogItems,
  initial,
}: {
  leagueId: string;
  catalogItems: CatalogItem[];
  initial?: {
    title: string;
    description: string | null;
    version: number;
    items: WishlistItem[];
  };
}) {
  const router = useRouter();
  const [items, setItems] = useState<WishlistItem[]>(
    initial?.items.length ? initial.items : [{ catalogItemId: "", nameSnapshot: "", categorySnapshot: "", sizeSnapshot: "", description: "", targetQty: 1 }],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateItem(index: number, patch: Partial<WishlistItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function chooseCatalog(index: number, id: string) {
    const catalogItem = catalogItems.find((item) => item.id === id);
    updateItem(index, catalogItem
      ? { catalogItemId: id, nameSnapshot: catalogItem.name, categorySnapshot: catalogItem.category, sizeSnapshot: catalogItem.size ?? "" }
      : { catalogItemId: "" });
  }

  async function save(formData: FormData) {
    setSaving(true);
    const result = await saveGearWishlist({
      leagueId,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      publish: formData.get("publish") === "true",
      expectedVersion: initial?.version,
      items,
    });
    setSaving(false);
    if (result.success) {
      setMessage("Wishlist saved.");
      router.refresh();
    } else {
      setMessage(result.error);
    }
  }

  return (
    <Card component="form" action={save} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        {message && <Alert severity={message === "Wishlist saved." ? "success" : "error"}>{message}</Alert>}
        <TextField name="title" label="Public title" defaultValue={initial?.title ?? "Association gear wishlist"} required />
        <TextField name="description" label="Public donation instructions" defaultValue={initial?.description ?? ""} multiline minRows={2} />
        <Typography variant="h6">Curated public items</Typography>
        {items.map((item, index) => (
          <Stack key={index} direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
            <TextField select label="Catalog item (optional)" value={item.catalogItemId} onChange={(event) => chooseCatalog(index, event.target.value)} sx={{ minWidth: { md: 220 } }}>
              <MenuItem value="">Custom snapshot</MenuItem>
              {catalogItems.map((catalogItem) => <MenuItem key={catalogItem.id} value={catalogItem.id}>{catalogItem.name}</MenuItem>)}
            </TextField>
            <TextField label="Item name" required value={item.nameSnapshot} onChange={(event) => updateItem(index, { nameSnapshot: event.target.value })} fullWidth />
            <TextField label="Target" type="number" inputProps={{ min: 1 }} value={item.targetQty} onChange={(event) => updateItem(index, { targetQty: Number(event.target.value) })} sx={{ minWidth: { md: 110 } }} />
            <IconButton aria-label="Remove wishlist item" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
              <DeleteOutline />
            </IconButton>
          </Stack>
        ))}
        <Button startIcon={<AddOutlined />} onClick={() => setItems((current) => [...current, { catalogItemId: "", nameSnapshot: "", categorySnapshot: "", sizeSnapshot: "", description: "", targetQty: 1 }])} sx={{ alignSelf: "start", minHeight: 44 }}>
          Add item
        </Button>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button type="submit" name="publish" value="false" disabled={saving} variant="outlined" sx={{ minHeight: 44 }}>Save draft</Button>
          <Button type="submit" name="publish" value="true" disabled={saving} variant="contained" sx={{ minHeight: 44 }}>Save and publish</Button>
        </Stack>
      </Stack>
    </Card>
  );
}
