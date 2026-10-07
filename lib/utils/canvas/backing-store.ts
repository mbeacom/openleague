/**
 * Canvas backing stores at the display's pixel ratio (rink diagram quality
 * spec §1). A canvas is drawn in CSS pixels under setTransform(ratio, …) on a
 * backing store of CSS size × ratio, so it is sharp on high-density screens.
 * No server or Next imports: the static planner shares this module.
 */

/** Bounds the backing store's memory on very dense screens. */
export const MAX_BACKING_PIXEL_RATIO = 3;

/** window.devicePixelRatio clamped to [1, 3]; 1 off the browser or when not finite. */
export function backingPixelRatio(): number {
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
    return Number.isFinite(dpr) ? Math.min(MAX_BACKING_PIXEL_RATIO, Math.max(1, dpr)) : 1;
}

/** Sizes the backing store to css × ratio (at least 1×1, so an unmeasured container can't make an empty canvas). */
export function sizeBackingStore(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, ratio: number): void {
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
}

/**
 * Calls onChange when the pixel ratio changes (browser zoom, or the window
 * moving to another screen). A resolution query matches only the ratio it was
 * made for, so it is re-armed for the new ratio after every change. Returns
 * the unsubscribe.
 */
export function watchPixelRatio(onChange: () => void): () => void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
    let query: MediaQueryList | null = null;
    const arm = () => {
        query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        query.addEventListener("change", fire);
    };
    const fire = () => {
        query?.removeEventListener("change", fire);
        arm();
        onChange();
    };
    arm();
    return () => query?.removeEventListener("change", fire);
}
