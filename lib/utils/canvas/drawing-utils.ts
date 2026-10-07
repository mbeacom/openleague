/**
 * Drawing utilities for the Hockey Practice Planner
 *
 * This module provides functions to draw various elements on the rink board:
 * - Strokes by hockey action (skate, carry, pass, shot, ...) with end caps
 * - Player icons with labels and colors
 * - Text annotations
 *
 * Requirements: 1.2, 1.3, 1.4, 5.1, 5.2
 */

import {
    Position,
    PlayerIcon,
    DrawingElement,
    TextAnnotation,
    EquipmentItem,
    PlayData,
} from "@/types/practice-planner";
import type { RinkRect, StrokeOptions } from "@/types/practice-planner";
import { FULL_RINK, TransformContext, drawRink, rinkToCanvas } from "./rink-renderer";
import { buildStrokeGeometry, strokeCenterline, type StrokeGeometry } from "./stroke-geometry";
import { drawPlayerGlyph, drawEquipmentGlyph } from "./glyphs";
import { EQUIPMENT_RADIUS_FT, MIN_GLYPH_RADIUS_PX, PLAYER_RADIUS_FT, glyphRadiusPx } from "./glyph-metrics";
import { BOARD_COLORS } from "./notation";
import { MIN_LINE_PX, REFERENCE_PX_PER_FT, refPx } from "./scale";
import type { LineHandle, SnapTarget } from "./line-editing";
import { DIAGRAM_THEME } from "./diagram-theme";

/** The shortest arrowhead drawn, so a tiny diagram's arrows still read as arrows. */
export const ARROW_MIN_PX = 4;

/** The thinnest line and shortest arrowhead a stroke is drawn with. */
export interface StrokeFloors {
    linePx: number;
    arrowPx: number;
}

/** Diagrams nobody edits: thumbnails, print, the station map. */
export const DIAGRAM_STROKE_FLOORS: StrokeFloors = { linePx: MIN_LINE_PX, arrowPx: ARROW_MIN_PX };

/** The editing board keeps lines and arrows readable on a phone, where the rink is small. */
export const BOARD_STROKE_FLOORS: StrokeFloors = { linePx: 1.5, arrowPx: 6 };

/** Board floors in user space under the board's pinch zoom, so they stay constant on screen. */
export function boardStrokeFloors(zoom: number): StrokeFloors {
    return { linePx: BOARD_STROKE_FLOORS.linePx / zoom, arrowPx: BOARD_STROKE_FLOORS.arrowPx / zoom };
}

/**
 * Visual constants for drawing
 */
const SELECTION_COLOR = DIAGRAM_THEME.selection;

/**
 * Draws a stroke by hockey action (pattern), path style and end cap.
 * Geometry is computed in canvas px by `buildStrokeGeometry`.
 */
export function drawStroke(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeOptions & { points: Position[]; color: string; strokeWidth: number },
    transform: TransformContext,
    floors: StrokeFloors = DIAGRAM_STROKE_FLOORS
): void {
    if (stroke.points.length < 2) return;
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    const geometry = buildStrokeGeometry(
        { ...stroke, points: stroke.points.map((p) => rinkToCanvas(p, transform)) },
        pxPerFt,
        floors.linePx
    );

    paintStrokeGeometry(ctx, geometry, stroke.color, pxPerFt, floors.arrowPx);
}

/**
 * Paints precomputed stroke geometry (canvas px): the pattern polylines, then
 * the end cap. Shared by the board and the drill legend swatches.
 */
export function paintStrokeGeometry(
    ctx: CanvasRenderingContext2D,
    geometry: StrokeGeometry,
    color: string,
    pxPerFt: number,
    minArrowPx: number = ARROW_MIN_PX
): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = geometry.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const line of geometry.polylines) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
        ctx.stroke();
    }

    if (!geometry.end) return;
    const { tip, angle, type } = geometry.end;
    if (type === "arrow") {
        const from = { x: tip.x - Math.cos(angle), y: tip.y - Math.sin(angle) };
        drawArrowHead(ctx, from, tip, color, geometry.lineWidth, pxPerFt, minArrowPx);
    } else {
        const half = Math.max(1.8 * pxPerFt, 2);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        ctx.beginPath();
        ctx.moveTo(tip.x + nx * half, tip.y + ny * half);
        ctx.lineTo(tip.x - nx * half, tip.y - ny * half);
        ctx.stroke();
    }
}

