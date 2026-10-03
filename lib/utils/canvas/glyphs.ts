/**
 * Canvas painters for player-role and equipment glyphs (Digital Playbook look).
 * Callers convert rink feet to canvas px; these draw at a center + radius.
 */
import type { EquipmentItem, PlayerIcon, PlayerRole, Position } from "@/types/practice-planner";
import { BOARD_COLORS } from "./notation";

const SELECTION_COLOR = "#FFD700";
const FONT_FAMILY = `"Source Sans 3", system-ui, sans-serif`;

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
    return lum > 0.6 ? BOARD_COLORS.ink : "#FFFFFF";
}

function selectionRing(ctx: CanvasRenderingContext2D, c: Position, r: number) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number) {
    let size = startPx;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    while (size > 6 && ctx.measureText(text).width > maxWidth) {
        size -= 1;
        ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    }
}

export function drawPlayerGlyph(
    ctx: CanvasRenderingContext2D,
    player: PlayerIcon,
    c: Position,
    r: number,
    isSelected: boolean
): void {
    if (isSelected) selectionRing(ctx, c, r);
    const shape = PLAYER_GLYPH_SHAPE[player.role];
    const text = player.label || player.role;
    let textColor = contrastText(player.color);

    ctx.lineWidth = Math.max(1.5, r * 0.12);
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
            ctx.fillStyle = "#FFFFFF";
            ctx.strokeStyle = player.color;
            ctx.lineWidth = Math.max(2, r * 0.22);
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

    fitText(ctx, text, r * 1.6, Math.floor(r * 1.05));
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.x, shape === "triangle" ? c.y + r * 0.15 : c.y);
}

export function drawEquipmentGlyph(
    ctx: CanvasRenderingContext2D,
    item: Pick<EquipmentItem, "kind" | "rotation">,
    c: Position,
    r: number,
    isSelected: boolean
): void {
    if (isSelected) selectionRing(ctx, c, r);
    ctx.lineWidth = Math.max(1.5, r * 0.15);
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
            ctx.fillStyle = "#F57C00";
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
            ctx.lineWidth = Math.max(2.5, r * 0.35);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case "net":
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate((item.rotation * Math.PI) / 180);
            ctx.strokeStyle = BOARD_COLORS.penaltyRed;
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
