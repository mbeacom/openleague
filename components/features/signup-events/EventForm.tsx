"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import {
  createSignupEvent,
  updateSignupEvent,
  listHostGroupOptions,
  type HostOption,
  type HostGroupOptions,
} from "@/lib/actions/signup-events";
import { PhaseEditor, type PhaseRow } from "./PhaseEditor";
import { AGE_CLASSIFICATION_LABELS, AGE_CLASSIFICATION_OPTIONS } from "@/lib/utils/age-level";
import {
  SIGNUP_EVENT_CATEGORIES,
  SIGNUP_EVENT_VISIBILITIES,
} from "@/lib/utils/validation";

const CATEGORY_LABELS: Record<(typeof SIGNUP_EVENT_CATEGORIES)[number], string> = {
  CLINIC: "Clinic / skills",
  SCRIMMAGE: "Scrimmage / game night",
  TRYOUT: "Tryout",
  VOLUNTEER: "Volunteer signup",
  FUNDRAISER: "Fundraiser",
  TOURNAMENT: "Tournament",
  SOCIAL: "Social",
  OTHER: "Other",
};

const VISIBILITY_HELP: Record<(typeof SIGNUP_EVENT_VISIBILITIES)[number], string> = {
  PRIVATE: "Only organizers can see this event.",
  INVITE_ONLY: "Only people you invite by email can view and register.",
  LINK: "Unlisted — anyone with the shareable link can view and register.",
  PUBLIC: "Listed on your public event pages and calendars.",
};

type SlotRow = {
  id?: string;
  name: string;
  description: string;
  capacity: string;
  priceDollars: string;
  waitlistEnabled: boolean;
  registrationCount?: number;
};

export type EventFormInitialValues = {
  eventId: string;
  title: string;
  description: string | null;
  category: (typeof SIGNUP_EVENT_CATEGORIES)[number];
  ageClassification: (typeof AGE_CLASSIFICATION_OPTIONS)[number];
  visibility: (typeof SIGNUP_EVENT_VISIBILITIES)[number];
  startAt: Date;
  endAt: Date;
  venueId: string | null;
  locationText: string | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  cancellationCutoffAt: Date | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  acceptsOnlinePayment: boolean;
  acceptsManualPayment: boolean;
  venmoHandle: string | null;
  zelleHandle: string | null;
  cashAppHandle: string | null;
  paymentPhone: string | null;
  paymentInstructions: string | null;
  galleryEnabled: boolean;
  publicRoster: boolean;
  slots: Array<{
    id: string;
    name: string;
    description: string | null;
    capacity: number | null;
    priceAmount: number | null;
    waitlistEnabled: boolean;
    registrationCount: number;
  }>;
  phases: Array<{
    id: string;
    name: string;
    opensAt: Date;
    audience: PhaseRow["audience"];
    divisionIds: string[];
    teamIds: string[];
  }>;
};

interface EventFormProps {
  hostOptions: HostOption[];
  venueOptions: Array<{ id: string; name: string; city: string | null; state: string | null }>;
  initialValues?: EventFormInitialValues;
  /** Fixed host in edit mode (host cannot change after creation). */
  host?: { kind: "organization" | "league" | "team"; id: string };
}

function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DEFAULT_SLOTS: SlotRow[] = [
  { name: "Skater", description: "", capacity: "40", priceDollars: "", waitlistEnabled: true },
  { name: "Goalie", description: "", capacity: "4", priceDollars: "", waitlistEnabled: true },
];