/**
 * Draws an arrow head at the end of a line
 *
 * @param ctx - Canvas 2D rendering context
 * @param from - Starting point of the arrow segment
 * @param to - End point where arrow head is drawn
 * @param color - Arrow color
 * @param strokeWidth - The drawn (already scaled) line width
 * @param pxPerFt - The diagram's scale, so the head stays in proportion to the rink
 * @param minArrowPx - The shortest head drawn
 */
function drawArrowHead(
    ctx: CanvasRenderingContext2D,
    from: Position,
    to: Position,
    color: string,
    strokeWidth: number,
    pxPerFt: number,
    minArrowPx: number
): void {
    // 10 px, or 5 line widths, on the reference board; in proportion elsewhere (scale model).
    const headLength = Math.max(refPx(10, pxPerFt, minArrowPx), strokeWidth * 5);

    // Calculate angle of the line
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.fillStyle = color;
    ctx.beginPath();

    // Arrow head tip
    ctx.moveTo(to.x, to.y);

    // Left side of arrow head
    ctx.lineTo(
        to.x - headLength * Math.cos(angle - Math.PI / 6),
        to.y - headLength * Math.sin(angle - Math.PI / 6)
    );

    // Right side of arrow head
    ctx.lineTo(
        to.x - headLength * Math.cos(angle + Math.PI / 6),
        to.y - headLength * Math.sin(angle + Math.PI / 6)
    );

    ctx.closePath();
    ctx.fill();
}

/**
 * Draws a player icon with label and color
 * Requirements: 1.2
 *
 * @param ctx - Canvas 2D rendering context
 * @param player - Player icon data
 * @param transform - Transformation context for coordinate conversion
 * @param isSelected - Whether the player is currently selected
 */
export function drawPlayerIcon(
    ctx: CanvasRenderingContext2D,
    player: PlayerIcon,
    transform: TransformContext,
    isSelected: boolean = false,
    zoom: number = 1,
    minGlyphRadiusPx: number = MIN_GLYPH_RADIUS_PX
): void {
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    drawPlayerGlyph(
        ctx,
        player,
        rinkToCanvas(player.position, transform),
        glyphRadiusPx(PLAYER_RADIUS_FT, pxPerFt, zoom, minGlyphRadiusPx),
        isSelected,
        pxPerFt / REFERENCE_PX_PER_FT
    );
}

/**
 * Draws an equipment item (puck, cone, net, ...)
 */
export function drawEquipmentItem(
    ctx: CanvasRenderingContext2D,
    item: EquipmentItem,
    transform: TransformContext,
    isSelected: boolean = false,
    zoom: number = 1,
    minGlyphRadiusPx: number = MIN_GLYPH_RADIUS_PX
): void {
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    drawEquipmentGlyph(
        ctx,
        item,
        rinkToCanvas(item.position, transform),
        glyphRadiusPx(EQUIPMENT_RADIUS_FT[item.kind], pxPerFt, zoom, minGlyphRadiusPx),
        isSelected,
        pxPerFt / REFERENCE_PX_PER_FT
    );
}

/**
 * Draws a text annotation
 * Requirements: 1.4
 *
 * @param ctx - Canvas 2D rendering context
 * @param annotation - Text annotation data
 * @param transform - Transformation context for coordinate conversion
 * @param isSelected - Whether the annotation is currently selected
 */
