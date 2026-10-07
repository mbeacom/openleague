/**
 * The diagram font (rink diagram quality spec §3). A canvas draws with
 * whatever face is ready, so anything stored or printed waits for Cabinet
 * Grotesk first, and live canvases redraw once when it arrives. No server or
 * Next imports.
 */

export const DIAGRAM_FONT_FAMILY = '"Cabinet Grotesk", system-ui, sans-serif';

/** How long stored or printed drawing waits for the font before using the fallback. */
export const DIAGRAM_FONT_WAIT_MS = 1500;

export function diagramFont(weight: 600 | 800, px: number): string {
    return `${weight} ${px}px ${DIAGRAM_FONT_FAMILY}`;
}

type FontFaces = {
    load?: (font: string) => Promise<unknown>;
    check?: (font: string) => boolean;
    addEventListener?: (type: string, fn: () => void) => void;
    removeEventListener?: (type: string, fn: () => void) => void;
};

function faces(): FontFaces | undefined {
    return typeof document === "undefined" ? undefined : (document.fonts as unknown as FontFaces | undefined);
}

/** True when there is nothing to wait for: no Font Loading API, or both weights already loaded. */
export function diagramFontReady(): boolean {
    const fonts = faces();
    if (typeof fonts?.load !== "function") return true;
    if (typeof fonts.check !== "function") return false;
    try {
        return fonts.check(diagramFont(800, 16)) && fonts.check(diagramFont(600, 16));
    } catch {
        return false;
    }
}

/** Resolves once both weights have loaded, failed, or taken longer than `timeoutMs`; never rejects. */
export function waitForDiagramFont(timeoutMs: number = DIAGRAM_FONT_WAIT_MS): Promise<void> {
    const fonts = faces();
    const load = fonts?.load;
    if (typeof load !== "function") return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        try {
            Promise.all([load.call(fonts, diagramFont(800, 16)), load.call(fonts, diagramFont(600, 16))]).then(done, done);
        } catch {
            done();
        }
    });
}

/** Calls `listener` whenever the page finishes loading fonts; returns the unsubscribe. */
export function onDiagramFontLoaded(listener: () => void): () => void {
    const fonts = faces();
    if (typeof fonts?.addEventListener !== "function") return () => undefined;
    fonts.addEventListener("loadingdone", listener);
    return () => fonts.removeEventListener?.("loadingdone", listener);
}
