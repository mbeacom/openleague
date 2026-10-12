/** The drill playback board (animated playback R9–R11): controls, keyboard, reduced motion, and when it draws. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PlaybackBoard, playbackCaption } from "@/components/features/practice-planner/PlaybackBoard";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { getPlayback } from "@/lib/utils/canvas/playback";

const breakout = STARTER_PLAYS.find((p) => p.id === "starter-breakout-5man")!;
const playback = getPlayback(breakout.playData);

let now = 0;
let frames = new Map<number, FrameRequestCallback>();
let nextId = 1;

/** Advances the clock by `ms` and runs every pending animation frame once. */
function advance(ms: number) {
    act(() => {
        now += ms;
        const pending = [...frames.values()];
        frames = new Map();
        pending.forEach((cb) => cb(now));
    });
}

function stubMatchMedia(reduce: boolean) {
    vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
            matches: reduce && query.includes("prefers-reduced-motion"),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }))
    );
}

beforeEach(() => {
    now = 0;
    frames = new Map();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn((cb: FrameRequestCallback) => {
            const id = nextId++;
            frames.set(id, cb);
            return id;
        })
    );
    vi.stubGlobal(
        "cancelAnimationFrame",
        vi.fn((id: number) => {
            frames.delete(id);
        })
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

const slider = () => screen.getByRole("slider", { name: "Playback position" });

describe("PlaybackBoard", () => {
    it("labels every control and doesn't start on its own", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        expect(screen.getByRole("img", { name: "Breakout diagram" })).toBeInTheDocument();
        for (const name of ["Step back", "Play", "Step forward", "Loop", "0.5× speed", "1× speed", "2× speed"]) {
            expect(screen.getByRole("button", { name })).toBeInTheDocument();
        }
        expect(screen.getByRole("button", { name: "1× speed" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "false");
        expect(requestAnimationFrame).not.toHaveBeenCalled();
        expect(slider()).toHaveValue("0");
    });

    it("plays on a tap, runs to the end, and stops drawing there", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
        expect(frames.size).toBe(1);
        advance(16);
        advance(500);
        expect(Number(slider().getAttribute("value"))).toBeGreaterThan(0);
        // Past the end: the loop stops and nothing more is scheduled.
        advance(playback.durationMs);
        expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
        expect(frames.size).toBe(0);
        expect(slider()).toHaveValue(String(playback.durationMs));
        expect(screen.getByText(new RegExp(`^Step ${playback.steps.length} of ${playback.steps.length}`))).toBeInTheDocument();
    });

    it("stops the loop on pause", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" startPlaying />);
        advance(16);
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        expect(frames.size).toBe(0);
        const before = slider().getAttribute("value");
        advance(1000);
        expect(slider().getAttribute("value")).toBe(before);
    });

    it("scales the clock with the speed", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        fireEvent.click(screen.getByRole("button", { name: "2× speed" }));
        expect(screen.getByRole("button", { name: "2× speed" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        advance(0);
        advance(500);
        expect(slider()).toHaveValue("1000");
    });

    it("holds the last frame and restarts when looping", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        fireEvent.click(screen.getByRole("button", { name: "Loop" }));
        expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        advance(0);
        advance(playback.durationMs);
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
        expect(slider()).toHaveValue(String(playback.durationMs));
        advance(1600);
        advance(16);
        expect(Number(slider().getAttribute("value"))).toBeLessThan(100);
    });

    it("steps forward and back by step, and pauses", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
        expect(slider()).toHaveValue(String(playback.steps[1].startMs));
        expect(slider()).toHaveAttribute("aria-valuetext", `Step 1 of ${playback.steps.length}`);
        fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
        expect(slider()).toHaveValue(String(playback.steps[2].startMs));
        fireEvent.click(screen.getByRole("button", { name: "Step back" }));
        expect(slider()).toHaveValue(String(playback.steps[1].startMs));
        expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it("answers the keyboard when the board has focus", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        const board = screen.getByRole("group", { name: /Breakout playback/ });
        board.focus();
        fireEvent.keyDown(board, { key: "End" });
        expect(slider()).toHaveValue(String(playback.durationMs));
        fireEvent.keyDown(board, { key: "Home" });
        expect(slider()).toHaveValue("0");
        fireEvent.keyDown(board, { key: "ArrowRight" });
        expect(slider()).toHaveValue(String(playback.steps[1].startMs));
        fireEvent.keyDown(board, { key: "ArrowLeft" });
        expect(slider()).toHaveValue("0");
        fireEvent.keyDown(board, { key: " " });
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
        fireEvent.keyDown(board, { key: " " });
        expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("announces the step in a polite live region, once per step", () => {
        const { container } = render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        const live = container.querySelector('[aria-live="polite"]')!;
        expect(live).toHaveTextContent(`${playback.steps.length} steps`);
        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        advance(0);
        advance(50);
        expect(live).toHaveTextContent("Step 1 of 3 · D1: Pass · C: Skate · RW: Skate · D2: Skate");
        const text = live.textContent;
        advance(50);
        expect(live.textContent).toBe(text);
    });

    it("pauses when the tab is hidden", () => {
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" startPlaying />);
        advance(16);
        expect(frames.size).toBe(1);
        act(() => {
            Object.defineProperty(document, "hidden", { configurable: true, value: true });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
        expect(frames.size).toBe(0);
    });

    it("offers a close button when asked", () => {
        const onClose = vi.fn();
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" onClose={onClose} />);
        fireEvent.click(screen.getByRole("button", { name: "Close playback" }));
        expect(onClose).toHaveBeenCalled();
    });

    it("draws every frame while playing and nothing while paused", () => {
        const calls: Record<string, number> = {};
        const ctx = new Proxy({} as Record<string | symbol, unknown>, {
            get(target, prop) {
                if (prop in target) return target[prop];
                return (..._args: unknown[]) => {
                    calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
                    return { addColorStop: () => undefined, width: 10 };
                };
            },
            set(target, prop, value) {
                target[prop] = value;
                return true;
            },
        });
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(private cb: ResizeObserverCallback) {}
                observe() {
                    this.cb([{ contentRect: { width: 600, height: 256 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
                }
                unobserve() {}
                disconnect() {}
            }
        );
        render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
        const afterMount = calls.drawImage ?? 0;
        expect(afterMount).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        advance(16);
        advance(16);
        advance(16);
        const playing = calls.drawImage ?? 0;
        expect(playing - afterMount).toBeGreaterThanOrEqual(3);
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        const paused = calls.drawImage ?? 0;
        advance(1000);
        advance(1000);
        expect(calls.drawImage ?? 0).toBe(paused);
    });

    describe("with reduced motion", () => {
        beforeEach(() => stubMatchMedia(true));

        it("opens in step mode: Next step shows each step's end with no animation", () => {
            render(<PlaybackBoard playData={breakout.playData} label="Breakout" startPlaying />);
            expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", { name: "Next step" }));
            expect(slider()).toHaveAttribute("aria-valuetext", `Step 1 of ${playback.steps.length}`);
            expect(screen.getByText(/^Step 1 of 3/)).toBeInTheDocument();
            expect(requestAnimationFrame).not.toHaveBeenCalled();
        });

        it("animates on request", () => {
            render(<PlaybackBoard playData={breakout.playData} label="Breakout" />);
            fireEvent.click(screen.getByRole("switch", { name: "Animate" }));
            fireEvent.click(screen.getByRole("button", { name: "Play" }));
            expect(requestAnimationFrame).toHaveBeenCalled();
        });
    });

    it("captions the start with the number of steps", () => {
        expect(playbackCaption(playback, -1)).toBe("3 steps");
        expect(playbackCaption(playback, 1)).toBe("Step 2 of 3 · LW: Skate");
    });
});
