"use client";

import { useEffect, useState } from "react";
import { onDiagramFontLoaded } from "@/lib/utils/canvas/diagram-fonts";

/** A number that changes when the diagram font finishes loading: add it to a live canvas's redraw deps. */
export function useDiagramFontVersion(): number {
    const [version, setVersion] = useState(0);
    useEffect(() => onDiagramFontLoaded(() => setVersion((v) => v + 1)), []);
    return version;
}
