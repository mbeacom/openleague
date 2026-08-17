"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Archive, Edit, SwapHoriz } from "@mui/icons-material";
import { useRouter } from "next/navigation";
import type { GearInventoryContext } from "@/lib/actions/gear-context";
import {
  adjustGearPoolStock,
  archiveGearCatalogItem,
  archiveGearStorageLocation,
  changeGearUnitCondition,
  createGearCatalogItem,
  createGearStorageLocation,
  createGearUnit,
  retireGearUnit,
  transferGearPoolStock,
  transferGearUnit,
  unretireGearUnit,
  updateGearCatalogItem,
  updateGearStorageLocation,
  updateGearUnit,
} from "@/lib/actions/gear-inventory";

type Props = { data: GearInventoryContext };
type DialogState =
  | { kind: "location"; location?: GearInventoryContext["locations"][number] }
  | { kind: "catalog"; item?: GearInventoryContext["catalogItems"][number] }
  | { kind: "adjust"; stock?: GearInventoryContext["pooledStock"][number] }
  | { kind: "pool-transfer"; stock: GearInventoryContext["pooledStock"][number] }
  | { kind: "unit"; unit?: GearInventoryContext["units"][number] }
  | { kind: "unit-transfer"; unit: GearInventoryContext["units"][number] }
  | { kind: "unit-condition"; unit: GearInventoryContext["units"][number] }
  | { kind: "unit-retire"; unit: GearInventoryContext["units"][number] }
  | { kind: "unit-unretire"; unit: GearInventoryContext["units"][number] };

const conditions = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;

function conditionLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatActivityTimestamp(value: string) {
  return `${value.slice(0, 16).replace("T", " ")} UTC`;
}

function statusColor(status: string) {
  if (status === "AVAILABLE") return "success";
  if (status === "RETIRED" || status === "LOST") return "default";
  if (status === "MAINTENANCE") return "warning";
  return "info";
}

function MetricCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography variant="h4" component="p">{value}</Typography>
        <Typography variant="body2" color="text.secondary">{helper}</Typography>
      </CardContent>
    </Card>
  );
}

