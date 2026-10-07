/**
 * The renderer's scale model (rink diagram quality spec §2). Sizes are given
 * as "pixels on the reference board", the 800×400 board showing the whole
 * rink (3.8 px per foot), and drawn in proportion to the rink at any other
 * scale, so a drill looks the same from a sidebar card to a printed page and
 * the board itself is unchanged. No server or Next imports.
 */

/** Pixels per foot on the reference board: (800 − 2·20 padding) ÷ 200 ft. */
export const REFERENCE_PX_PER_FT = 3.8;

/** The thinnest line drawn (CSS px, so at least one device pixel at any ratio). */
export const MIN_LINE_PX = 1;

/** A size that is `px` on the reference board, at `pxPerFt`, never below `floorPx`. Exact at the reference scale. */
export function refPx(px: number, pxPerFt: number, floorPx: number = MIN_LINE_PX): number {
    return Math.max(px * (pxPerFt / REFERENCE_PX_PER_FT), floorPx);
}

/**
 * The x, in the context's user space, that puts a vertical line of `lineWidth`
 * on whole device pixels: an odd device width is centered on a half pixel, an
 * even one on a whole pixel. Unchanged when the context can't report its
 * transform (or reports nothing), or the transform rotates or skews.
 */
export function snapLineX(ctx: CanvasRenderingContext2D, x: number, lineWidth: number): number {
    if (typeof ctx.getTransform !== "function") return x;
    const m = ctx.getTransform() as DOMMatrix | undefined;
    if (!m || m.b !== 0 || m.c !== 0 || !(m.a > 0)) return x;
    const deviceX = m.a * x + m.e;
    const deviceWidth = Math.max(1, Math.round(lineWidth * m.a));
    const snapped = deviceWidth % 2 === 1 ? Math.floor(deviceX) + 0.5 : Math.round(deviceX);
    return (snapped - m.e) / m.a;
}

/**
 * `lineWidth` rounded to whole device pixels (at least one), so a snapped line
 * has no blurred edge. Unchanged when the context can't report its transform
 * (or reports nothing), or the transform rotates or skews.
 */
export function snapLineWidth(ctx: CanvasRenderingContext2D, lineWidth: number): number {
    if (typeof ctx.getTransform !== "function") return lineWidth;
    const m = ctx.getTransform() as DOMMatrix | undefined;
    if (!m || m.b !== 0 || m.c !== 0 || !(m.a > 0)) return lineWidth;
    return Math.max(1, Math.round(lineWidth * m.a)) / m.a;
}
