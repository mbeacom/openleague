"use client";

/**
 * Plays a drill's diagram as an animation (animated drill playback design
 * R9–R11). Read-only: frames come from `poseAt`/`poseStep` and are drawn with
 * the board renderer; nothing here ever saves.
 *
 * Draws only when something changes: a requestAnimationFrame loop runs while
 * playing and stops on pause, at the end, when the tab is hidden or the board
 * scrolls off screen. A static layer (rink plus every stroke that isn't moving)
 * is redrawn only when a stroke changes state. No autoplay: motion starts on a
 * tap. With reduced motion it opens in step mode. No server or Next imports:
 * the static planner shares this component.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
    Box,
    FormControlLabel,
    IconButton,
    Slider,
    Stack,
    Switch,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
    type SxProps,
    type Theme,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
    Close as CloseIcon,
    Pause as PauseIcon,
    PlayArrow as PlayIcon,
    Repeat as LoopIcon,
    SkipNext as StepForwardIcon,
    SkipPrevious as StepBackIcon,
} from "@mui/icons-material";
import type { PlayData } from "@/types/practice-planner";
import {
    LOOP_HOLD_MS,
    describeStep,
    getPlayback,
    poseAt,
    poseStep,
    type Playback,
    type PlaybackFrame,
} from "@/lib/utils/canvas/playback";
import { THUMBNAIL_ASPECT, thumbnailPadding } from "@/lib/utils/canvas/thumbnail-generator";
import { createTransformContext, drawRink } from "@/lib/utils/canvas/rink-renderer";
import { drawAreaMask, drawElement, drawEquipmentItem, drawPlayerIcon, drawTextAnnotation } from "@/lib/utils/canvas/drawing-utils";
import { THUMBNAIL_MIN_GLYPH_RADIUS_PX } from "@/lib/utils/canvas/glyph-metrics";
import { backingPixelRatio, sizeBackingStore, watchPixelRatio } from "@/lib/utils/canvas/backing-store";
import { areaRect } from "@/lib/utils/ice-area";
import { useDiagramFontVersion } from "@/lib/hooks/useDiagramFontVersion";

/** Pixel ratio cap while playing (R11). */
export const PLAYBACK_MAX_PIXEL_RATIO = 2;
export const PLAYBACK_SPEEDS = [0.5, 1, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** The slider and caption follow the playhead at most this often while playing; the canvas every frame. */
const UI_UPDATE_MS = 100;
const TARGET = { minWidth: 44, minHeight: 44 } as const;

export interface PlaybackBoardProps {
    playData: PlayData;
    /** The drill's name; the canvas is announced as "<label> diagram". */
    label: string;
    /** Start playing on mount. For a board opened by a tap on Play; ignored with reduced motion. */
    startPlaying?: boolean;
    /** Shows a close button that returns to the still diagram. */
    onClose?: () => void;
    sx?: SxProps<Theme>;
}

interface Layer {
    canvas: HTMLCanvasElement | null;
    key: string;
}

/**
 * Draws one frame: the cached static layer (rink plus every stroke that isn't
 * moving), then the moving strokes, equipment, players, notes and the area
 * mask, in drawAllElements' z-order. The same scene PlayDiagram draws.
 */
function drawFrame(
    canvas: HTMLCanvasElement,
    layer: Layer,
    frame: PlaybackFrame,
    width: number,
    height: number,
    ratio: number,
    fontVersion: number
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const transform = createTransformContext(width, height, thumbnailPadding(width));
    const active = new Set(frame.activeStrokeIds);
    const key = `${width}x${height}@${ratio}#${fontVersion}|${frame.completedStrokeIds.join(",")}|${frame.activeStrokeIds.join(",")}`;
    if (!layer.canvas) layer.canvas = document.createElement("canvas");
    if (layer.key !== key) {
        const lc = layer.canvas;
        sizeBackingStore(lc, width, height, ratio);
        const lctx = lc.getContext("2d");
        if (!lctx) return;
        lctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        lctx.fillStyle = "#FFFFFF";
        lctx.fillRect(0, 0, width, height);
        drawRink(lctx, transform, { cache: false });
        frame.data.drawings.forEach((d) => {
            if (!active.has(d.id)) drawElement(lctx, d, transform);
        });
        layer.key = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    frame.data.drawings.forEach((d) => {
        if (active.has(d.id)) drawElement(ctx, d, transform);
    });
    frame.data.equipment.forEach((e) => drawEquipmentItem(ctx, e, transform, false, 1, THUMBNAIL_MIN_GLYPH_RADIUS_PX));
    frame.data.players.forEach((p) => drawPlayerIcon(ctx, p, transform, false, 1, THUMBNAIL_MIN_GLYPH_RADIUS_PX));
    frame.data.annotations.forEach((a) => drawTextAnnotation(ctx, a, transform));
    drawAreaMask(ctx, areaRect(frame.data.area), transform);
}

/** "Step 2 of 4 · LW: Puck carry · D1: Pass", or how many steps there are before the first. */
export function playbackCaption(playback: Playback, stepIndex: number): string {
    const total = playback.steps.length;
    if (stepIndex < 0) return `${total} ${total === 1 ? "step" : "steps"}`;
    const detail = describeStep(playback, stepIndex);
    return `Step ${stepIndex + 1} of ${total}${detail ? ` · ${detail}` : ""}`;
}

export function PlaybackBoard({ playData, label, startPlaying = false, onClose, sx }: PlaybackBoardProps) {
    const playback = useMemo(() => getPlayback(playData), [playData]);
    const { durationMs, steps } = playback;
    const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY, { noSsr: true });
    const [animate, setAnimate] = useState(false);
    const stepMode = reducedMotion && !animate;

    const [t, setT] = useState(0);
    /** Step mode: 0 = before the first step, k = the end of step k. */
    const [stepPos, setStepPos] = useState(0);
    const [playing, setPlaying] = useState(() => startPlaying && !reducedMotion && durationMs > 0);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    const [loop, setLoop] = useState(false);
    const tRef = useRef(0);
    const loopRef = useRef(loop);
    useEffect(() => {
        loopRef.current = loop;
    }, [loop]);

    const boxRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const layerRef = useRef<Layer>({ canvas: null, key: "" });
    const [size, setSize] = useState({ width: 0, height: 0 });
    const fontVersion = useDiagramFontVersion();
    const [ratio, setRatio] = useState(() => Math.min(PLAYBACK_MAX_PIXEL_RATIO, backingPixelRatio()));
    useEffect(() => watchPixelRatio(() => setRatio(Math.min(PLAYBACK_MAX_PIXEL_RATIO, backingPixelRatio()))), []);

    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
        });
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && size.width > 0 && size.height > 0) sizeBackingStore(canvas, size.width, size.height, ratio);
        layerRef.current.key = "";
    }, [size, ratio]);

    const draw = useCallback(
        (frame: PlaybackFrame) => {
            const canvas = canvasRef.current;
            // A hidden or collapsed container measures 0: wait until it has a size.
            if (!canvas || size.width === 0 || size.height === 0) return;
            try {
                drawFrame(canvas, layerRef.current, frame, size.width, size.height, ratio, fontVersion);
            } catch (error) {
                console.warn(`Couldn't draw the animation for "${label}":`, error);
            }
        },
        [size, ratio, fontVersion, label]
    );

    const frame = useMemo(
        () => (stepMode ? poseStep(playback, stepPos - 1) : poseAt(playback, t)),
        [playback, stepMode, stepPos, t]
    );
    const stepIndex = frame.stepIndex;

    // Paused: draw once per change of playhead, size or font. Playing: the loop draws.
    useEffect(() => {
        if (!playing) draw(frame);
    }, [playing, frame, draw]);

    // The playback loop: performance.now() deltas × speed, so a slow device drops frames rather than slowing the drill.
    useEffect(() => {
        if (!playing || stepMode) return;
        let raf = 0;
        let last = performance.now();
        let lastShown = last;
        let shownStep = poseAt(playback, tRef.current).stepIndex;
        let holdUntil: number | null = null;
        if (tRef.current >= durationMs) tRef.current = 0;
        const tick = () => {
            const now = performance.now();
            const dt = now - last;
            last = now;
            if (holdUntil !== null) {
                if (now < holdUntil) {
                    raf = requestAnimationFrame(tick);
                    return;
                }
                holdUntil = null;
                tRef.current = 0;
            } else {
                tRef.current = Math.min(durationMs, tRef.current + dt * speed);
            }
            const current = poseAt(playback, tRef.current);
            draw(current);
            const ended = tRef.current >= durationMs;
            if (ended && !loopRef.current) {
                setT(durationMs);
                setPlaying(false);
                return;
            }
            if (ended) holdUntil = now + LOOP_HOLD_MS;
            if (ended || current.stepIndex !== shownStep || now - lastShown >= UI_UPDATE_MS) {
                shownStep = current.stepIndex;
                lastShown = now;
                setT(tRef.current);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, stepMode, speed, playback, durationMs, draw]);

    // Pause when the tab is hidden or the board scrolls off screen.
    useEffect(() => {
        if (!playing) return;
        const onVisibility = () => {
            if (document.hidden) setPlaying(false);
        };
        document.addEventListener("visibilitychange", onVisibility);
        let observer: IntersectionObserver | null = null;
        if (typeof IntersectionObserver !== "undefined" && boxRef.current) {
            observer = new IntersectionObserver((entries) => {
                if (entries.some((e) => !e.isIntersecting)) setPlaying(false);
            });
            observer.observe(boxRef.current);
        }
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            observer?.disconnect();
        };
    }, [playing]);

    // Keep the paused playhead and the slider in step when playing stops mid-way.
    useEffect(() => {
        if (!playing) setT(tRef.current);
    }, [playing]);

    const seek = useCallback(
        (ms: number) => {
            const next = Math.min(durationMs, Math.max(0, ms));
            tRef.current = next;
            setT(next);
        },
        [durationMs]
    );

    const togglePlay = useCallback(() => {
        if (durationMs === 0) return;
        if (!playing && tRef.current >= durationMs) seek(0);
        setPlaying((p) => !p);
    }, [durationMs, playing, seek]);

    const stepForward = useCallback(() => {
        if (stepMode) {
            setStepPos((p) => Math.min(steps.length, p + 1));
            return;
        }
        setPlaying(false);
        const next = steps.find((s) => s.startMs > tRef.current + 0.5);
        seek(next ? next.startMs : durationMs);
    }, [stepMode, steps, seek, durationMs]);

    const stepBack = useCallback(() => {
        if (stepMode) {
            setStepPos((p) => Math.max(0, p - 1));
            return;
        }
        setPlaying(false);
        const prev = [...steps].reverse().find((s) => s.startMs < tRef.current - 0.5);
        seek(prev ? prev.startMs : 0);
    }, [stepMode, steps, seek]);

    const toStart = useCallback(() => {
        setPlaying(false);
        if (stepMode) setStepPos(0);
        else seek(0);
    }, [stepMode, seek]);

    const toEnd = useCallback(() => {
        setPlaying(false);
        if (stepMode) setStepPos(steps.length);
        else seek(durationMs);
    }, [stepMode, steps.length, seek, durationMs]);

    const setAnimateMode = (on: boolean) => {
        setPlaying(false);
        if (on) {
            // Pick up where step mode was: the start of the next step, or the end.
            seek(stepPos === 0 ? 0 : stepPos >= steps.length ? durationMs : steps[stepPos].startMs);
        } else {
            setStepPos(Math.max(0, poseAt(playback, tRef.current).stepIndex + 1));
        }
        setAnimate(on);
    };

    const onBoardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const actions: Record<string, () => void> = {
            " ": stepMode ? stepForward : togglePlay,
            ArrowRight: stepForward,
            ArrowLeft: stepBack,
            Home: toStart,
            End: toEnd,
        };
        const action = actions[event.key];
        if (!action) return;
        event.preventDefault();
        action();
    };

    const caption = playbackCaption(playback, stepIndex);
    const stepText = (index: number) => (index < 0 ? "Start" : `Step ${index + 1} of ${steps.length}`);
    const atEnd = stepMode ? stepPos >= steps.length : t >= durationMs;
    const atStart = stepMode ? stepPos === 0 : t <= 0;

    return (
        <Box sx={[{ display: "flex", flexDirection: "column", gap: 1, displayPrint: "none" }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <Box
                ref={boxRef}
                tabIndex={0}
                role="group"
                aria-label={`${label} playback. Space ${stepMode ? "shows the next step" : "plays or pauses"}; the arrow keys step.`}
                onKeyDown={onBoardKeyDown}
                sx={{
                    width: "100%",
                    aspectRatio: `${THUMBNAIL_ASPECT}`,
                    bgcolor: "common.white",
                    borderRadius: 1,
                    overflow: "hidden",
                    "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
                }}
            >
                <canvas
                    ref={canvasRef}
                    role="img"
                    aria-label={`${label} diagram`}
                    style={{ display: "block", width: "100%", height: "100%" }}
                />
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.5, sm: 1.5 }} alignItems={{ xs: "stretch", sm: "center" }}>
                <Box sx={{ flex: 1, minWidth: 0, px: 1.5, display: "flex", alignItems: "center", minHeight: 44 }}>
                    {stepMode ? (
                        <Slider
                            aria-label="Playback position"
                            min={0}
                            max={Math.max(1, steps.length)}
                            step={1}
                            marks
                            value={stepPos}
                            disabled={steps.length === 0}
                            getAriaValueText={(v) => stepText(v - 1)}
                            onChange={(_, v) => setStepPos(v as number)}
                            sx={{ "& .MuiSlider-thumb::after": { width: 44, height: 44 } }}
                        />
                    ) : (
                        <Slider
                            aria-label="Playback position"
                            min={0}
                            max={Math.max(1, durationMs)}
                            step={10}
                            marks={steps.map((s) => ({ value: s.startMs }))}
                            value={t}
                            disabled={durationMs === 0}
                            getAriaValueText={() => stepText(stepIndex)}
                            onChange={(_, v) => {
                                setPlaying(false);
                                seek(v as number);
                            }}
                            sx={{ "& .MuiSlider-thumb::after": { width: 44, height: 44 } }}
                        />
                    )}
                </Box>

                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Tooltip title="Step back">
                        <span>
                            <IconButton aria-label="Step back" onClick={stepBack} disabled={atStart} sx={TARGET}>
                                <StepBackIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                    {stepMode ? (
                        <Tooltip title="Next step">
                            <span>
                                <IconButton aria-label="Next step" color="primary" onClick={stepForward} disabled={atEnd} sx={TARGET}>
                                    <StepForwardIcon />
                                </IconButton>
                            </span>
                        </Tooltip>
                    ) : (
                        <>
                            <Tooltip title={playing ? "Pause" : "Play"}>
                                <span>
                                    <IconButton
                                        aria-label={playing ? "Pause" : "Play"}
                                        color="primary"
                                        onClick={togglePlay}
                                        disabled={durationMs === 0}
                                        sx={TARGET}
                                    >
                                        {playing ? <PauseIcon /> : <PlayIcon />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title="Step forward">
                                <span>
                                    <IconButton aria-label="Step forward" onClick={stepForward} disabled={atEnd} sx={TARGET}>
                                        <StepForwardIcon />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={speed}
                                aria-label="Playback speed"
                                onChange={(_, v: PlaybackSpeed | null) => {
                                    if (v !== null) setSpeed(v);
                                }}
                            >
                                {PLAYBACK_SPEEDS.map((s) => (
                                    <ToggleButton key={s} value={s} aria-label={`${s}× speed`} sx={TARGET}>
                                        {s}×
                                    </ToggleButton>
                                ))}
                            </ToggleButtonGroup>
                            <Tooltip title="Loop">
                                <ToggleButton
                                    value="loop"
                                    size="small"
                                    selected={loop}
                                    aria-label="Loop"
                                    onChange={() => setLoop((l) => !l)}
                                    sx={TARGET}
                                >
                                    <LoopIcon />
                                </ToggleButton>
                            </Tooltip>
                        </>
                    )}
                    {reducedMotion && (
                        <FormControlLabel
                            control={<Switch checked={animate} onChange={(e) => setAnimateMode(e.target.checked)} />}
                            label="Animate"
                            sx={{ ml: 0.5, mr: 0, minHeight: 44 }}
                        />
                    )}
                    {onClose && (
                        <Tooltip title="Close playback">
                            <IconButton aria-label="Close playback" onClick={onClose} sx={TARGET}>
                                <CloseIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
            </Stack>

            <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ px: 0.5, minHeight: "1.5em" }}>
                {caption}
            </Typography>
        </Box>
    );
}
