/**
 * The cached rink background must be built from the transform actually passed
 * to drawRink and keyed on every transform field that affects drawing —
 * otherwise thumbnails (padding 10) and the RinkBoard (padding 20) share a
 * background drawn at the wrong inset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRinkCache,
  createTransformContext,
  drawRink,
  rinkCacheKey,
} from "@/lib/utils/canvas/rink-renderer";
import { editViewport } from "@/lib/utils/ice-area";

function fakeCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = { drawImage: vi.fn() };
  return new Proxy(target, {
    get(t, prop: string) {
      if (!(prop in t)) t[prop] = vi.fn(() => ({ addColorStop: vi.fn() }));
      return t[prop];
    },
    set(t, prop: string, value) {
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe("drawRink cache", () => {
  let built: Array<{ width: number; height: number; ctx: CanvasRenderingContext2D }>;

  beforeEach(() => {
    clearRinkCache();
    built = [];
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return real(tag);
      const ctx = fakeCtx();
      const canvas = { width: 0, height: 0, ctx, getContext: () => ctx };
      built.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearRinkCache();
  });

  it("keys on the transform, not just canvas size", () => {
    const a = createTransformContext(800, 400, 10);
    const b = createTransformContext(800, 400, 20);
    expect(rinkCacheKey(a)).not.toBe(rinkCacheKey(b));
    expect(rinkCacheKey(a)).toBe(rinkCacheKey(createTransformContext(800, 400, 10)));
  });

  it("reuses the cache for an identical transform", () => {
    const out = fakeCtx();
    drawRink(out, createTransformContext(800, 400, 10));
    drawRink(out, createTransformContext(800, 400, 10));
    expect(built).toHaveLength(1);
  });

  it("rebuilds when padding changes at the same canvas size", () => {
    const out = fakeCtx();
    drawRink(out, createTransformContext(800, 400, 10));
    drawRink(out, createTransformContext(800, 400, 20));
    expect(built).toHaveLength(2);
    expect(out.drawImage).toHaveBeenCalledTimes(2);
  });

  it("keys same-size viewports at different places apart", () => {
    const left = createTransformContext(800, 400, 20, editViewport({ kind: "half-left" }));
    const right = createTransformContext(800, 400, 20, editViewport({ kind: "half-right" }));
    expect(left.scaleX).toBe(right.scaleX);
    expect(left.offsetY).toBe(right.offsetY);
    expect(rinkCacheKey(left)).not.toBe(rinkCacheKey(right));
    expect(rinkCacheKey(createTransformContext(800, 400, 20, editViewport({ kind: "zone-left" })))).not.toBe(
      rinkCacheKey(createTransformContext(800, 400, 20)),
    );
  });

  it("never reuses one viewport's background for another", () => {
    const out = fakeCtx();
    const left = createTransformContext(800, 400, 20, editViewport({ kind: "half-left" }));
    const right = createTransformContext(800, 400, 20, editViewport({ kind: "half-right" }));
    drawRink(out, left);
    drawRink(out, right);
    drawRink(out, left);
    expect(built).toHaveLength(3);
  });
  it("bypasses the cache when asked, filling the base under an identity transform", () => {
    const calls: string[] = [];
    const out = new Proxy({} as Record<string, unknown>, {
      get(t, prop: string) {
        if (prop in t) return t[prop];
        return (...args: unknown[]) => {
          calls.push(`${prop}(${args.join(",")})`);
          return { addColorStop: vi.fn() };
        };
      },
      set(t, prop: string, value) {
        t[prop] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    drawRink(out, createTransformContext(800, 400, 20), { cache: false });
    expect(built).toHaveLength(0);
    expect(calls).not.toContain("drawImage");
    const identity = calls.indexOf("setTransform(1,0,0,1,0,0)");
    expect(identity).toBeGreaterThanOrEqual(0);
    expect(calls[identity + 1]).toBe("fillRect(0,0,800,400)");
    expect(calls).toContain("restore()");
  });
});
