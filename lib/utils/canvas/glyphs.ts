/**
 * Canvas painters for player-role and equipment glyphs (Digital Playbook look).
 * Callers convert rink feet to canvas px; these draw at a center + radius.
 */
import type { EquipmentItem, PlayerIcon, PlayerRole, Position } from "@/types/practice-planner";
import { BOARD_COLORS } from "./notation";
import { MIN_LINE_PX } from "./scale";
import { DIAGRAM_THEME } from "./diagram-theme";
import { diagramFont } from "./diagram-fonts";

const SELECTION_COLOR = DIAGRAM_THEME.selection;

/** An outline: a fraction of the radius, never below `floorPx` on the reference board (× scale) or 1 px. */
const outline = (r: number, fraction: number, floorPx: number, scale: number) => Math.max(r * fraction, floorPx * scale, MIN_LINE_PX);

export const PLAYER_GLYPH_SHAPE: Record<PlayerRole, "disc" | "ring" | "goalie" | "triangle"> = {
    X: "disc",
    F: "disc",
    D: "disc",
    O: "ring",
    G: "goalie",
    C: "triangle",
};

function contrastText(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? DIAGRAM_THEME.labelOnLight : DIAGRAM_THEME.labelOnDark;
}

function selectionRing(ctx: CanvasRenderingContext2D, c: Position, r: number) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
}

/** Shrinks the font to fit; at the minimum size, truncates with an ellipsis. Returns the text to draw. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number): string {
    const MIN_FONT_PX = 6;
    let size = startPx;
    ctx.font = diagramFont(800, size);
    while (size > MIN_FONT_PX && ctx.measureText(text).width > maxWidth) {
        size -= 0.5;
        ctx.font = diagramFont(800, size);
    }
    if (ctx.measureText(text).width <= maxWidth) return text;
    let shown = text;
    while (shown.length > 1 && ctx.measureText(`${shown}\u2026`).width > maxWidth) {
        shown = shown.slice(0, -1);
    }
    return `${shown}\u2026`;
}

export function drawPlayerGlyph(
    ctx: CanvasRenderingContext2D,
    player: PlayerIcon,
    c: Position,
    r: number,
    isSelected: boolean,
    /** pxPerFt ÷ the reference board's (scale model); outline floors scale with it */
    scale: number = 1
): void {
    if (isSelected) selectionRing(ctx, c, r);
    const shape = PLAYER_GLYPH_SHAPE[player.role];
    const text = player.label.trim() || player.role;
    let textColor = contrastText(player.color);

    ctx.lineWidth = outline(r, 0.12, 1.5, scale);
    switch (shape) {
        case "disc":
        case "goalie":
            ctx.fillStyle = player.color;
            ctx.strokeStyle = BOARD_COLORS.ink;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (shape === "goalie") {
                ctx.fillStyle = textColor;
                ctx.fillRect(c.x - r * 0.7, c.y + r * 0.45, r * 1.4, r * 0.22);
            }
            break;
        case "ring":
            ctx.fillStyle = DIAGRAM_THEME.ringFill;
            ctx.strokeStyle = player.color;
            ctx.lineWidth = outline(r, 0.22, 2, scale);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            textColor = player.color;
            break;
        case "triangle":
            ctx.fillStyle = player.color;
            ctx.strokeStyle = BOARD_COLORS.ink;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y - r * 1.1);
            ctx.lineTo(c.x + r, c.y + r * 0.75);
            ctx.lineTo(c.x - r, c.y + r * 0.75);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
    }

    const shownText = fitText(ctx, text, r * 1.6, r * 1.05);
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shownText, c.x, shape === "triangle" ? c.y + r * 0.15 : c.y);
}

export function drawEquipmentGlyph(
    ctx: CanvasRenderingContext2D,
    item: Pick<EquipmentItem, "kind" | "rotation">,
    c: Position,
    r: number,
    isSelected: boolean,
    /** pxPerFt ÷ the reference board's (scale model); outline floors scale with it */
    scale: number = 1
): void {
    if (isSelected) selectionRing(ctx, c, r);
    ctx.lineWidth = outline(r, 0.15, 1.5, scale);
    ctx.strokeStyle = BOARD_COLORS.ink;

    switch (item.kind) {
        case "puck":
            ctx.fillStyle = BOARD_COLORS.ink;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
            break;
        case "puckPile":
            ctx.fillStyle = BOARD_COLORS.ink;
            for (const [dx, dy] of [[-0.4, 0.25], [0.4, 0.25], [0, -0.35]]) {
                ctx.beginPath();
                ctx.arc(c.x + dx * r, c.y + dy * r, r * 0.38, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case "cone":
        case "pylon": {
            const w = item.kind === "cone" ? r : r * 0.6;
            ctx.fillStyle = DIAGRAM_THEME.cone;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y - r);
            ctx.lineTo(c.x + w, c.y + r * 0.8);
            ctx.lineTo(c.x - w, c.y + r * 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case "tire":
            ctx.lineWidth = outline(r, 0.35, 2.5, scale);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case "net":
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate((item.rotation * Math.PI) / 180);
            ctx.strokeStyle = DIAGRAM_THEME.net;
            ctx.beginPath();
            ctx.moveTo(-r * 0.4, -r);
            ctx.lineTo(r * 0.4, -r);
            ctx.lineTo(r * 0.4, r);
            ctx.lineTo(-r * 0.4, r);
            ctx.stroke();
            ctx.restore();
            break;
    }
}
