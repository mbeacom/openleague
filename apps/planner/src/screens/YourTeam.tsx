/**
 * "Your team" (practice logo spec R4): the device's team name, logo and
 * colors, shown on every practice on this device. Plan files never include it.
 */
import { useCallback, useRef, useState, type ChangeEvent } from "react";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DeleteOutline as RemoveIcon, FileUploadOutlined as UploadIcon, GroupsOutlined as TeamIcon } from "@mui/icons-material";
import { Crest } from "@/components/ui/Crest";
import { LOGO_ACCEPT } from "@/lib/media/logo-rules";
import { LOGO_UNREADABLE_MESSAGE, normalizeLogoFile } from "@/lib/utils/canvas/logo-file";
import { TEAM_NAME_MAX, isTeamColor, teamProfileErrors, type TeamProfileField, type TeamProfileInput } from "@/lib/utils/team-mark";
import type { LogoImage, TeamProfile } from "@/types/practice-planner";
import { LOCAL_TEAM_ID } from "../config";
import { TEAM_PROFILE_LOAD_FAILED } from "../store/team-profile";
import type { LocalPlannerStore } from "../store/types";
import { useStoreResult } from "./useStoreResult";
import { useTeamProfileVersion } from "./useTeamProfile";

export const YOUR_TEAM_INTRO = "Shown on your practices, bench sheets and exports on this device. Plan files never include it.";
export const CLEAR_TEAM_PROMPT = "Clear team? This removes the name, logo and colors from this device.";
export const CLEAR_TEAM_CONFIRM = "Clear";
export const CLEAR_TEAM_KEEP = "Keep";
const TARGET = { minHeight: 44 } as const;

/**
 * The native picker's value while the field holds no color: one nobody picks,
 * so choosing any real color (#0D47A1 included) is a change and fires.
 */
const EMPTY_PICKER_VALUE = "#010203";

/** A 44 px color picker: the native input, invisible, over a swatch that shows the color or a slashed empty box. */
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const color = isTeamColor(value) ? value.toUpperCase() : null;
    return (
        <Box
            sx={{
                position: "relative",
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 1,
                "&:focus-within": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
            }}
        >
            <Box
                aria-hidden
                data-testid={`${label.split(" ")[0].toLowerCase()}-color-swatch`}
                data-empty={color ? "false" : "true"}
                sx={(theme) => {
                    const ink = (theme.vars ?? theme).palette.text.secondary;
                    return {
                        position: "absolute",
                        inset: 4,
                        borderRadius: 0.5,
                        border: 1,
                        borderColor: color ? "divider" : "text.secondary",
                        bgcolor: color ?? "transparent",
                        // Empty: a diagonal slash, the usual "no color" mark.
                        backgroundImage: color
                            ? "none"
                            : `linear-gradient(to top right, transparent calc(50% - 1px), ${ink} calc(50% - 1px), ${ink} calc(50% + 1px), transparent calc(50% + 1px))`,
                    };
                }}
            />
            <Box
                component="input"
                type="color"
                aria-label={`Pick ${label.toLowerCase()}`}
                value={color ? color.toLowerCase() : EMPTY_PICKER_VALUE}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.toUpperCase())}
                sx={{ position: "absolute", inset: 0, width: 44, height: 44, m: 0, p: 0, border: 0, opacity: 0, cursor: "pointer" }}
            />
        </Box>
    );
}

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
    return (
        <TextField
            label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            error={Boolean(error)}
            helperText={error ?? "Optional, like #0D47A1"}
            placeholder="#0D47A1"
            fullWidth
            slotProps={{
                htmlInput: { maxLength: 7, spellCheck: false, autoCapitalize: "off" },
                input: {
                    endAdornment: <ColorPicker label={label} value={value} onChange={onChange} />,
                },
            }}
        />
    );
}

