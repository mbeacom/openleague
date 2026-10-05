/**
 * The Crest as a PNG (practice logo spec R3): what the printed bench sheet and
 * the HTML and Word exports show when a team has no logo. Same initials
 * (crestInitials), color (the caller passes resolveCrestColor's result), ink
 * (contrastTextFor) and font as components/ui/Crest.tsx, in a filled circle.
 * A canvas drawing is used for print because browsers drop CSS backgrounds
 * when printing, and documents need an image anyway.
 */
import theme from "@/lib/theme";
import { contrastTextFor } from "@/lib/utils/contrast-color";
import { crestInitials } from "@/lib/utils/crest";

/** Crest md's monogram: 17 px on a 48 px circle (components/ui/Crest.tsx). */
export const CREST_FONT_RATIO = 17 / 48;
/** Exports draw the Crest at 48 px; 4× keeps it sharp in print and in Word. */
export const CREST_EXPORT_PX = 192;

const FONT_FAMILY = String(theme.typography.fontFamily);

export interface CrestPaint {
    name: string;
    /** A resolved hex color (resolveCrestColor). */
    color: string;
    /** Canvas pixels, square. */
    size: number;
}

/** White or black, whichever reads on the color: the on-screen Crest's rule. */
export function crestInk(color: string): string {
    return contrastTextFor(theme, color, theme.palette.common.white);
}

export function paintCrest(ctx: CanvasRenderingContext2D, { name, color, size }: CrestPaint): void {
    const radius = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = crestInk(color);
    ctx.font = `800 ${Math.round(size * CREST_FONT_RATIO)}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(crestInitials(name), radius, radius);
}

/** A PNG data URL of the Crest, or null when the browser gives no 2d context. */
export function crestPng(paint: CrestPaint): string | null {
    const canvas = document.createElement("canvas");
    canvas.width = paint.size;
    canvas.height = paint.size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    paintCrest(ctx, paint);
    return canvas.toDataURL("image/png");
}

/** How long a Crest drawing waits for the theme font before using a fallback face. */
export const CREST_FONT_WAIT_MS = 1500;

/** The face an exported Crest paints with: weight, size and family. */
export const CREST_EXPORT_FONT = `800 ${Math.round(CREST_EXPORT_PX * CREST_FONT_RATIO)}px ${FONT_FAMILY}`;

/** True when the browser has the Font Loading API: without it there is nothing to wait for. */
export function canWaitForCrestFont(): boolean {
    return typeof document !== "undefined" && typeof document.fonts?.load === "function";
}

/**
 * Resolves once the exported Crest's font has loaded, failed, or taken longer
 * than `timeoutMs`; never rejects. A canvas draws with whatever face is ready,
 * so drawing first would bake a fallback font into the image.
 */
export function waitForCrestFont(timeoutMs: number = CREST_FONT_WAIT_MS): Promise<void> {
    if (!canWaitForCrestFont()) return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        try {
            document.fonts.load(CREST_EXPORT_FONT).then(done, done);
        } catch {
            done();
        }
    });
}