export function drawTextAnnotation(
    ctx: CanvasRenderingContext2D,
    annotation: TextAnnotation,
    transform: TransformContext,
    isSelected: boolean = false
): void {
    const canvasPos = rinkToCanvas(annotation.position, transform);
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    // 2 px of padding (4 for the selection) on the reference board, in proportion elsewhere (scale model).
    const pad = refPx(2, pxPerFt);
    const selectPad = refPx(4, pxPerFt);
    const scaledFontSize = annotation.fontSize * Math.min(transform.scaleX, transform.scaleY);

    // Measure text for background
    ctx.font = `${scaledFontSize}px ${DIAGRAM_THEME.noteFont}`;
    const metrics = ctx.measureText(annotation.text);
    const textWidth = metrics.width;
    const textHeight = scaledFontSize;

    // Draw selection highlight if selected
    if (isSelected) {
        ctx.fillStyle = DIAGRAM_THEME.selectionFill;
        ctx.fillRect(
            canvasPos.x - selectPad,
            canvasPos.y - textHeight - selectPad,
            textWidth + 2 * selectPad,
            textHeight + 2 * selectPad
        );
    }

    // Draw semi-transparent background for readability
    ctx.fillStyle = DIAGRAM_THEME.noteChip;
    ctx.fillRect(canvasPos.x - pad, canvasPos.y - textHeight - pad, textWidth + 2 * pad, textHeight + 2 * pad);

    // Draw text
    ctx.fillStyle = annotation.color;
    ctx.font = `${scaledFontSize}px ${DIAGRAM_THEME.noteFont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(annotation.text, canvasPos.x, canvasPos.y - textHeight);
}

/**
 * Draws a complete drawing element (line, curve, or arrow)
 * Requirements: 1.3, 5.1, 5.2
 *
 * @param ctx - Canvas 2D rendering context
 * @param element - Drawing element data
 * @param transform - Transformation context for coordinate conversion
 * @param isSelected - Whether the element is currently selected
 */
export function drawElement(
    ctx: CanvasRenderingContext2D,
    element: DrawingElement,
    transform: TransformContext,
    isSelected: boolean = false,
    floors: StrokeFloors = DIAGRAM_STROKE_FLOORS
): void {
    // Draw selection highlight if selected
    if (isSelected) {
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = refPx(element.strokeWidth + 4, Math.min(transform.scaleX, transform.scaleY));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.5;

        // A curve's highlight follows its curve; straight and freehand lines keep theirs on the stored points
        const stored = element.points.map((p) => rinkToCanvas(p, transform));
        const path = element.path === "curve" ? strokeCenterline({ path: "curve", points: stored }) : stored;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    drawStroke(ctx, element, transform, floors);
}

/** A line handle's radius on screen, at any zoom (line editing R6). */
export const LINE_HANDLE_RADIUS_PX = 7;

export interface LineEditColors {
    /** Inside of end, bend and anchor handles; the plus on "+" handles */
    handleFill: string;
    /** Handle outlines and the "+" disc */
    handleStroke: string;
    /** The snap ring */
    snapRing: string;
}

/**
 * Draws the selected line's handles (rink feet, under the board's zoom):
 * ends, bends and anchors as rings, a polyline's corners as squares (so a
 * sharp corner reads differently from a curve's bend), and "+" handles as
 * filled discs with a plus. `zoom` keeps the size and outline the same on screen.
 */
export function drawLineHandles(
    ctx: CanvasRenderingContext2D,
    handles: readonly LineHandle[],
    transform: TransformContext,
    colors: LineEditColors,
    zoom: number = 1
): void {
    const radius = LINE_HANDLE_RADIUS_PX / zoom;
    ctx.save();
    ctx.lineWidth = 2 / zoom;
    for (const handle of handles) {
        const c = rinkToCanvas(handle.position, transform);
        const add = handle.kind === "add";
        ctx.beginPath();
        if (handle.kind === "corner") ctx.rect(c.x - radius, c.y - radius, radius * 2, radius * 2);
        else ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = add ? colors.handleStroke : colors.handleFill;
        ctx.fill();
        ctx.strokeStyle = colors.handleStroke;
        ctx.stroke();
        if (add) {
            const arm = radius * 0.55;
            ctx.beginPath();
            ctx.moveTo(c.x - arm, c.y);
            ctx.lineTo(c.x + arm, c.y);
            ctx.moveTo(c.x, c.y - arm);
            ctx.lineTo(c.x, c.y + arm);
            ctx.strokeStyle = colors.handleFill;
            ctx.stroke();
        }
    }
    ctx.restore();
}

/** The snap ring's smallest radius on screen, at any zoom: a line end's ring (line editing R4). */
export const SNAP_RING_RADIUS_PX = 14;
/** On screen, how far the ring sits outside a player's or an equipment item's glyph outline. */
const SNAP_RING_GAP_PX = 5;
/** How far a glyph's outline reaches past its radius, as a share of it: half the widest outline (a ring player's, 0.22 r). */
const GLYPH_OUTLINE_OUTSET = 0.11;
/** The halo under the snap ring: white, as the handles' fill (LINE_EDIT_COLORS.handleFill) */
const SNAP_RING_HALO = DIAGRAM_THEME.snapRingHalo;

/**
 * Rings a snap target while a line end is snapping (line editing R4): outside
 * the target's drawn glyph and its outline (glyphRadiusPx, with its on-screen minimum), and at
 * least SNAP_RING_RADIUS_PX, as a ring over a white halo so it reads on ice,
 * lines and tokens alike.
 */
export function drawSnapRing(
    ctx: CanvasRenderingContext2D,
    target: SnapTarget,
    transform: TransformContext,
    color: string,
    zoom: number = 1
): void {
    const c = rinkToCanvas(target.position, transform);
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    const glyph = target.radiusFt > 0 ? glyphRadiusPx(target.radiusFt, pxPerFt, zoom) * (1 + GLYPH_OUTLINE_OUTSET) : 0;
    const radius = Math.max(SNAP_RING_RADIUS_PX / zoom, glyph + SNAP_RING_GAP_PX / zoom);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = SNAP_RING_HALO;
    ctx.lineWidth = 6 / zoom;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 / zoom;
    ctx.stroke();
    ctx.restore();
}

/**
 * Draws all elements from play data: drawings, equipment, players, annotations
 *
 * @param ctx - Canvas 2D rendering context
 * @param playData - Play data to render
 * @param transform - Transformation context
 * @param selectedId - ID of currently selected element (if any)
 * @param zoom - Canvas zoom applied by the caller (keeps minimum glyph size on screen)
 */
export function drawAllElements(
    ctx: CanvasRenderingContext2D,
    playData: PlayData,
    transform: TransformContext,
    selectedId?: string,
    zoom: number = 1,
    minGlyphRadiusPx: number = MIN_GLYPH_RADIUS_PX,
    strokeFloors: StrokeFloors = DIAGRAM_STROKE_FLOORS
): void {
    playData.drawings.forEach((d) => drawElement(ctx, d, transform, d.id === selectedId, strokeFloors));
    playData.equipment.forEach((e) => drawEquipmentItem(ctx, e, transform, e.id === selectedId, zoom, minGlyphRadiusPx));
    playData.players.forEach((p) => drawPlayerIcon(ctx, p, transform, p.id === selectedId, zoom, minGlyphRadiusPx));
    playData.annotations.forEach((a) => drawTextAnnotation(ctx, a, transform, a.id === selectedId));
}

/** Ink (#212121) at 35%: shades the ice outside a drill's area. */
const AREA_MASK_FILL = DIAGRAM_THEME.areaMask;
const AREA_OUTLINE_DASH = [8, 6];
const AREA_OUTLINE_WIDTH = 2;

function coversRink(rect: RinkRect): boolean {
    return rect.x <= 0 && rect.y <= 0 && rect.x + rect.w >= FULL_RINK.w && rect.y + rect.h >= FULL_RINK.h;
}

/**
 * Shades the rink outside `rect` (even-odd fill of the rink rectangle minus
 * the area) and outlines the area, dashed, in Action Blue. Draws nothing when
 * `rect` covers the whole rink. `zoom` is the caller's canvas zoom: the
 * outline's width and dash are divided by it so they stay the same on screen.
 */
export function drawAreaMask(
    ctx: CanvasRenderingContext2D,
    rect: RinkRect,
    transform: TransformContext,
    zoom: number = 1
): void {
    if (coversRink(rect)) return;
    const rinkTopLeft = rinkToCanvas({ x: 0, y: 0 }, transform);
    const rinkBottomRight = rinkToCanvas({ x: FULL_RINK.w, y: FULL_RINK.h }, transform);
    const topLeft = rinkToCanvas({ x: rect.x, y: rect.y }, transform);
    const bottomRight = rinkToCanvas({ x: rect.x + rect.w, y: rect.y + rect.h }, transform);

    ctx.save();
    ctx.fillStyle = AREA_MASK_FILL;
    ctx.beginPath();
    ctx.rect(rinkTopLeft.x, rinkTopLeft.y, rinkBottomRight.x - rinkTopLeft.x, rinkBottomRight.y - rinkTopLeft.y);
    ctx.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.fill("evenodd");
    ctx.strokeStyle = BOARD_COLORS.actionBlue;
    ctx.lineWidth = AREA_OUTLINE_WIDTH / zoom;
    ctx.setLineDash(AREA_OUTLINE_DASH.map((d) => d / zoom));
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.restore();
}

export interface BoardSceneOptions {
    /** Element drawn with the selection highlight */
    selectedId?: string;
    /** Canvas zoom applied by the caller (keeps minimum glyph size and the mask outline constant on screen) */
    zoom?: number;
    /** Rectangle left unshaded; omitted, or covering the rink, means no mask */
    maskRect?: RinkRect;
    /** Draw the rink from its cached background (default true); see DrawRinkOptions.cache */
    cachedRink?: boolean;
    /** Smallest glyph radius in screen px (default the board's 8, which keeps markers grabbable) */
    minGlyphRadiusPx?: number;
    /** Thinnest line and shortest arrowhead (default the 1 px / 4 px diagram floors; the board passes its own) */
    strokeFloors?: StrokeFloors;
}

/**
 * The board's draw sequence, shared by RinkBoard and thumbnails: rink, then
 * elements, then the area mask on top, so elements outside the area are
 * dimmed with the ice they sit on.
 */
export function drawBoardScene(
    ctx: CanvasRenderingContext2D,
    transform: TransformContext,
    playData: PlayData,
    options: BoardSceneOptions = {}
): void {
    drawRink(ctx, transform, { cache: options.cachedRink ?? true });
    drawAllElements(
        ctx,
        playData,
        transform,
        options.selectedId,
        options.zoom ?? 1,
        options.minGlyphRadiusPx ?? MIN_GLYPH_RADIUS_PX,
        options.strokeFloors ?? DIAGRAM_STROKE_FLOORS
    );
    if (options.maskRect) drawAreaMask(ctx, options.maskRect, transform, options.zoom ?? 1);
}

export interface BoardFrameOptions extends BoardSceneOptions {
    /** Board pan in screen pixels, applied with `zoom` (default none) */
    pan?: Position;
    /** Backing-store pixels per CSS pixel (backing-store.ts); default 1 */
    pixelRatio?: number;
}

/**
 * One RinkBoard animation frame. Clears the whole canvas under the pixel-ratio
 * transform alone (a clear under the zoom/pan transform misses part of the screen,
 * and the 35% area mask then stacks on the uncleared pixels every frame),
 * applies the zoom/pan transform for drawing, then draws the scene once.
 * Zoomed or panned, the rink is drawn directly, because the cached background
 * only covers a canvas-sized rectangle at the origin; at zoom 1 with no pan
 * the cache is used as before, at pixel ratio 1 only (above it the cached
 * CSS-size bitmap would be upscaled). The transform is left applied so the caller
 * can draw an in-progress stroke on top.
 */
export function drawBoardFrame(
    ctx: CanvasRenderingContext2D,
    transform: TransformContext,
    playData: PlayData,
    options: BoardFrameOptions = {}
): void {
    const zoom = options.zoom ?? 1;
    const pan = options.pan ?? { x: 0, y: 0 };
    const ratio = options.pixelRatio ?? 1;
    ctx.save();
    // Clear in CSS pixels under the ratio alone: the whole canvas, whatever the zoom or pan.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, transform.canvasWidth, transform.canvasHeight);
    ctx.restore();
    ctx.setTransform(zoom * ratio, 0, 0, zoom * ratio, pan.x * ratio, pan.y * ratio);
    const shifted = zoom !== 1 || pan.x !== 0 || pan.y !== 0;
    // The cached rink is a CSS-size bitmap: use it only where it maps 1:1 onto the backing store.
    drawBoardScene(ctx, transform, playData, {
        ...options,
        zoom,
        cachedRink: !shifted && ratio === 1,
        // The editing board keeps lines and arrows readable on a phone (scale model).
        strokeFloors: options.strokeFloors ?? boardStrokeFloors(zoom),
    });
}