export function TeamProfileDialog({
    store,
    initial,
    loadFailed = false,
    onClose,
}: {
    store: LocalPlannerStore;
    initial: TeamProfile | null;
    /** The saved team couldn't be read: say so rather than open as a blank team. */
    loadFailed?: boolean;
    onClose: () => void;
}) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const fileInput = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(initial?.name ?? "");
    const [logo, setLogo] = useState<LogoImage | null>(initial?.logo ?? null);
    const [primary, setPrimary] = useState(initial?.primaryColor ?? "");
    const [secondary, setSecondary] = useState(initial?.secondaryColor ?? "");
    const [submitted, setSubmitted] = useState(false);
    const [reading, setReading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [confirmingClear, setConfirmingClear] = useState(false);

    const input: TeamProfileInput = { name, logo, primaryColor: primary.trim() || null, secondaryColor: secondary.trim() || null };
    const errors: Partial<Record<TeamProfileField, string>> = submitted ? teamProfileErrors(input) : {};

    const chooseLogo = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setReading(true);
        try {
            const result = await normalizeLogoFile(file);
            if (result.ok) {
                setLogo(result.logo);
                setLogoError(null);
            } else {
                setLogoError(result.error);
            }
        } catch {
            setLogoError(LOGO_UNREADABLE_MESSAGE);
        } finally {
            setReading(false);
        }
    };

    const save = async () => {
        setSubmitted(true);
        if (Object.keys(teamProfileErrors(input)).length > 0) return;
        setBusy(true);
        const result = await store.saveTeamProfile(input);
        setBusy(false);
        if (result.success) onClose();
        else setSaveError(result.error);
    };

    const clear = async () => {
        setBusy(true);
        const result = await store.clearTeamProfile();
        setBusy(false);
        if (result.success) onClose();
        else setSaveError(result.error);
    };

    return (
        <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby="your-team-title">
            <DialogTitle id="your-team-title" sx={{ fontWeight: 800 }}>
                Your team
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                        {YOUR_TEAM_INTRO}
                    </Typography>
                    {loadFailed && <Alert severity="error">{TEAM_PROFILE_LOAD_FAILED}</Alert>}
                    <TextField
                        label="Team name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        error={Boolean(errors.name)}
                        helperText={errors.name ?? `Up to ${TEAM_NAME_MAX} characters`}
                        required
                        fullWidth
                        autoFocus
                    />
                    <Stack direction="row" spacing={2} alignItems="center">
                        {name.trim() || logo ? (
                            <Crest
                                name={name.trim() || "Team"}
                                id={LOCAL_TEAM_ID}
                                logoUrl={logo?.dataUrl ?? null}
                                brandColor={isTeamColor(primary) ? primary : null}
                                size="lg"
                            />
                        ) : (
                            // No name and no logo yet: a neutral mark, like the app bar's, not initials of a placeholder.
                            <Box
                                aria-hidden
                                data-testid="team-crest-placeholder"
                                sx={{
                                    width: 72,
                                    height: 72,
                                    flexShrink: 0,
                                    borderRadius: "50%",
                                    bgcolor: "action.hover",
                                    color: "text.secondary",
                                    border: 1,
                                    borderColor: "divider",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <TeamIcon sx={{ fontSize: 36 }} />
                            </Box>
                        )}
                        <Stack spacing={1} sx={{ minWidth: 0 }}>
                            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => fileInput.current?.click()} disabled={reading || busy} sx={TARGET}>
                                {logo ? "Replace logo" : "Upload logo"}
                            </Button>
                            {logo && (
                                <Button color="error" startIcon={<RemoveIcon />} onClick={() => setLogo(null)} disabled={busy} sx={TARGET}>
                                    Remove logo
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                    <input ref={fileInput} type="file" hidden accept={LOGO_ACCEPT} data-testid="team-logo-input" onChange={(event) => void chooseLogo(event)} />
                    <Typography variant="body2" color="text.secondary">
                        PNG, JPEG or WebP, up to 2 MB.
                    </Typography>
                    {(logoError || errors.logo) && <Alert severity="error">{logoError ?? errors.logo}</Alert>}
                    <ColorField label="Primary color" value={primary} onChange={setPrimary} error={errors.primaryColor} />
                    <ColorField label="Secondary color" value={secondary} onChange={setSecondary} error={errors.secondaryColor} />
                    {saveError && <Alert severity="error">{saveError}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
                {confirmingClear ? (
                    <>
                        <Typography variant="body2" sx={{ flexBasis: "100%", fontWeight: 600 }}>
                            {CLEAR_TEAM_PROMPT}
                        </Typography>
                        <Button onClick={() => setConfirmingClear(false)} disabled={busy} autoFocus sx={{ ...TARGET, ml: "auto" }}>
                            {CLEAR_TEAM_KEEP}
                        </Button>
                        <Button color="error" variant="contained" onClick={() => void clear()} disabled={busy} sx={TARGET}>
                            {CLEAR_TEAM_CONFIRM}
                        </Button>
                    </>
                ) : (
                    <>
                        {initial && (
                            <Button color="error" onClick={() => setConfirmingClear(true)} disabled={busy || reading} sx={{ ...TARGET, mr: "auto" }}>
                                Clear team
                            </Button>
                        )}
                        <Button onClick={onClose} disabled={busy} sx={TARGET}>
                            Cancel
                        </Button>
                        <Button variant="contained" onClick={() => void save()} disabled={busy || reading} sx={TARGET}>
                            Save
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}

/** The app bar's entry point: the team's crest (or a team icon) and "Your team". */
export function YourTeamButton({ store }: { store: LocalPlannerStore }) {
    const load = useCallback(() => store.getTeamProfile(), [store]);
    const state = useStoreResult(load, useTeamProfileVersion(store));
    const [open, setOpen] = useState(false);
    const profile = state.kind === "ready" ? state.data : null;
    return (
        <>
            <Button
                color="inherit"
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
                disabled={state.kind === "loading"}
                startIcon={
                    profile ? (
                        <Crest name={profile.name} id={LOCAL_TEAM_ID} logoUrl={profile.logo?.dataUrl ?? null} brandColor={profile.primaryColor} size="xs" />
                    ) : (
                        <TeamIcon />
                    )
                }
                sx={{ minHeight: 44, minWidth: 44, whiteSpace: "nowrap", flexShrink: 0 }}
            >
                Your team
            </Button>
            {open && <TeamProfileDialog store={store} initial={profile} loadFailed={state.kind === "error"} onClose={() => setOpen(false)} />}
        </>
    );
}