export function EventForm({ hostOptions, venueOptions, initialValues, host }: EventFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialValues);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [hostKey, setHostKey] = useState(
    hostOptions.length === 1 ? `${hostOptions[0].kind}:${hostOptions[0].id}` : ""
  );
  const [acceptsManual, setAcceptsManual] = useState(initialValues?.acceptsManualPayment ?? true);
  const [phases, setPhases] = useState<PhaseRow[]>(
    initialValues
      ? initialValues.phases.map((phase) => ({
          id: phase.id,
          name: phase.name,
          opensAt: toLocalInputValue(phase.opensAt),
          audience: phase.audience,
          divisionIds: phase.divisionIds,
          teamIds: phase.teamIds,
        }))
      : []
  );
  const [groupOptions, setGroupOptions] = useState<HostGroupOptions>({ divisions: [], teams: [] });

  // Load division/team pickers for the selected host (fixed host in edit mode).
  const activeHost = host ?? (hostKey ? { kind: hostKey.split(":")[0] as HostOption["kind"], id: hostKey.split(":")[1] } : null);
  const activeHostKey = activeHost ? `${activeHost.kind}:${activeHost.id}` : "";
  useEffect(() => {
    if (!activeHostKey) {
      return;
    }
    const [kind, id] = activeHostKey.split(":");
    let stale = false;
    listHostGroupOptions({ kind: kind as HostOption["kind"], id })
      .then((options) => {
        if (!stale) setGroupOptions(options);
      })
      .catch(() => {
        if (!stale) setGroupOptions({ divisions: [], teams: [] });
      });
    return () => {
      stale = true;
    };
  }, [activeHostKey]);
  const [slots, setSlots] = useState<SlotRow[]>(
    initialValues
      ? initialValues.slots.map((slot) => ({
          id: slot.id,
          name: slot.name,
          description: slot.description ?? "",
          capacity: slot.capacity != null ? String(slot.capacity) : "",
          priceDollars: slot.priceAmount != null && slot.priceAmount > 0 ? (slot.priceAmount / 100).toFixed(2) : "",
          waitlistEnabled: slot.waitlistEnabled,
          registrationCount: slot.registrationCount,
        }))
      : DEFAULT_SLOTS
  );

  const updateSlot = (index: number, patch: Partial<SlotRow>) => {
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    const optional = (name: string) => (text(name).length > 0 ? text(name) : undefined);
    const optionalDate = (name: string) => (text(name).length > 0 ? new Date(text(name)) : undefined);

    const slotInputs = slots
      .filter((slot) => slot.name.trim().length > 0)
      .map((slot, index) => ({
        id: slot.id,
        name: slot.name.trim(),
        description: slot.description.trim() || undefined,
        sortOrder: index,
        capacity: slot.capacity.trim() ? Number(slot.capacity) : undefined,
        priceAmount: slot.priceDollars.trim()
          ? Math.round(Number(slot.priceDollars) * 100)
          : undefined,
        waitlistEnabled: slot.waitlistEnabled,
      }));

    if (slotInputs.length === 0) {
      setError("Add at least one signup slot (e.g. Skater ×40).");
      return;
    }

    const base = {
      title: text("title"),
      description: optional("description"),
      category: text("category") as (typeof SIGNUP_EVENT_CATEGORIES)[number],
      ageClassification: text("ageClassification") as (typeof AGE_CLASSIFICATION_OPTIONS)[number],
      visibility: text("visibility") as (typeof SIGNUP_EVENT_VISIBILITIES)[number],
      startAt: new Date(text("startAt")),
      endAt: new Date(text("endAt")),
      venueId: optional("venueId"),
      locationText: optional("locationText"),
      registrationOpensAt: optionalDate("registrationOpensAt"),
      registrationClosesAt: optionalDate("registrationClosesAt"),
      cancellationCutoffAt: optionalDate("cancellationCutoffAt"),
      contactName: optional("contactName"),
      contactEmail: optional("contactEmail"),
      contactPhone: optional("contactPhone"),
      acceptsOnlinePayment: false,
      acceptsManualPayment: acceptsManual,
      venmoHandle: optional("venmoHandle"),
      zelleHandle: optional("zelleHandle"),
      cashAppHandle: optional("cashAppHandle"),
      paymentPhone: optional("paymentPhone"),
      paymentInstructions: optional("paymentInstructions"),
      galleryEnabled: formData.get("galleryEnabled") === "on",
      publicRoster: formData.get("publicRoster") === "on",
      slots: slotInputs,
      phases: phases
        .filter((phase) => phase.name.trim().length > 0 && phase.opensAt)
        .map((phase, index) => ({
          id: phase.id,
          name: phase.name.trim(),
          opensAt: new Date(phase.opensAt),
          audience: phase.audience,
          sortOrder: index,
          divisionIds: phase.audience === "SELECTED_GROUPS" ? phase.divisionIds : [],
          teamIds: phase.audience === "SELECTED_GROUPS" ? phase.teamIds : [],
        })),
    };

    startTransition(async () => {
      setError(null);
      setWarnings([]);

      if (isEdit && initialValues) {
        const result = await updateSignupEvent({ ...base, eventId: initialValues.eventId });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setWarnings(result.data.warnings);
        router.push(`/signup-events/${initialValues.eventId}`);
        router.refresh();
        return;
      }

      const [kind, hostId] = hostKey.split(":");
      const result = await createSignupEvent({
        ...base,
        hostOrganizationId: kind === "organization" ? hostId : undefined,
        hostLeagueId: kind === "league" ? hostId : undefined,
        hostTeamId: kind === "team" ? hostId : undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/signup-events/${result.data.eventId}`);
      router.refresh();
    });
  };

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={3}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {warnings.map((warning) => (
        <Alert key={warning} severity="warning">
          {warning}
        </Alert>
      ))}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Event details</Typography>
            {!isEdit ? (
              <TextField
                select
                required
                label="Hosted by"
                value={hostKey}
                onChange={(event) => setHostKey(event.target.value)}
                helperText="The rink, association, or team hosting this event"
              >
                {hostOptions.map((option) => (
                  <MenuItem key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>
                    {option.name}
                    {option.kind === "organization" ? " (rink)" : option.kind === "league" ? " (association)" : " (team)"}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <TextField
              name="title"
              label="Title"
              required
              defaultValue={initialValues?.title ?? ""}
              placeholder="Mite Night"
              slotProps={{ htmlInput: { maxLength: 150 } }}
            />
            <TextField
              name="description"
              label="Description"
              multiline
              minRows={3}
              defaultValue={initialValues?.description ?? ""}
              slotProps={{ htmlInput: { maxLength: 5000 } }}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                name="category"
                label="Category"
                fullWidth
                defaultValue={initialValues?.category ?? "OTHER"}
              >
                {SIGNUP_EVENT_CATEGORIES.map((category) => (
                  <MenuItem key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                name="ageClassification"
                label="Age / level"
                fullWidth
                defaultValue={initialValues?.ageClassification ?? "OPEN"}
              >
                {AGE_CLASSIFICATION_OPTIONS.map((level) => (
                  <MenuItem key={level} value={level}>
                    {AGE_CLASSIFICATION_LABELS[level]}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                name="startAt"
                label="Starts"
                type="datetime-local"
                required
                fullWidth
                defaultValue={toLocalInputValue(initialValues?.startAt ?? null)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                name="endAt"
                label="Ends"
                type="datetime-local"
                required
                fullWidth
                defaultValue={toLocalInputValue(initialValues?.endAt ?? null)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                name="venueId"
                label="Venue (optional)"
                fullWidth
                defaultValue={initialValues?.venueId ?? ""}
              >
                <MenuItem value="">No venue / enter location below</MenuItem>
                {venueOptions.map((venue) => (
                  <MenuItem key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.city ? ` — ${venue.city}${venue.state ? `, ${venue.state}` : ""}` : ""}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                name="locationText"
                label="Location notes (optional)"
                fullWidth
                defaultValue={initialValues?.locationText ?? ""}
                placeholder="North rink — enter through door B"
                slotProps={{ htmlInput: { maxLength: 300 } }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">Signup slots</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={() =>
                  setSlots((current) => [
                    ...current,
                    { name: "", description: "", capacity: "", priceDollars: "", waitlistEnabled: true },
                  ])
                }
              >
                Add slot
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Each slot has its own capacity — e.g. Goalie ×4, Skater ×40, Referee ×4, Coach ×8.
              Leave capacity blank for unlimited. Prices are per participant.
            </Typography>
            {slots.map((slot, index) => (
              <Box key={slot.id ?? `new-${index}`}>
                {index > 0 ? <Divider sx={{ mb: 2 }} /> : null}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                  <TextField
                    label="Slot name"
                    value={slot.name}
                    required
                    onChange={(event) => updateSlot(index, { name: event.target.value })}
                    sx={{ flex: 2 }}
                    slotProps={{ htmlInput: { maxLength: 100 } }}
                  />
                  <TextField
                    label="Capacity"
                    type="number"
                    value={slot.capacity}
                    onChange={(event) => updateSlot(index, { capacity: event.target.value })}
                    sx={{ flex: 1 }}
                    slotProps={{ htmlInput: { min: 1, max: 10000 } }}
                  />
                  <TextField
                    label="Price ($)"
                    type="number"
                    value={slot.priceDollars}
                    onChange={(event) => updateSlot(index, { priceDollars: event.target.value })}
                    sx={{ flex: 1 }}
                    slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={slot.waitlistEnabled}
                        onChange={(event) => updateSlot(index, { waitlistEnabled: event.target.checked })}
                      />
                    }
                    label="Waitlist"
                  />
                  <IconButton
                    aria-label={`Remove slot ${slot.name || index + 1}`}
                    onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
                    disabled={Boolean(slot.registrationCount)}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
                {slot.registrationCount ? (
                  <Typography variant="caption" color="text.secondary">
                    {slot.registrationCount} registration{slot.registrationCount === 1 ? "" : "s"} — this slot can&apos;t be removed
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Registration & visibility</Typography>
            <TextField
              select
              name="visibility"
              label="Visibility"
              defaultValue={initialValues?.visibility ?? "PRIVATE"}
              helperText="Private → invite-only → link → public"
            >
              {SIGNUP_EVENT_VISIBILITIES.map((visibility) => (
                <MenuItem key={visibility} value={visibility}>
                  {visibility.replace("_", " ").toLowerCase()} — {VISIBILITY_HELP[visibility]}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                name="registrationOpensAt"
                label="Registration opens (optional)"
                type="datetime-local"
                fullWidth
                defaultValue={toLocalInputValue(initialValues?.registrationOpensAt ?? null)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                name="registrationClosesAt"
                label="Registration closes (optional)"
                type="datetime-local"
                fullWidth
                defaultValue={toLocalInputValue(initialValues?.registrationClosesAt ?? null)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                name="cancellationCutoffAt"
                label="Cancellation cutoff (optional)"
                type="datetime-local"
                fullWidth
                defaultValue={toLocalInputValue(initialValues?.cancellationCutoffAt ?? null)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            <FormControlLabel
              control={<Switch name="publicRoster" defaultChecked={initialValues?.publicRoster ?? false} />}
              label="Show a public roster (first name + last initial only)"
            />
            <FormControlLabel
              control={<Switch name="galleryEnabled" defaultChecked={initialValues?.galleryEnabled ?? true} />}
              label="Allow participants to share photos and videos"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <PhaseEditor phases={phases} onChange={setPhases} groupOptions={groupOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Payment</Typography>
            <Typography variant="body2" color="text.secondary">
              For priced slots, share how people can pay you. Online card payment can be enabled once
              your organization completes payment onboarding.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={acceptsManual}
                  onChange={(event) => setAcceptsManual(event.target.checked)}
                />
              }
              label="Accept Venmo / Zelle / Cash App / cash"
            />
            {acceptsManual ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap" useFlexGap>
                <TextField name="venmoHandle" label="Venmo handle" defaultValue={initialValues?.venmoHandle ?? ""} placeholder="@my-association" slotProps={{ htmlInput: { maxLength: 60 } }} />
                <TextField name="cashAppHandle" label="Cash App cashtag" defaultValue={initialValues?.cashAppHandle ?? ""} placeholder="$myassociation" slotProps={{ htmlInput: { maxLength: 60 } }} />
                <TextField name="zelleHandle" label="Zelle (email or phone)" defaultValue={initialValues?.zelleHandle ?? ""} slotProps={{ htmlInput: { maxLength: 120 } }} />
                <TextField name="paymentPhone" label="Payment phone" defaultValue={initialValues?.paymentPhone ?? ""} slotProps={{ htmlInput: { maxLength: 30 } }} />
                <TextField
                  name="paymentInstructions"
                  label="Payment instructions"
                  fullWidth
                  multiline
                  minRows={2}
                  defaultValue={initialValues?.paymentInstructions ?? ""}
                  placeholder="Cash accepted at the door. Include your skater's name in the payment note."
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                />
              </Stack>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Contact (optional)</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField name="contactName" label="Contact name" fullWidth defaultValue={initialValues?.contactName ?? ""} slotProps={{ htmlInput: { maxLength: 100 } }} />
              <TextField name="contactEmail" label="Contact email" type="email" fullWidth defaultValue={initialValues?.contactEmail ?? ""} slotProps={{ htmlInput: { maxLength: 254 } }} />
              <TextField name="contactPhone" label="Contact phone" fullWidth defaultValue={initialValues?.contactPhone ?? ""} slotProps={{ htmlInput: { maxLength: 30 } }} />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button onClick={() => router.back()} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={isPending || (!isEdit && !hostKey)}>
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create draft event"}
        </Button>
      </Stack>
    </Stack>
  );
}
