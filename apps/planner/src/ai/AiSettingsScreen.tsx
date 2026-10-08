/**
 * AI settings, #/ai (ADR-0023, spec R5, R9, R10). This screen never contacts a
 * provider: no model list and no connection test. The key lives in memory
 * only (key-holder.ts); everything else is saved in the meta store.
 */
import { useState, useSyncExternalStore } from "react";
import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    FormLabel,
    Link,
    Paper,
    Radio,
    RadioGroup,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { PageHeader } from "@/components/ui/PageHeader";
import { chatCompletionsUrl } from "@/lib/ai";
import { PROVIDER_KINDS, type ProviderKind } from "@/lib/ai/types";
import { AI_ORIGINS } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { useAiSettings } from "../screens/useAiSettings";
import { forgetAllKeys, forgetKey, hasKey, keysVersion, setKey, subscribeKeys } from "./key-holder";
import { LOCAL_SERVER_HELP, PROVIDER_PRESETS } from "./presets";
import type { AiSettings, ProviderSettings } from "./settings";

export const AI_SETTINGS_TITLE = "AI assistance";
export const KEY_IN_MEMORY_NOTE = "The key is kept in this tab's memory only. Reloading or closing the tab forgets it, and it is never saved to this browser's storage or put in a plan file.";

function useKeysVersion(): number {
    return useSyncExternalStore(subscribeKeys, keysVersion, () => 0);
}

export function AiSettingsScreen({ store }: { store: LocalPlannerStore }) {
    const loaded = useAiSettings(store);
    useKeysVersion();
    const [settings, setSettings] = useState<AiSettings | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    if (loaded.kind === "ready" && settings === null) setSettings(loaded.data);

    // Each change is saved as it happens; nothing here is sent anywhere.
    const update = (next: AiSettings) => {
        setSettings(next);
        void store.saveAiSettings(next).then((result) => setSaveError(result.success ? null : result.error));
    };

    if (loaded.kind === "error") return <Alert severity="error">{loaded.message}</Alert>;
    if (!settings) return <Typography color="text.secondary">Loading…</Typography>;

    const turnOff = () => {
        forgetAllKeys();
        update({ ...settings, enabled: false });
    };
    const active = settings.active;

    return (
        <>
            <PageHeader title={AI_SETTINGS_TITLE} subtitle="Draft practice plans from your notes with an AI provider you choose, using your own key." />
            <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={settings.enabled}
                                onChange={(event) => (event.target.checked ? update({ ...settings, enabled: true }) : turnOff())}
                            />
                        }
                        label="Turn on AI assistance"
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Off by default. While it&apos;s off, the planner shows no AI features. Turning it on sends nothing: a request goes out only when
                        you press Send on a previewed request. Review your provider&apos;s terms and privacy policy before you use it.
                    </Typography>
                    {saveError && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {saveError}
                        </Alert>
                    )}
                </Paper>

                {settings.enabled && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <FormControl>
                            <FormLabel id="ai-provider-label">Provider</FormLabel>
                            <RadioGroup
                                aria-labelledby="ai-provider-label"
                                value={active ?? ""}
                                onChange={(event) => update({ ...settings, active: event.target.value as ProviderKind })}
                            >
                                {PROVIDER_KINDS.map((kind) => (
                                    <FormControlLabel key={kind} value={kind} control={<Radio />} label={PROVIDER_PRESETS[kind].name} sx={{ minHeight: 44 }} />
                                ))}
                            </RadioGroup>
                        </FormControl>
                    </Paper>
                )}

                {settings.enabled && active && (
                    <ProviderForm
                        key={active}
                        kind={active}
                        provider={settings.providers[active]}
                        onChange={(provider) => update({ ...settings, providers: { ...settings.providers, [active]: provider } })}
                    />
                )}

                {settings.enabled && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap flexWrap="wrap">
                            <Button variant="contained" href={staticRoutes.importNotes()} disabled={!active} sx={{ minHeight: 44 }}>
                                Draft a plan from notes
                            </Button>
                            <Button color="error" onClick={turnOff} sx={{ minHeight: 44 }}>
                                Turn off AI assistance
                            </Button>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Turning it off forgets every key held in this tab.
                        </Typography>
                    </Paper>
                )}
            </Stack>
        </>
    );
}

