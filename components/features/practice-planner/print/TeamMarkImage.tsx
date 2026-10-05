"use client";

/**
 * The bench sheet's team mark (practice logo spec R5): the logo, else the
 * team's Crest drawn as an image. An image, not the CSS Crest, because
 * browsers drop background colors when printing. A logo that fails to load
 * falls back to the Crest (spec R6).
 */
import { useEffect, useMemo, useState } from "react";
import { canWaitForCrestFont, crestPng, CREST_EXPORT_PX, waitForCrestFont } from "@/lib/utils/canvas/crest-png";
import { resolveCrestColor } from "@/lib/utils/crest";
import { cleanTeamName, EXPORT_MARK_HEIGHT, teamLogoAlt } from "@/lib/utils/team-mark";
import { useMounted } from "@/lib/hooks/useClockText";
import type { TeamMark } from "@/types/practice-planner";

export { CREST_FONT_WAIT_MS } from "@/lib/utils/canvas/crest-png";

/**
 * True once the Crest's font has loaded, failed, or taken too long. A canvas
 * draws with whatever face is ready, so painting first would bake a fallback
 * font into the image. Without the Font Loading API there is nothing to wait for.
 */
function useCrestFontReady(active: boolean): boolean {
    const mounted = useMounted();
    const [loaded, setLoaded] = useState(false);
    const waiting = mounted && active && !loaded && canWaitForCrestFont();
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
    return mounted && (loaded || !canWaitForCrestFont());
}

/** Drawn at the exports' mark height by default, so screen, print and export match. */
export function TeamMarkImage({ mark, height = EXPORT_MARK_HEIGHT }: { mark: TeamMark; height?: number }) {
    const [failed, setFailed] = useState(false);
    const useLogo = Boolean(mark.logoUrl) && !failed;
    // Canvas needs the DOM: the Crest is drawn after mount and its font, and only when it is shown.
    const fontReady = useCrestFontReady(!useLogo);
    const crest = useMemo(
        () => (fontReady && !useLogo ? crestPng({ name: mark.name, color: resolveCrestColor(mark.id, mark.color), size: CREST_EXPORT_PX }) : null),
        [fontReady, useLogo, mark.name, mark.id, mark.color],
    );
    const src = useLogo ? mark.logoUrl : crest;
    if (!src) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL or a blob URL, printed as is; both apps render it
        <img
            src={src}
            alt={teamLogoAlt(cleanTeamName(mark.name))}
            onError={() => setFailed(true)}
            style={{ height, width: "auto", maxWidth: height * 3, objectFit: "contain", display: "block", flexShrink: 0 }}
        />
    );
}