export function GearInventoryManager({ data }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [activitySearch, setActivitySearch] = useState(data.recentActivity.search);

  const filteredStock = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data.pooledStock;
    return data.pooledStock.filter((stock) =>
      `${stock.catalogName} ${stock.category} ${stock.locationName} ${stock.condition}`.toLowerCase().includes(query),
    );
  }, [data.pooledStock, search]);
  const filteredUnits = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data.units;
    return data.units.filter((unit) =>
      `${unit.catalogName} ${unit.assetTag ?? ""} ${unit.status} ${unit.currentLocationName ?? ""}`.toLowerCase().includes(query),
    );
  }, [data.units, search]);

  function submit(run: () => Promise<{ success: boolean; error?: string; details?: unknown }>) {
    setFeedback(null);
    setDialogError(null);
    startTransition(async () => {
      const result = await run();
      if (result.success) {
        setDialog(null);
        router.refresh();
      } else {
        const fieldDetails = Array.isArray(result.details)
          ? result.details
              .map((detail) => typeof detail === "object" && detail !== null && "path" in detail && "message" in detail
                ? `${Array.isArray(detail.path) ? detail.path.join(".") : "Field"}: ${String(detail.message)}`
                : null)
              .filter(Boolean)
              .join(" ")
          : "";
        const message = [result.error ?? "Unable to save inventory.", fieldDetails].filter(Boolean).join(" ");
        setFeedback(message);
        setDialogError(message);
        if ((result.error ?? "").startsWith("Inventory changed while saving")) router.refresh();
      }
    });
  }

  function archive(run: () => Promise<{ success: boolean; error?: string }>) {
    submit(run);
  }

  function navigateActivity(page: number, value = activitySearch) {
    const params = new URLSearchParams();
    if (value.trim()) params.set("activitySearch", value.trim());
    if (page > 1) params.set("activityPage", String(page));
    router.push(`${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <Stack spacing={3}>
      {feedback && !dialog ? <Alert severity="error" onClose={() => setFeedback(null)}>{feedback}</Alert> : null}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
          gap: 2,
        }}
      >
        <MetricCard label="Pooled on hand" value={data.summary.pooledOnHand} helper="All locations" />
        <MetricCard label="Pooled available" value={data.summary.pooledAvailable} helper="After commitments" />
        <MetricCard label="Tagged units" value={data.summary.taggedUnits} helper="Tracked individually" />
        <MetricCard label="Ready units" value={data.summary.taggedAvailable} helper="Available to assign" />
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between">
        <TextField
          label="Search inventory"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          inputProps={{ "aria-label": "Search inventory" }}
          sx={{ minWidth: { sm: 280 } }}
        />
        {data.canManageInventory ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" startIcon={<Add />} onClick={() => setDialog({ kind: "location" })} sx={{ minHeight: 44 }}>
              Location
            </Button>
            <Button variant="outlined" startIcon={<Add />} onClick={() => setDialog({ kind: "catalog" })} sx={{ minHeight: 44 }}>
              Catalog item
            </Button>
            <Button variant="outlined" startIcon={<Add />} onClick={() => setDialog({ kind: "adjust" })} sx={{ minHeight: 44 }}>
              Pooled stock
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDialog({ kind: "unit" })} sx={{ minHeight: 44 }}>
              Tagged unit
            </Button>
          </Stack>
        ) : null}
      </Stack>
      {data.pooledStock.length === 0 && data.units.length === 0 ? (
        <Alert severity="info" role="status">
          Start by adding a storage location and catalog item, then record your first inventory.
        </Alert>
      ) : null}

      <InventorySection title="Pooled stock" empty="No pooled inventory matches this search." count={filteredStock.length}>
        {filteredStock.map((stock) => (
          <Card key={stock.id} variant="outlined" sx={{ display: { xs: "block", md: "none" } }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography fontWeight={700}>{stock.catalogName}</Typography>
                <Typography variant="body2" color="text.secondary">{stock.locationName} · {conditionLabel(stock.condition)}</Typography>
                <Typography>{stock.availableQuantity} available of {stock.quantityOnHand}</Typography>
                {data.canManageInventory ? (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => setDialog({ kind: "adjust", stock })}>Adjust</Button>
                    <Button size="small" onClick={() => setDialog({ kind: "pool-transfer", stock })}>Transfer</Button>
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        ))}
        <TableContainer component={Card} variant="outlined" sx={{ display: { xs: "none", md: "block" } }}>
          <Table aria-label="Pooled inventory">
            <TableHead><TableRow><TableCell>Item</TableCell><TableCell>Location</TableCell><TableCell>Condition</TableCell><TableCell align="right">On hand</TableCell><TableCell align="right">Committed</TableCell><TableCell align="right">Available</TableCell>{data.canManageInventory ? <TableCell /> : null}</TableRow></TableHead>
            <TableBody>
              {filteredStock.map((stock) => (
                <TableRow key={stock.id}>
                  <TableCell>{stock.catalogName}</TableCell><TableCell>{stock.locationName}</TableCell><TableCell>{conditionLabel(stock.condition)}</TableCell>
                  <TableCell align="right">{stock.quantityOnHand}</TableCell><TableCell align="right">{stock.committedQuantity}</TableCell><TableCell align="right">{stock.availableQuantity}</TableCell>
                  {data.canManageInventory ? <TableCell align="right"><Button size="small" onClick={() => setDialog({ kind: "adjust", stock })}>Adjust</Button><Button size="small" onClick={() => setDialog({ kind: "pool-transfer", stock })}>Transfer</Button></TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </InventorySection>

      <InventorySection title="Tagged units" empty="No tagged units match this search." count={filteredUnits.length}>
        {filteredUnits.map((unit) => (
          <Card key={unit.id} variant="outlined" sx={{ display: { xs: "block", md: "none" } }}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between"><Typography fontWeight={700}>{unit.catalogName}</Typography><Chip size="small" label={conditionLabel(unit.status)} color={statusColor(unit.status)} /></Stack>
                <Typography variant="body2" color="text.secondary">{unit.assetTag ?? "No asset tag"} · {unit.currentLocationName ?? "No location"} · {conditionLabel(unit.currentCondition)}</Typography>
                {data.canManageInventory ? <UnitActions unit={unit} open={setDialog} /> : null}
              </Stack>
            </CardContent>
          </Card>
        ))}
        <TableContainer component={Card} variant="outlined" sx={{ display: { xs: "none", md: "block" } }}>
          <Table aria-label="Tagged gear units">
            <TableHead><TableRow><TableCell>Item</TableCell><TableCell>Asset tag</TableCell><TableCell>Location</TableCell><TableCell>Condition</TableCell><TableCell>Status</TableCell>{data.canManageInventory ? <TableCell /> : null}</TableRow></TableHead>
            <TableBody>{filteredUnits.map((unit) => (
              <TableRow key={unit.id}><TableCell>{unit.catalogName}</TableCell><TableCell>{unit.assetTag ?? "—"}</TableCell><TableCell>{unit.currentLocationName ?? "—"}</TableCell><TableCell>{conditionLabel(unit.currentCondition)}</TableCell><TableCell><Chip size="small" label={conditionLabel(unit.status)} color={statusColor(unit.status)} /></TableCell>{data.canManageInventory ? <TableCell><UnitActions unit={unit} open={setDialog} /></TableCell> : null}</TableRow>
            ))}</TableBody>
          </Table>
        </TableContainer>
      </InventorySection>

      {data.canManageInventory ? (
        <>
          <InventorySection title="Storage locations" empty="No storage locations have been created." count={data.locations.length}>
            {data.locations.map((location) => (
              <Card key={location.id} variant="outlined"><CardContent><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}><Box><Typography fontWeight={700}>{location.name}</Typography><Typography variant="body2" color="text.secondary">{location.address ?? "No address"}</Typography>{location.privateNotes ? <Typography variant="body2" sx={{ mt: 1 }}>Admin note: {location.privateNotes}</Typography> : null}</Box><Stack direction="row"><Button aria-label={`Edit ${location.name}`} onClick={() => setDialog({ kind: "location", location })}><Edit /></Button>{location.isActive ? <Button aria-label={`Archive ${location.name}`} onClick={() => archive(() => archiveGearStorageLocation({ leagueId: data.league.id, locationId: location.id }))}><Archive /></Button> : null}</Stack></Stack></CardContent></Card>
            ))}
          </InventorySection>
          <InventorySection title="Catalog" empty="No catalog items have been created." count={data.catalogItems.length}>
            {data.catalogItems.map((item) => (
              <Card key={item.id} variant="outlined"><CardContent><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}><Box><Typography fontWeight={700}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.category}{item.size ? ` · ${item.size}` : ""} · {conditionLabel(item.trackingMode)}</Typography></Box><Stack direction="row"><Button aria-label={`Edit ${item.name}`} onClick={() => setDialog({ kind: "catalog", item })}><Edit /></Button>{item.isActive ? <Button aria-label={`Archive ${item.name}`} onClick={() => archive(() => archiveGearCatalogItem({ leagueId: data.league.id, catalogItemId: item.id }))}><Archive /></Button> : null}</Stack></Stack></CardContent></Card>
            ))}
          </InventorySection>
          <Stack spacing={1.5}>
            <Typography variant="h5" component="h2">Recent inventory activity</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField label="Search activity" value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} />
              <Button variant="outlined" onClick={() => navigateActivity(1)} sx={{ minHeight: 44 }}>Search</Button>
            </Stack>
          <InventorySection title="Movement results" empty={data.recentActivity.search ? "No inventory movements match this search." : "No inventory movements have been recorded."} count={data.recentActivity.items.length}>
            {data.recentActivity.items.map((activity) => <Card key={activity.id} variant="outlined"><CardContent><Typography fontWeight={700}>{activity.catalogName ?? "Inventory item"}{activity.assetTag ? ` · ${activity.assetTag}` : ""} · {conditionLabel(activity.type)} {activity.direction.toLowerCase()} · {activity.quantity}</Typography><Typography variant="body2" color="text.secondary">{activity.beforeLocationName ?? "—"} <SwapHoriz fontSize="inherit" /> {activity.afterLocationName ?? "—"} · {conditionLabel(activity.beforeCondition ?? "—")} → {conditionLabel(activity.afterCondition ?? "—")} · {formatActivityTimestamp(activity.occurredAt)}{activity.actorName ? ` · ${activity.actorName}` : ""}</Typography>{activity.notes ? <Typography variant="body2">{activity.notes}</Typography> : null}</CardContent></Card>)}
            <Stack direction="row" spacing={1}>
              <Button disabled={data.recentActivity.page === 1} onClick={() => navigateActivity(data.recentActivity.page - 1)} sx={{ minHeight: 44 }}>Previous</Button>
              <Button disabled={!data.recentActivity.hasMore} onClick={() => navigateActivity(data.recentActivity.page + 1)} sx={{ minHeight: 44 }}>Next</Button>
            </Stack>
          </InventorySection>
          </Stack>
        </>
      ) : null}

      <GearDialog dialog={dialog} close={() => { setDialog(null); setDialogError(null); }} data={data} pending={isPending} error={dialogError} submit={submit} />
    </Stack>
  );
}

function InventorySection({ title, empty, count, children }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return <Stack spacing={1.5}><Typography variant="h5" component="h2">{title}</Typography>{count > 0 ? children : <Typography color="text.secondary">{empty}</Typography>}</Stack>;
}

function UnitActions({ unit, open }: { unit: GearInventoryContext["units"][number]; open: (state: DialogState) => void }) {
  return <Stack direction="row" spacing={0.5}><>{!["RETIRED", "LOST"].includes(unit.status) ? <Button size="small" onClick={() => open({ kind: "unit", unit })}>Edit</Button> : null}</>{["AVAILABLE", "MAINTENANCE"].includes(unit.status) ? <><Button size="small" onClick={() => open({ kind: "unit-transfer", unit })}>Transfer</Button><Button size="small" onClick={() => open({ kind: "unit-condition", unit })}>Condition</Button><Button size="small" color="error" onClick={() => open({ kind: "unit-retire", unit })}>Retire</Button></> : null}{unit.status === "RETIRED" ? <Button size="small" onClick={() => open({ kind: "unit-unretire", unit })}>Return to inventory</Button> : null}</Stack>;
}

function GearDialog({ dialog, close, data, pending, error, submit }: {
  dialog: DialogState | null; close: () => void; data: GearInventoryContext; pending: boolean;
  error: string | null;
  submit: (run: () => Promise<{ success: boolean; error?: string; details?: unknown }>) => void;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  if (!dialog) return null;
  const unitCatalog = data.catalogItems.filter((item) => item.trackingMode === "INDIVIDUAL" && item.isActive);
  const pooledCatalog = data.catalogItems.filter((item) => item.trackingMode === "POOLED" && item.isActive);
  const title = dialog.kind === "location" ? `${dialog.location ? "Edit" : "Add"} storage location` : dialog.kind === "catalog" ? `${dialog.item ? "Edit" : "Add"} catalog item` : dialog.kind === "adjust" ? "Adjust pooled stock" : dialog.kind === "pool-transfer" ? "Transfer pooled stock" : dialog.kind === "unit-transfer" ? "Transfer tagged unit" : dialog.kind === "unit-condition" ? "Change unit condition" : dialog.kind === "unit-retire" ? "Retire tagged unit" : dialog.kind === "unit-unretire" ? "Return tagged unit to inventory" : `${dialog.unit ? "Edit" : "Add"} tagged unit`;
  return <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="gear-inventory-dialog-title" PaperProps={{ component: "form", onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    if (dialog.kind === "location") submit(() => dialog.location ? updateGearStorageLocation({ leagueId: data.league.id, locationId: dialog.location.id, name: value("name"), address: value("address"), privateNotes: value("privateNotes") }) : createGearStorageLocation({ leagueId: data.league.id, name: value("name"), address: value("address"), privateNotes: value("privateNotes") }));
    if (dialog.kind === "catalog") submit(() => dialog.item ? updateGearCatalogItem({ leagueId: data.league.id, catalogItemId: dialog.item.id, name: value("name"), category: value("category"), size: value("size"), brand: value("brand"), model: value("model"), description: value("description"), trackingMode: value("trackingMode") }) : createGearCatalogItem({ leagueId: data.league.id, name: value("name"), category: value("category"), size: value("size"), brand: value("brand"), model: value("model"), description: value("description"), trackingMode: value("trackingMode") as "POOLED" | "INDIVIDUAL" }));
    if (dialog.kind === "adjust") submit(() => adjustGearPoolStock({ leagueId: data.league.id, catalogItemId: value("catalogItemId"), locationId: value("locationId"), condition: value("condition") as typeof conditions[number], quantityDelta: Number(value("quantityDelta")), expectedVersion: Number(value("expectedVersion")), notes: value("notes") }));
    if (dialog.kind === "pool-transfer") submit(() => transferGearPoolStock({ leagueId: data.league.id, catalogItemId: dialog.stock.catalogItemId, sourceLocationId: dialog.stock.locationId, destinationLocationId: value("destinationLocationId"), condition: dialog.stock.condition, quantity: Number(value("quantity")), expectedSourceVersion: dialog.stock.version, notes: value("notes") }));
    if (dialog.kind === "unit") submit(() => dialog.unit ? updateGearUnit({ leagueId: data.league.id, unitId: dialog.unit.id, expectedVersion: dialog.unit.version!, assetTag: value("assetTag"), serialNumber: value("serialNumber"), acquiredAt: value("acquiredAt"), notes: value("notes") }) : createGearUnit({ leagueId: data.league.id, catalogItemId: value("catalogItemId"), currentLocationId: value("currentLocationId"), assetTag: value("assetTag"), serialNumber: value("serialNumber"), currentCondition: value("currentCondition") as typeof conditions[number], acquiredAt: value("acquiredAt"), notes: value("notes") }));
    if (dialog.kind === "unit-transfer") submit(() => transferGearUnit({ leagueId: data.league.id, unitId: dialog.unit.id, expectedVersion: dialog.unit.version!, destinationLocationId: value("destinationLocationId"), notes: value("notes") }));
    if (dialog.kind === "unit-condition") submit(() => changeGearUnitCondition({ leagueId: data.league.id, unitId: dialog.unit.id, expectedVersion: dialog.unit.version!, condition: value("condition") as typeof conditions[number], notes: value("notes") }));
    if (dialog.kind === "unit-retire") submit(() => retireGearUnit({ leagueId: data.league.id, unitId: dialog.unit.id, expectedVersion: dialog.unit.version!, notes: value("notes") }));
    if (dialog.kind === "unit-unretire") submit(() => unretireGearUnit({ leagueId: data.league.id, unitId: dialog.unit.id, expectedVersion: dialog.unit.version!, destinationLocationId: value("destinationLocationId"), condition: value("condition") as typeof conditions[number], notes: value("notes") }));
  } }}>
    <DialogTitle id="gear-inventory-dialog-title">{title}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error ? <Alert ref={errorRef} severity="error" role="alert" tabIndex={-1}>{error}</Alert> : null}
      {dialog.kind === "location" ? <><TextField required name="name" label="Location name" defaultValue={dialog.location?.name} inputProps={{ maxLength: 120 }} /><TextField name="address" label="Address" defaultValue={dialog.location?.address ?? ""} /><TextField name="privateNotes" label="Admin-only notes" defaultValue={dialog.location?.privateNotes ?? ""} multiline minRows={2} /></> : null}
      {dialog.kind === "catalog" ? <><TextField required name="name" label="Item name" defaultValue={dialog.item?.name} /><TextField required name="category" label="Category" defaultValue={dialog.item?.category} /><TextField name="size" label="Size" defaultValue={dialog.item?.size ?? ""} /><TextField name="brand" label="Brand" defaultValue={dialog.item?.brand ?? ""} /><TextField name="model" label="Model" defaultValue={dialog.item?.model ?? ""} /><TextField name="description" label="Description" defaultValue={dialog.item?.description ?? ""} multiline minRows={2} /><SelectField name="trackingMode" label="Tracking mode" defaultValue={dialog.item?.trackingMode ?? "POOLED"} options={[["POOLED", "Pooled stock"], ["INDIVIDUAL", "Individually tagged"]]} /></> : null}
      {dialog.kind === "adjust" ? <><SelectField name="catalogItemId" label="Catalog item" defaultValue={dialog.stock?.catalogItemId ?? pooledCatalog[0]?.id ?? ""} options={pooledCatalog.map((item) => [item.id, item.name])} /><SelectField name="locationId" label="Storage location" defaultValue={dialog.stock?.locationId ?? data.locations.find((location) => location.isActive)?.id ?? ""} options={data.locations.filter((location) => location.isActive).map((location) => [location.id, location.name])} /><SelectField name="condition" label="Condition" defaultValue={dialog.stock?.condition ?? "GOOD"} options={conditions.map((condition) => [condition, conditionLabel(condition)])} /><TextField required name="quantityDelta" type="number" label={dialog.stock ? "Adjustment (+/-)" : "Initial quantity"} inputProps={{ step: 1, min: dialog.stock ? undefined : 1 }} /><input type="hidden" name="expectedVersion" value={dialog.stock?.version ?? 0} /><TextField name="notes" label="Reason / notes" multiline minRows={2} /></> : null}
      {dialog.kind === "pool-transfer" ? <><Typography>{dialog.stock.catalogName}: {dialog.stock.quantityOnHand} on hand at {dialog.stock.locationName}</Typography><SelectField name="destinationLocationId" label="Destination" defaultValue="" options={data.locations.filter((location) => location.isActive && location.id !== dialog.stock.locationId).map((location) => [location.id, location.name])} /><TextField required name="quantity" type="number" label="Quantity" inputProps={{ min: 1, max: dialog.stock.availableQuantity }} /><TextField name="notes" label="Notes" /></> : null}
      {dialog.kind === "unit" ? <><>{!dialog.unit ? <><SelectField name="catalogItemId" label="Catalog item" defaultValue={unitCatalog[0]?.id ?? ""} options={unitCatalog.map((item) => [item.id, item.name])} /><SelectField name="currentLocationId" label="Storage location" defaultValue={data.locations.find((location) => location.isActive)?.id ?? ""} options={data.locations.filter((location) => location.isActive).map((location) => [location.id, location.name])} /><SelectField name="currentCondition" label="Condition" defaultValue="GOOD" options={conditions.map((condition) => [condition, conditionLabel(condition)])} /></> : null}</><TextField required name="assetTag" label="Asset tag" defaultValue={dialog.unit?.assetTag ?? ""} /><TextField name="serialNumber" label="Serial number" defaultValue={dialog.unit?.serialNumber ?? ""} /><TextField name="acquiredAt" label="Acquired date" type="date" defaultValue={dialog.unit?.acquiredAt?.slice(0, 10) ?? ""} InputLabelProps={{ shrink: true }} /><TextField name="notes" label="Notes" defaultValue={dialog.unit?.notes ?? ""} multiline minRows={2} /></> : null}
      {dialog.kind === "unit-transfer" ? <><Typography>{dialog.unit.catalogName} · {dialog.unit.assetTag}</Typography><SelectField name="destinationLocationId" label="Destination" defaultValue="" options={data.locations.filter((location) => location.isActive && location.id !== dialog.unit.currentLocationId).map((location) => [location.id, location.name])} /><TextField name="notes" label="Notes" /></> : null}
      {dialog.kind === "unit-condition" ? <><Typography>{dialog.unit.catalogName} · {dialog.unit.assetTag}</Typography><SelectField name="condition" label="New condition" defaultValue={dialog.unit.currentCondition} options={conditions.map((condition) => [condition, conditionLabel(condition)])} /><TextField name="notes" label="Notes" /></> : null}
      {dialog.kind === "unit-retire" ? <><Alert severity="warning">This will remove the unit from active inventory.</Alert><TextField required name="notes" label="Retirement reason" multiline minRows={2} /></> : null}
      {dialog.kind === "unit-unretire" ? <><Alert severity="info">This creates a new receipt and activity record; retirement history is preserved.</Alert><SelectField name="destinationLocationId" label="Destination" defaultValue={data.locations.find((location) => location.isActive)?.id ?? ""} options={data.locations.filter((location) => location.isActive).map((location) => [location.id, location.name])} /><SelectField name="condition" label="Current condition" defaultValue={dialog.unit.currentCondition} options={conditions.map((condition) => [condition, conditionLabel(condition)])} /><TextField required name="notes" label="Return reason" multiline minRows={2} /></> : null}
    </Stack></DialogContent>
    <DialogActions><Button onClick={close} disabled={pending}>Cancel</Button><Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>{pending ? "Saving…" : "Save"}</Button></DialogActions>
  </Dialog>;
}

function SelectField({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: Array<readonly [string, string]> }) {
  return <FormControl fullWidth required><InputLabel id={`${name}-label`}>{label}</InputLabel><Select labelId={`${name}-label`} name={name} label={label} defaultValue={defaultValue}>{options.map(([value, optionLabel]) => <MenuItem key={value} value={value}>{optionLabel}</MenuItem>)}</Select></FormControl>;
}