function ProviderForm({ kind, provider, onChange }: { kind: ProviderKind; provider: ProviderSettings; onChange: (provider: ProviderSettings) => void }) {
    const preset = PROVIDER_PRESETS[kind];
    const [keyDraft, setKeyDraft] = useState("");
    const held = hasKey(kind);
    const [model, setModel] = useState(provider.model);
    const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
    const baseCheck = kind === "openai-compatible" ? chatCompletionsUrl(baseUrl, AI_ORIGINS) : null;
    const listId = `ai-models-${kind}`;

    return (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" component="h2" fontWeight={700} sx={{ mb: 2 }}>
                {preset.name}
            </Typography>
            <Stack spacing={2}>
                {kind === "openai-compatible" && (
                    <>
                        <TextField
                            label="Server address"
                            value={baseUrl}
                            onChange={(event) => setBaseUrl(event.target.value)}
                            onBlur={() => onChange({ ...provider, baseUrl: baseUrl.trim(), model })}
                            error={baseCheck !== null && !baseCheck.ok}
                            helperText={baseCheck && !baseCheck.ok ? baseCheck.message : "The server's OpenAI-compatible address, ending in /v1."}
                            slotProps={{ htmlInput: { inputMode: "url", spellCheck: false, autoCapitalize: "off" } }}
                        />
                        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                            {LOCAL_SERVER_HELP.map((line) => (
                                <Typography component="li" variant="body2" color="text.secondary" key={line}>
                                    {line}
                                </Typography>
                            ))}
                        </Box>
                    </>
                )}

                <TextField
                    label="Model"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    onBlur={() => onChange({ ...provider, model: model.trim(), baseUrl })}
                    helperText={`Type any model your ${kind === "openai-compatible" ? "server has installed" : "account can use"}.${preset.defaultModel ? ` Suggested: ${preset.defaultModel}.` : ""} It needs to support structured (JSON schema) output.`}
                    slotProps={{ htmlInput: { list: listId, spellCheck: false, autoCapitalize: "off" } }}
                />
                <datalist id={listId}>
                    {preset.modelSuggestions.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                    ))}
                </datalist>

                <Box>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "flex-start" }}>
                        <TextField
                            label={preset.needsKey ? "API key" : "API key (optional)"}
                            type="password"
                            value={keyDraft}
                            onChange={(event) => setKeyDraft(event.target.value)}
                            placeholder={held ? "A key is held in this tab" : ""}
                            autoComplete="off"
                            sx={{ flexGrow: 1 }}
                            slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: "off", "data-1p-ignore": true, "data-lpignore": "true" } }}
                        />
                        <Button
                            variant="outlined"
                            disabled={!keyDraft.trim()}
                            onClick={() => {
                                setKey(kind, keyDraft);
                                setKeyDraft("");
                            }}
                            sx={{ minHeight: 56 }}
                        >
                            Use this key
                        </Button>
                        <Button disabled={!held} onClick={() => forgetKey(kind)} sx={{ minHeight: 56 }}>
                            Forget key
                        </Button>
                    </Stack>
                    <Typography variant="body2" color={held ? "success.main" : "text.secondary"} sx={{ mt: 1 }} role="status">
                        {held ? `A key for ${preset.destination} is held in this tab.` : "No key is held."}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {KEY_IN_MEMORY_NOTE} {preset.keyHelp}
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary">
                    {preset.spendHelp} The planner limits each request&apos;s size and shows it before you send, but it can&apos;t set limits on your account.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Review the provider&apos;s terms and privacy policy before you use it.
                    {preset.links.map((link) => (
                        <span key={link.href}>
                            {" "}
                            <Link href={link.href} target="_blank" rel="noopener noreferrer" underline="always">
                                {link.label}
                            </Link>
                            .
                        </span>
                    ))}
                </Typography>
            </Stack>
        </Paper>
    );
}
