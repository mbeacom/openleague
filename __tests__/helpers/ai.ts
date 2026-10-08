/**
 * A scripted AiProvider for task and screen tests (ADR-0023, spec Testing).
 * It replays a list of steps: text deltas, done, errors, or a hang that only
 * an abort ends. It never touches the network.
 */
import type { AiEvent, AiProvider, AiRequest, ProviderKind } from "@/lib/ai/types";

export type FakeStep = AiEvent | { type: "hang" };

export interface FakeProvider extends AiProvider {
    /** Every request received, in order. */
    requests: AiRequest[];
    /** Resolves the hang step, as if the server finally replied (for tests that need a mid-stream pause). */
    release: () => void;
}

export function createFakeProvider(script: FakeStep[], kind: ProviderKind = "anthropic"): FakeProvider {
    const requests: AiRequest[] = [];
    let release: () => void = () => undefined;
    return {
        kind,
        requests,
        release: () => release(),
        async *send(request: AiRequest, signal: AbortSignal): AsyncGenerator<AiEvent> {
            requests.push(request);
            for (const step of script) {
                if (signal.aborted) {
                    yield { type: "error", code: "aborted", message: "Stopped. Nothing was saved." };
                    return;
                }
                if (step.type === "hang") {
                    const aborted = await new Promise<boolean>((resolve) => {
                        release = () => resolve(false);
                        signal.addEventListener("abort", () => resolve(true), { once: true });
                    });
                    if (aborted) {
                        yield { type: "error", code: "aborted", message: "Stopped. Nothing was saved." };
                        return;
                    }
                    continue;
                }
                yield step;
                if (step.type === "done" || step.type === "error") return;
            }
        },
    };
}

/** A draft reply in the notes-to-plan draft schema. */
export function draftReply(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        title: "Riverside 9U Tuesday",
        durationMinutes: 30,
        date: null,
        startTime: null,
        staff: ["Coach 1"],
        rows: [
            { kind: "warmup", name: "", minutes: 5, instructions: "Edges", description: "", focus: null, goalies: null, ageGroups: [], runsWithPrevious: false, staff: ["Coach 1"] },
            { kind: "drill", name: "3-Man Weave", minutes: 10, instructions: "Player 1 starts", description: "D to F", focus: "team", goalies: "optional", ageGroups: [], runsWithPrevious: false, staff: [] },
            { kind: "drill", name: "Edge Work Ladder", minutes: 10, instructions: "", description: "", focus: null, goalies: null, ageGroups: ["u8"], runsWithPrevious: false, staff: [] },
        ],
        ...overrides,
    });
}
