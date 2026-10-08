import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { memoryStore, renderScreen } from "./render-screen";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { AI_OFF_MESSAGE, DRAFT_LABEL, NO_DIAGRAM_CAPTION, NotesDraftScreen } from "@/apps/planner/src/ai/NotesDraftScreen";
import { AI_DISCLOSURE_ACCEPT, AI_DISCLOSURE_TITLE } from "@/apps/planner/src/ai/disclosure";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@/apps/planner/src/ai/settings";
import { resetKeyHolderForTests, setKey } from "@/apps/planner/src/ai/key-holder";
import { NOTES_SYSTEM_PROMPT } from "@/lib/ai/tasks/notes-to-plan";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";
import { createFakeProvider, draftReply, type FakeStep } from "../../helpers/ai";

// jsdom has no canvas; diagrams draw as a stub.
vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()),
    generateThumbnail: vi.fn(() => "data:image/png;base64,AA=="),
}));

const ON: AiSettings = { ...DEFAULT_AI_SETTINGS, enabled: true, active: "anthropic" };
const NOTES = "Alex runs the warm-up, 5 min. 3-Man Weave 10 min, Jordan starts. Edge Work Ladder 10 min for 8U.";

beforeEach(() => {
    resetKeyHolderForTests();
    setKey("anthropic", "sk-test-not-a-real-key");
});

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

async function setup(script: FakeStep[], settings: AiSettings = ON) {
    const { store } = memoryStore();
    await store.saveAiSettings(settings);
    const provider = createFakeProvider(script);
    const factory = vi.fn(() => provider);
    renderScreen(<NotesDraftScreen store={store} providerFactory={factory} />, store);
    await screen.findByLabelText("Practice notes");
    return { store, provider, factory };
}

