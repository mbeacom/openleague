import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { StationMap } from "@/components/features/practice-planner/StationMap";
import { clearRinkCache } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

type Call = { name: string; args: unknown[] };

function recordingCtx(calls: Call[]): CanvasRenderingContext2D {
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            return (...args: unknown[]) => {
                calls.push({ name: prop, args });
                return { width: 10 };
            };
        },
        set(t, prop, value) {
            if (typeof prop === "string") t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

const breakout: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-left" },
    players: [{ id: "p1", role: "F", label: "", color: "#1976D2", position: { x: 30, y: 40 } }],
};
const regroup: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-right" },
    equipment: [{ id: "n1", kind: "net", position: { x: 180, y: 42 }, rotation: 0 }],
};

let byCanvas: Map<HTMLCanvasElement, Call[]>;

beforeEach(() => {
    clearRinkCache();
    byCanvas = new Map();
    // One recording context per canvas, so the map is told apart from the legend's swatches.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
        const calls: Call[] = [];
        byCanvas.set(this, calls);
        return recordingCtx(calls);
    } as unknown as HTMLCanvasElement["getContext"]);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function renderMap(activeIndex = 0) {
    render(
        <ThemeProvider theme={createTheme()}>
            <StationMap
                stations={[{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }]}
                activeIndex={activeIndex}
            />
        </ThemeProvider>,
    );
}

describe("StationMap", () => {
    it("draws one clipped region per station and names the stations for screen readers", () => {
        renderMap();
        const map = screen.getByRole("img", { name: "Station map: 1 · Breakout (current), 2 · Regroup" });
        const calls = byCanvas.get(map as HTMLCanvasElement) ?? [];

        // Two rectangular clips per station; the rink's rounded-outline clip is separate.
        expect(calls.filter((c, i) => c.name === "clip" && calls[i - 1]?.name === "rect")).toHaveLength(4);
        expect(calls.filter((c) => c.name === "fillText").map((c) => c.args[0])).toEqual(
            expect.arrayContaining(["1 · Breakout", "2 · Regroup"]),
        );
    });

    it("marks the current station in the accessible name", () => {
        renderMap(1);
        expect(screen.getByRole("img", { name: "Station map: 1 · Breakout, 2 · Regroup (current)" })).toBeInTheDocument();
    });

    it("renders nothing for an empty block", () => {
        const { container } = render(
            <ThemeProvider theme={createTheme()}>
                <StationMap stations={[]} activeIndex={0} />
            </ThemeProvider>,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("shows one legend combining every station's symbols", () => {
        renderMap();
        expect(screen.getByText("Legend (2)")).toBeInTheDocument();
    });
});

describe("StationMap pixel ratio", () => {
    const mapCanvas = () => screen.getByRole("img", { name: /^Station map:/ }) as HTMLCanvasElement;

    it.each([
        [2, 2],
        [4, 3], // clamped high
        [0.5, 1], // clamped low
    ])("at devicePixelRatio %s, sizes the backing store by %s and scales before drawing", (dpr, ratio) => {
        vi.stubGlobal("devicePixelRatio", dpr);
        renderMap();
        const canvas = mapCanvas();
        const calls = byCanvas.get(canvas) ?? [];

        expect([canvas.width, canvas.height]).toEqual([960 * ratio, 420 * ratio]);
        expect(calls[0]).toEqual({ name: "setTransform", args: [ratio, 0, 0, ratio, 0, 0] });
        // Drawing stays in logical (CSS) pixels: the clear covers the intrinsic size, not the backing store.
        expect(calls.find((c) => c.name === "clearRect")?.args).toEqual([0, 0, 960, 420]);
    });

    it("draws the rink as vectors when scaled, never blitting a cached rink bitmap", () => {
        vi.stubGlobal("devicePixelRatio", 2);
        renderMap();
        expect((byCanvas.get(mapCanvas()) ?? []).some((c) => c.name === "drawImage")).toBe(false);
    });

    it("keeps the CSS size: the canvas still fills its container's width", () => {
        vi.stubGlobal("devicePixelRatio", 3);
        renderMap();
        expect(mapCanvas().style.width).toBe("100%");
    });
});

describe("StationMap re-sharpens when the pixel ratio changes", () => {
    type Listener = () => void;
    interface FakeQuery {
        media: string;
        listeners: Set<Listener>;
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
    }
    let queries: FakeQuery[];

    beforeEach(() => {
        queries = [];
        vi.stubGlobal("matchMedia", vi.fn((media: string) => {
            const listeners = new Set<Listener>();
            const query: FakeQuery = {
                media,
                listeners,
                addEventListener: vi.fn((type: string, fn: Listener) => { if (type === "change") listeners.add(fn); }),
                removeEventListener: vi.fn((type: string, fn: Listener) => { if (type === "change") listeners.delete(fn); }),
            };
            queries.push(query);
            return query;
        }));
    });

    const mapCanvas = () => screen.getByRole("img", { name: /^Station map:/ }) as HTMLCanvasElement;
    // The map and its legend swatches each watch the ratio (backing-store.ts), so compare the set of media.
    const armed = () => queries.filter((q) => q.listeners.size > 0);
    const armedMedia = () => [...new Set(armed().map((q) => q.media))];
    const changeTo = (dpr: number) => {
        const fired = armed();
        vi.stubGlobal("devicePixelRatio", dpr);
        act(() => { for (const query of fired) for (const fn of [...query.listeners]) fn(); });
    };

    it("listens for the current resolution and redraws at the new ratio when it changes", () => {
        vi.stubGlobal("devicePixelRatio", 1);
        renderMap();
        expect(mapCanvas().width).toBe(960);
        expect(armedMedia()).toEqual(["(resolution: 1dppx)"]);

        changeTo(2); // e.g. browser zoom to 200%, or the window moved to a retina display
        expect([mapCanvas().width, mapCanvas().height]).toEqual([1920, 840]);
        const calls = byCanvas.get(mapCanvas()) ?? [];
        // The redraw (a fresh context recording) scales to the new ratio before drawing.
        expect(calls[0]).toEqual({ name: "setTransform", args: [2, 0, 0, 2, 0, 0] });
    });

    it("re-arms on the new resolution after each change, dropping the old listener", () => {
        vi.stubGlobal("devicePixelRatio", 1);
        renderMap();
        changeTo(2);
        expect(armedMedia()).toEqual(["(resolution: 2dppx)"]);
        changeTo(1.5);
        expect(armedMedia()).toEqual(["(resolution: 1.5dppx)"]);
        expect(mapCanvas().width).toBe(1440);
    });

    it("removes its listener on unmount", () => {
        vi.stubGlobal("devicePixelRatio", 2);
        const view = render(
            <ThemeProvider theme={createTheme()}>
                <StationMap stations={[{ name: "Breakout", playData: breakout }]} activeIndex={0} />
            </ThemeProvider>,
        );
        expect(armed().length).toBeGreaterThan(0);
        view.unmount();
        expect(armed()).toHaveLength(0);
    });
});
