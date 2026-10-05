"use client";

/**
 * The bench sheet's team mark (practice logo spec R5): the logo, else the
 * team's Crest drawn as an image. An image, not the CSS Crest, because
 * browsers drop background colors when printing. A logo that fails to load
 * falls back to the Crest (spec R6).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { canWaitForCrestFont, crestPng, CREST_EXPORT_FONT, CREST_EXPORT_PX, waitForCrestFont } from "@/lib/utils/canvas/crest-png";
import { resolveCrestColor } from "@/lib/utils/crest";
import { cleanTeamName, EXPORT_MARK_HEIGHT, teamLogoAlt } from "@/lib/utils/team-mark";
import { useMounted } from "@/lib/hooks/useClockText";
import type { TeamMark } from "@/types/practice-planner";

export { CREST_FONT_WAIT_MS } from "@/lib/utils/canvas/crest-png";

/**
 * Whether the Crest may be drawn: once its font has loaded, failed, or taken
 * too long. A canvas draws with whatever face is ready, so painting first would
 * bake a fallback font into the image. Without the Font Loading API there is
 * nothing to wait for. The result is 0 until then, and goes up again when the
 * font arrives after the wait gave up, so the Crest is drawn again in its face.
 */
function useCrestFont(active: boolean): number {
    const mounted = useMounted();
    const [loaded, setLoaded] = useState(false);
    const [redraws, setRedraws] = useState(0);
    const canWait = mounted && canWaitForCrestFont();
    const waiting = canWait && active && !loaded;
    useEffect(() => {
        if (!waiting) return;
        let live = true;
        void waitForCrestFont().then(() => {
            if (live) setLoaded(true);
        });
        return () => {
            live = false;
        };
    }, [waiting]);
    const late = canWait && active && loaded;
    useEffect(() => {
        if (!late || typeof document.fonts.check !== "function" || document.fonts.check(CREST_EXPORT_FONT)) return;
        let live = true;
        document.fonts.load(CREST_EXPORT_FONT).then(
            () => {
                if (live) setRedraws((n) => n + 1);
            },
            () => {},
        );
        return () => {
            live = false;
        };
    }, [late]);
    return mounted && (loaded || !canWaitForCrestFont()) ? 1 + redraws : 0;
}

/**
 * Drawn at the exports' mark height by default, so screen, print and export
 * match. `onReady` fires once the mark has loaded, or once it is known that
 * nothing can be drawn, so print can wait for it (a failed logo first falls
 * back to the Crest).
 */
export function TeamMarkImage({ mark, height = EXPORT_MARK_HEIGHT, onReady }: { mark: TeamMark; height?: number; onReady?: () => void }) {
    const logoSrc = mark.logoImage?.dataUrl ?? mark.logoUrl;
    // Keyed by source, so a replaced logo is tried again.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const useLogo = Boolean(logoSrc) && failedSrc !== logoSrc;
    // Canvas needs the DOM: the Crest is drawn after mount and its font, and only when it is shown.
    const font = useCrestFont(!useLogo);
    const crest = useMemo(
        () => (font > 0 && !useLogo ? crestPng({ name: mark.name, color: resolveCrestColor(mark.id, mark.color), size: CREST_EXPORT_PX }) : null),
        [font, useLogo, mark.name, mark.id, mark.color],
    );
    const src = useLogo ? logoSrc : crest;
    // A failed logo falls back to the Crest; a Crest that fails leaves nothing more to wait for.
    const onError = () => {
        if (useLogo && logoSrc) setFailedSrc(logoSrc);
        else onReady?.();
    };

    // Nothing to draw: the Crest couldn't be painted. Print shouldn't wait for it.
    const nothing = font > 0 && !useLogo && !crest;
    useEffect(() => {
        if (nothing) onReady?.();
    }, [nothing, onReady]);

    // A server-rendered logo can settle before hydration attaches onLoad/onError.
    const settled = useCallback(
        (el: HTMLImageElement | null) => {
            if (!el?.complete || !src) return;
            if (el.naturalWidth > 0) onReady?.();
            else if (useLogo && logoSrc) setFailedSrc(logoSrc);
        },
        [src, useLogo, logoSrc, onReady],
    );

    if (!src) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL or a blob URL, printed as is; both apps render it
        <img
            ref={settled}
            src={src}
            alt={teamLogoAlt(cleanTeamName(mark.name))}
            onLoad={() => onReady?.()}
            onError={onError}
            style={{ height, width: "auto", maxWidth: height * 3, objectFit: "contain", display: "block", flexShrink: 0 }}
        />
    );
}
