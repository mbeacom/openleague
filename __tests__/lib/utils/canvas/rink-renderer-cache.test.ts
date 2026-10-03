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
});