function fillAndPreview() {
    fireEvent.change(screen.getByLabelText("Practice notes"), { target: { value: NOTES } });
    fireEvent.change(screen.getByLabelText(/Coaches' names/), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/Other names/), { target: { value: "Jordan" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
}

async function sendAndAccept() {
    fireEvent.click(screen.getByRole("button", { name: "Send to Anthropic" }));
    const dialog = await screen.findByRole("dialog", { name: AI_DISCLOSURE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: AI_DISCLOSURE_ACCEPT }));
}

async function sessionsIn(store: LocalPlannerStore) {
    const list = await store.listSessions();
    return list.success ? list.data.length : -1;
}

describe("NotesDraftScreen", () => {
    it("says AI assistance is off, with a way to settings, and offers no Send", async () => {
        const { store } = memoryStore();
        renderScreen(<NotesDraftScreen store={store} providerFactory={vi.fn()} />, store);
        expect(await screen.findByText(AI_OFF_MESSAGE)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "AI settings" })).toHaveAttribute("href", "#/ai");
        expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    });

    it("asks for a key when none is held in this tab", async () => {
        resetKeyHolderForTests();
        const { store } = memoryStore();
        await store.saveAiSettings(ON);
        renderScreen(<NotesDraftScreen store={store} providerFactory={vi.fn()} />, store);
        expect(await screen.findByText(/held in this tab only/)).toBeInTheDocument();
    });

    it("offers Send only once the preview shows the exact redacted request, and editing withdraws it", async () => {
        const { factory } = await setup([{ type: "done", text: draftReply() }]);
        expect(screen.queryByRole("button", { name: "Send to Anthropic" })).toBeNull();
        fillAndPreview();
        const input = screen.getByTestId("ai-preview-input");
        expect(input.textContent).toBe(
            "Practice notes:\n\nCoach 1 runs the warm-up, 5 min. 3-Man Weave 10 min, Player 1 starts. Edge Work Ladder 10 min for 8U.",
        );
        expect(input.textContent).not.toMatch(/Alex|Jordan/);
        expect(within(input).getAllByText(/^(Coach 1|Player 1)$/).map((mark) => mark.tagName)).toEqual(["MARK", "MARK"]);
        expect(screen.getByLabelText("Instructions to the model").textContent).toBe(NOTES_SYSTEM_PROMPT);
        expect(screen.getByText(/Alex → Coach 1, Jordan → Player 1/)).toBeInTheDocument();
        expect(screen.getByText(/words in, up to 3,000 out/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send to Anthropic" })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
        expect(screen.queryByRole("button", { name: "Send to Anthropic" })).toBeNull();
        expect(screen.queryByTestId("ai-request-preview")).toBeNull();
        expect(factory).not.toHaveBeenCalled();
    });

    it("shows the disclosure before the first send to a provider; cancelling sends nothing; it isn't shown again", async () => {
        const { store, provider } = await setup([{ type: "error", code: "rate-limit", message: "Busy" }]);
        fillAndPreview();
        fireEvent.click(screen.getByRole("button", { name: "Send to Anthropic" }));
        const dialog = await screen.findByRole("dialog", { name: AI_DISCLOSURE_TITLE });
        expect(within(dialog).getByText(/terms and privacy policy/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(provider.requests).toHaveLength(0);

        await sendAndAccept();
        expect(await screen.findByText("Busy")).toBeInTheDocument();
        expect(provider.requests).toHaveLength(1);
        const saved = await store.getAiSettings();
        expect(saved.success && saved.data.providers.anthropic.acknowledged).toBe("anthropic");

        fireEvent.click(screen.getByRole("button", { name: /Try again: send to Anthropic/ }));
        await waitFor(() => expect(provider.requests).toHaveLength(2));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("sends exactly the previewed request", async () => {
        const { provider } = await setup([{ type: "done", text: draftReply() }]);
        fillAndPreview();
        const shown = screen.getByTestId("ai-preview-input").textContent;
        await sendAndAccept();
        await screen.findByText(DRAFT_LABEL);
        expect(provider.requests[0].input).toBe(shown);
        expect(provider.requests[0].system).toBe(NOTES_SYSTEM_PROMPT);
        expect(provider.requests[0].model).toBe(DEFAULT_AI_SETTINGS.providers.anthropic.model);
    });

    it("stops a request in flight", async () => {
        await setup([{ type: "text", delta: "{\"ti" }, { type: "hang" }]);
        fillAndPreview();
        await sendAndAccept();
        fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
        expect(await screen.findByText(/Stopped/)).toBeInTheDocument();
    });

    it("shows a bad draft's issues and saves nothing", async () => {
        const { store } = await setup([{ type: "done", text: draftReply({ durationMinutes: 10 }) }]);
        fillAndPreview();
        await sendAndAccept();
        expect(await screen.findByText(/draft plan has problems/)).toBeInTheDocument();
        expect(screen.getByText(/exceeds session duration/)).toBeInTheDocument();
        expect(await sessionsIn(store)).toBe(0);
    });

    it("shows output that isn't JSON as bad output", async () => {
        await setup([{ type: "text", delta: "Sure!" }, { type: "done", text: "Sure! Here's a plan." }]);
        fillAndPreview();
        await sendAndAccept();
        expect(await screen.findByText(/wasn't a usable draft/)).toBeInTheDocument();
        expect(screen.getByText("The reply isn't JSON.")).toBeInTheDocument();
    });

    it("puts a good draft in the import preview, restores names, offers library diagrams, and saves only on Save", async () => {
        const { store } = await setup([{ type: "text", delta: "{" }, { type: "done", text: draftReply() }]);
        const weave = STARTER_PLAYS.find((play) => play.name === "3-Man Weave")!;
        await store.createPlay({ name: weave.name, playData: weave.playData, isTemplate: true, teamId: "local" });
        fillAndPreview();
        await sendAndAccept();
        expect(await screen.findByText(DRAFT_LABEL)).toBeInTheDocument();
        expect(screen.getByText("Riverside 9U Tuesday")).toBeInTheDocument();
        expect(screen.getByText(/Jordan starts/)).toBeInTheDocument();
        expect(screen.getAllByText(NO_DIAGRAM_CAPTION)).toHaveLength(1);
        expect(screen.getByRole("switch", { name: /Use the diagrams from my library for 1 drill with the same name/ })).toBeChecked();
        expect(await sessionsIn(store)).toBe(0);

        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        const list = await store.listSessions();
        expect(list.success && list.data.map((s) => s.title)).toEqual(["Riverside 9U Tuesday"]);
        const id = window.location.hash.split("/")[2];
        const view = await store.getSessionView(id);
        expect(view.success && view.data.staff?.map((s) => s.name)).toEqual(["Alex"]);
    });

    it("discards a draft without saving", async () => {
        const { store } = await setup([{ type: "done", text: draftReply() }]);
        fillAndPreview();
        await sendAndAccept();
        fireEvent.click(await screen.findByRole("button", { name: "Discard draft" }));
        expect(screen.getByLabelText("Practice notes")).toBeEnabled();
        await act(async () => undefined);
        expect(await sessionsIn(store)).toBe(0);
    });
});
