/**
 * AI settings (ADR-0023): stored without a key, read leniently, and editing
 * them never sends a request (spec R9, R10). With AI off, the app makes no
 * request to a provider and shows no AI control (spec success criterion 1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { memoryStore, renderScreen } from "./render-screen";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { AiSettingsScreen } from "@/apps/planner/src/ai/AiSettingsScreen";
import { DEFAULT_AI_SETTINGS, acknowledgementFor, isAcknowledged, readAiSettings } from "@/apps/planner/src/ai/settings";
import { getKey, hasKey, resetKeyHolderForTests } from "@/apps/planner/src/ai/key-holder";
import { PlannerApp } from "@/apps/planner/src/App";
import { AI_SETTINGS_LINK } from "@/apps/planner/src/screens/AppShell";
import { NOTES_CARD_TITLE } from "@/apps/planner/src/screens/ImportScreen";
import { createStaleSignal } from "@/apps/planner/src/store/open-store";
import { PUBLIC_AI_ORIGINS } from "@/apps/planner/ai-origins";
import { META_AI_SETTINGS } from "@/apps/planner/src/store/records";

const KEY = "sk-sentinel-settings-0123456789";
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    resetKeyHolderForTests();
    fetchSpy = vi.fn(() => Promise.reject(new Error("no network in tests")));
    vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
});

describe.each(REPOS)("AI settings in the %s store", (_name, open) => {
    it("defaults to off, saves known fields only, and never stores a key", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        const initial = await store.getAiSettings();
        expect(initial).toEqual({ success: true, data: DEFAULT_AI_SETTINGS });
        const listener = vi.fn();
        store.subscribeAiSettings(listener);
        const withKey = {
            ...DEFAULT_AI_SETTINGS,
            enabled: true,
            active: "openai" as const,
            apiKey: KEY,
            providers: { ...DEFAULT_AI_SETTINGS.providers, openai: { model: "gpt-6-luna", baseUrl: "x", acknowledged: "openai", apiKey: KEY } },
        };
        const saved = await store.saveAiSettings(withKey);
        expect(saved.success).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(store.aiSettingsVersion()).toBe(1);
        const stored = await repo.read((tx) => tx.getMeta(META_AI_SETTINGS));
        expect(JSON.stringify(stored)).not.toContain(KEY);
        expect(stored).toMatchObject({ enabled: true, active: "openai", providers: { openai: { model: "gpt-6-luna", baseUrl: "", acknowledged: "openai" } } });
    });

    it("reads a damaged record as the defaults", async () => {
        const { repo, options } = await openHarness(open);
        await repo.write((tx) => tx.putMeta(META_AI_SETTINGS, { enabled: "yes", active: "copilot", providers: 7 }));
        const store = createLocalPlannerStore(repo, options);
        expect(await store.getAiSettings()).toEqual({ success: true, data: DEFAULT_AI_SETTINGS });
    });
});

describe("acknowledgement", () => {
    it("is per provider, and a local server's new address asks again", () => {
        const settings = readAiSettings({
            enabled: true,
            active: "openai-compatible",
            providers: { "openai-compatible": { model: "m", baseUrl: "http://localhost:11434/v1/", acknowledged: acknowledgementFor("openai-compatible", "http://localhost:11434/v1") } },
        });
        expect(isAcknowledged(settings, "openai-compatible")).toBe(true);
        expect(isAcknowledged(settings, "anthropic")).toBe(false);
        const moved = { ...settings, providers: { ...settings.providers, "openai-compatible": { ...settings.providers["openai-compatible"], baseUrl: "http://localhost:1234/v1" } } };
        expect(isAcknowledged(moved, "openai-compatible")).toBe(false);
    });
});

describe("AiSettingsScreen", () => {
    it("sends no request while AI is turned on and every field is edited (spec R9, R10)", async () => {
        const { store, repo } = memoryStore();
        renderScreen(<AiSettingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("switch", { name: "Turn on AI assistance" }));
        for (const name of ["OpenAI", "Anthropic (Claude)", "A server on this computer (Ollama, LM Studio)"]) {
            fireEvent.click(await screen.findByRole("radio", { name }));
            const model = await screen.findByLabelText("Model");
            fireEvent.change(model, { target: { value: "some-model" } });
            fireEvent.blur(model);
            const keyField = screen.getByLabelText(/^API key/);
            fireEvent.change(keyField, { target: { value: KEY } });
            fireEvent.click(screen.getByRole("button", { name: "Use this key" }));
        }
        const address = screen.getByLabelText("Server address");
        fireEvent.change(address, { target: { value: "https://models.example/v1" } });
        expect(await screen.findByText(/isn't on the planner's list of allowed AI servers/)).toBeInTheDocument();
        fireEvent.change(address, { target: { value: "http://localhost:1234/v1" } });
        fireEvent.blur(address);
        expect(hasKey("openai-compatible")).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Forget key" }));
        expect(hasKey("openai-compatible")).toBe(false);
        fireEvent.click(screen.getByRole("radio", { name: "OpenAI" }));
        expect(getKey("openai")).toBe(KEY);

        await waitFor(async () => {
            const saved = await store.getAiSettings();
            expect(saved.success && saved.data.providers["openai-compatible"].baseUrl).toBe("http://localhost:1234/v1");
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        // The key never reached storage.
        const stored = await repo.read((tx) => tx.getMeta(META_AI_SETTINGS));
        expect(JSON.stringify(stored)).not.toContain(KEY);

        // Turning it off forgets every key.
        fireEvent.click(screen.getByRole("button", { name: "Turn off AI assistance" }));
        expect(hasKey("openai")).toBe(false);
        expect(hasKey("anthropic")).toBe(false);
        await waitFor(async () => {
            const saved = await store.getAiSettings();
            expect(saved.success && saved.data.enabled).toBe(false);
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe("with AI assistance off", () => {
    it("makes no request to a provider and shows no AI control besides the settings link", async () => {
        const { store } = memoryStore();
        render(<PlannerApp store={store} durable stale={createStaleSignal()} />);
        await screen.findByText("Plan your first practice");
        const link = screen.getByRole("link", { name: AI_SETTINGS_LINK });
        expect(link).toHaveAttribute("href", "#/ai");
        for (const hash of ["#/library", "#/import", "#/rankings", "#/sessions/new", "#/"]) {
            window.location.hash = hash;
            await waitFor(() => expect(document.querySelector("main")).not.toBeNull());
        }
        window.location.hash = "#/import";
        await screen.findByText(/Choose a plan file/);
        expect(screen.queryByText(NOTES_CARD_TITLE)).toBeNull();
        const providerCalls = fetchSpy.mock.calls.filter(([url]) => PUBLIC_AI_ORIGINS.some((origin) => String(url).startsWith(origin.replace(":*", ""))));
        expect(providerCalls).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("offers the notes draft on the import screen once AI is on", async () => {
        const { store } = memoryStore();
        await store.saveAiSettings({ ...DEFAULT_AI_SETTINGS, enabled: true });
        window.location.hash = "#/import";
        render(<PlannerApp store={store} durable stale={createStaleSignal()} />);
        const card = (await screen.findByText(NOTES_CARD_TITLE)).closest("div")!;
        expect(within(card.parentElement!).getByRole("link", { name: "Paste notes" })).toHaveAttribute("href", "#/import/notes");
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
