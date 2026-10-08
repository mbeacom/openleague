/**
 * "Where does every team land?": a tier strip chart for Rankings. One lane per
 * level, each team a dot on the shared 0–20 RPI axis, dodged so dots never
 * overlap, with a labelled cut line between neighbouring levels. Your team is
 * the single Action Blue mark, larger, ringed and labelled (never colour
 * alone). Hand-rolled SVG plus MUI: no chart library in the static bundle.
 *
 * Keyboard: the chart is one tab stop; arrow keys move between teams in rank
 * order, Home/End jump to the ends, Enter opens the team, Escape hides the
 * tooltip. Every value in a tooltip is also in the table view.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Box, Button, Typography } from "@mui/material";
import { alpha, keyframes, type Theme } from "@mui/material/styles";
import type { TeamRating } from "@/lib/ratings";
import { staticRoutes } from "../../routes";
import { BELOW_LAST_LEVEL, levelBandAlpha, formatRating } from "./display";
import {
    DOT_COLORS,
    RPI_MAX,
    describeTierChart,
    dodgeRows,
    labelledTeams,
    rowOffset,
    tierChartData,
    tierColor,
    type TierChartTeam,
    type TierLane,
} from "./tierChart";

export const TIER_CHART_TITLE = "Where every team lands";
export const VIEW_AS_TABLE_LABEL = "View as table";

const DEFAULT_WIDTH = 640;
const DOT_R = 5;
const MINE_R = 7;
const HIT_R = 12;
const ROW_STEP = 12;
const LABEL_ROOM = 16;
const AXIS_H = 40;
const PLOT_PAD_LEFT = 12;
const PLOT_PAD_RIGHT = 16;
const TICKS = [0, 5, 10, 15, 20];
const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;

const MOVEMENT_WORDS = { up: "Up", same: "Same", down: "Down" } as const;
const MOVEMENT_ICONS = { up: "▲", same: "▬", down: "▼" } as const;

function movementText(team: TierChartTeam): string | null {
    if (!team.movement) return null;
    const word = MOVEMENT_WORDS[team.movement];
    if (!team.startingBracket) return word;
    return `${word} ${team.movement === "same" ? "as" : "from"} ${team.startingBracket}`;
}

/** The accessible name of one dot: everything the tooltip shows, in words. */
export function dotLabel(team: TierChartTeam, total: number, mine: boolean): string {
    return [
        `${team.name}${mine ? " (your team)" : ""}`,
        `rank ${team.rank} of ${total}`,
        `RPI ${formatRating(team.rpi)}`,
        team.level ?? BELOW_LAST_LEVEL,
        `record ${team.wins}-${team.losses}-${team.ties}`,
        movementText(team),
        team.lowConfidence ? "few games" : null,
    ]
        .filter(Boolean)
        .join(", ");
}

function useWidth(): [(node: HTMLDivElement | null) => void, number] {
    const [node, setNode] = useState<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    useLayoutEffect(() => {
        if (!node) return;
        const measure = () => {
            const next = node.getBoundingClientRect().width;
            if (next > 0) setWidth(Math.round(next));
        };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);
    return [setNode, width];
}

interface PlacedDot {
    team: TierChartTeam;
    x: number;
    y: number;
    mine: boolean;
    laneIndex: number;
}

interface PlacedLane {
    lane: TierLane;
    top: number;
    height: number;
    /** Baseline for direct labels in this lane, or null when it has none. */
    labelY: number | null;
}

function laneFillSx(theme: Theme, index: number, count: number) {
    const light = theme.colorSchemes?.light?.palette.primary.main ?? theme.palette.primary.main;
    const dark = theme.colorSchemes?.dark?.palette.primary.main ?? light;
    return {
        fill: alpha(light, levelBandAlpha("light", index, count)),
        ...theme.applyStyles("dark", {
            fill: alpha(dark, levelBandAlpha("dark", index, count)),
        }),
    };
}

/** The tier key and dot colours as custom properties, light and dark, so SVG fills follow the scheme. */
function chartVarsSx(theme: Theme, count: number) {
    const light: Record<string, string> = { "--tier-dot": DOT_COLORS.light.team };
    const dark: Record<string, string> = { "--tier-dot": DOT_COLORS.dark.team };
    for (let i = 0; i < count; i++) {
        light[`--tier-${i}`] = tierColor("light", i, count);
        dark[`--tier-${i}`] = tierColor("dark", i, count);
    }
    return { ...light, ...theme.applyStyles("dark", dark) };
}

export interface RankingsTierChartProps {
    /** Every team from the ratings, ranked or not; the chart is never filtered, so cuts stay true. */
    teams: readonly TeamRating[];
    levels: ReadonlyArray<{ name: string }>;
    myTeam: string | null;
    /** Optional logo per team number; accepted for a later pass, not drawn yet. */
    logos?: ReadonlyMap<string, string>;
    onShowTable?: () => void;
}

export function RankingsTierChart({ teams, levels, myTeam, logos, onShowTable }: RankingsTierChartProps) {
    const data = useMemo(() => tierChartData(teams, levels, logos), [teams, levels, logos]);
    const [measureRef, width] = useWidth();
    const ids = useId();
    const titleId = `${ids}-title`;
    const descId = `${ids}-desc`;
    const tipId = `${ids}-tip`;

    const narrow = width < 480;
    const labelWidth = narrow ? 76 : 148;
    const plotWidth = Math.max(160, width - labelWidth);
    const x = useCallback(
        (rpi: number) => PLOT_PAD_LEFT + (Math.min(Math.max(rpi, 0), RPI_MAX) / RPI_MAX) * (plotWidth - PLOT_PAD_LEFT - PLOT_PAD_RIGHT),
        [plotWidth],
    );

    const labelled = useMemo(() => labelledTeams(data, myTeam), [data, myTeam]);

    const { placedLanes, dots, plotHeight } = useMemo(() => {
        const placedLanes: PlacedLane[] = [];
        const dots: PlacedDot[] = [];
        let top = 0;
        data.lanes.forEach((lane, laneIndex) => {
            const xs = lane.teams.map((t) => x(t.rpi));
            const rows = dodgeRows(xs, 2 * DOT_R + 3);
            const spread = rows.reduce((most, row) => Math.max(most, Math.abs(rowOffset(row))), 0);
            // A lane with a direct label keeps a strip along its top for the text, clear of the dots.
            const labelRoom = lane.teams.some((t) => labelled.has(t.number)) ? LABEL_ROOM : 0;
            const height = Math.max(narrow ? 48 : 52, (2 * spread + 1) * ROW_STEP + 28) + labelRoom;
            const centre = top + labelRoom + (height - labelRoom) / 2;
            lane.teams.forEach((team, i) => {
                dots.push({
                    team,
                    x: xs[i],
                    y: centre + rowOffset(rows[i]) * ROW_STEP,
                    mine: team.number === myTeam,
                    laneIndex,
                });
            });
            placedLanes.push({
                lane,
                top,
                height,
                labelY: labelRoom ? top + LABEL_ROOM - 2 : null,
            });
            top += height;
        });
        return { placedLanes, dots, plotHeight: top };
    }, [data, x, myTeam, narrow, labelled]);

    const order = useMemo(() => [...dots].sort((a, b) => a.team.rank - b.team.rank), [dots]);
    const levelCount = levels.length;

    const [active, setActive] = useState<string | null>(null);
    const [focusable, setFocusable] = useState<string | null>(null);
    const refs = useRef(new Map<string, SVGGElement>());
    const rovingStop = focusable && order.some((d) => d.team.number === focusable) ? focusable : ((order.find((d) => d.mine) ?? order[0])?.team.number ?? null);

    useEffect(() => {
        if (!active) return;
        // A tap anywhere but a dot dismisses the tooltip (touch has no hover-out).
        const dismiss = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest(".tier-hit")) setActive(null);
        };
        document.addEventListener("pointerdown", dismiss);
        return () => document.removeEventListener("pointerdown", dismiss);
    }, [active]);

    const move = (from: string, key: string) => {
        const index = order.findIndex((d) => d.team.number === from);
        let next = index;
        if (key === "ArrowRight" || key === "ArrowDown") next = Math.min(order.length - 1, index + 1);
        else if (key === "ArrowLeft" || key === "ArrowUp") next = Math.max(0, index - 1);
        else if (key === "Home") next = 0;
        else if (key === "End") next = order.length - 1;
        const number = order[next]?.team.number;
        if (!number) return;
        setFocusable(number);
        setActive(number);
        refs.current.get(number)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<SVGGElement>, number: string) => {
        if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            move(number, event.key);
        } else if (event.key === "Escape") {
            setActive(null);
        } else if (event.key === "Enter") {
            event.preventDefault();
            window.location.assign(staticRoutes.rankingsTeam(number));
        }
    };

    const activeDot = active ? dots.find((d) => d.team.number === active) : undefined;
    const totalHeight = plotHeight + AXIS_H;

    if (data.rankedCount === 0) return null;

    return (
        <Box
            component="figure"
            aria-labelledby={titleId}
            sx={(theme) => ({
                m: 0,
                breakInside: "avoid",
                printColorAdjust: "exact",
                WebkitPrintColorAdjust: "exact",
                ...chartVarsSx(theme, levelCount),
            })}
        >
            <Typography id={titleId} component="h2" variant="h6" sx={{ fontWeight: 800 }}>
                {TIER_CHART_TITLE}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Every ranked team on the 0–20 RPI scale, one lane per level. Lines mark the cut between levels.
            </Typography>
            <Legend />
            <Box ref={measureRef} sx={{ position: "relative", width: "100%", maxWidth: "100%" }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`,
                    }}
                >
                    <Box aria-hidden="true">
                        {placedLanes.map(({ lane, height }) => (
                            <LaneLabel key={lane.key} lane={lane} height={height} narrow={narrow} levelCount={levelCount} />
                        ))}
                    </Box>
                    <Box
                        component="svg"
                        role="group"
                        aria-labelledby={titleId}
                        aria-describedby={descId}
                        width={plotWidth}
                        height={totalHeight}
                        viewBox={`0 0 ${plotWidth} ${totalHeight}`}
                        sx={(theme) => ({
                            display: "block",
                            fontFamily: "inherit",
                            overflow: "visible",
                            "& .tier-hit": { cursor: "pointer", outline: "none" },
                            "& .tier-hit .focus-ring": { opacity: 0 },
                            "& .tier-hit:focus-visible .focus-ring": { opacity: 1 },
                            "& .tier-hit:hover .tier-dot, & .tier-hit:focus-visible .tier-dot": { strokeWidth: 3 },
                            // One staggered reveal, lane by lane; nothing moves for reduced-motion users.
                            "@media (prefers-reduced-motion: no-preference)": {
                                "& .tier-dots": { animation: `${fadeIn} 360ms ease-out both` },
                            },
                            "@media print": { "& .tier-hit .focus-ring": { opacity: 0 } },
                            "& text": { fontSize: 11 },
                            "& .tier-axis text, & .tier-cut text": {
                                fill: (theme.vars || theme).palette.text.secondary,
                            },
                        })}
                    >
                        <title>{TIER_CHART_TITLE}</title>
                        <desc id={descId}>{describeTierChart(data, myTeam)}</desc>

                        {placedLanes.map(({ lane, top, height }) =>
                            lane.levelIndex === null ? null : (
                                <Box
                                    key={lane.key}
                                    component="rect"
                                    x={0}
                                    y={top}
                                    width={plotWidth}
                                    height={height}
                                    sx={(theme) => laneFillSx(theme, lane.levelIndex!, levelCount)}
                                />
                            ),
                        )}

                        <g aria-hidden="true" className="tier-axis">
                            {TICKS.map((tick) => (
                                <Box
                                    key={tick}
                                    component="line"
                                    x1={x(tick)}
                                    x2={x(tick)}
                                    y1={0}
                                    y2={plotHeight}
                                    sx={{
                                        stroke: (theme) => (theme.vars || theme).palette.divider,
                                        strokeWidth: 1,
                                    }}
                                />
                            ))}
                            <Box
                                component="line"
                                x1={0}
                                x2={plotWidth}
                                y1={plotHeight}
                                y2={plotHeight}
                                sx={{
                                    stroke: (theme) => (theme.vars || theme).palette.divider,
                                    strokeWidth: 1,
                                }}
                            />
                            {TICKS.map((tick) => (
                                <text key={tick} x={x(tick)} y={plotHeight + 16} textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {tick}
                                </text>
                            ))}
                            <text x={x(RPI_MAX / 2)} y={plotHeight + 33} textAnchor="middle">
                                CSHL-compatible RPI, 0–20
                            </text>
                        </g>

                        <g aria-hidden="true" className="tier-cut">
                            {data.cuts.map((cut) => {
                                const upper = placedLanes.find((p) => p.lane.key === cut.above)!;
                                const lower = placedLanes.find((p) => p.lane.key === cut.below)!;
                                const cx = x(cut.rpi);
                                const boundary = lower.top;
                                const right = cx < plotWidth - 44;
                                return (
                                    <g key={`${cut.above}-${cut.below}`}>
                                        <Box
                                            component="line"
                                            x1={cx}
                                            x2={cx}
                                            y1={upper.top + 4}
                                            y2={lower.top + lower.height - 4}
                                            sx={{
                                                stroke: (theme) => (theme.vars || theme).palette.text.secondary,
                                                strokeWidth: 1.5,
                                            }}
                                        />
                                        <Box
                                            component="text"
                                            x={right ? cx + 4 : cx - 4}
                                            y={boundary + 4}
                                            textAnchor={right ? "start" : "end"}
                                            sx={(theme) => ({
                                                fontWeight: 700,
                                                paintOrder: "stroke",
                                                stroke: (theme.vars || theme).palette.background.paper,
                                                strokeWidth: 3,
                                                strokeLinejoin: "round",
                                            })}
                                        >
                                            {formatRating(cut.rpi)}
                                        </Box>
                                    </g>
                                );
                            })}
                        </g>

                        {placedLanes.map(({ lane }, laneIndex) => (
                            <g key={lane.key} className="tier-dots" style={{ animationDelay: `${laneIndex * 60}ms` }}>
                                {dots
                                    .filter((d) => d.laneIndex === laneIndex)
                                    .map((dot) => (
                                        <Dot
                                            key={dot.team.number}
                                            dot={dot}
                                            total={data.rankedCount}
                                            tabbable={dot.team.number === rovingStop}
                                            describedBy={active === dot.team.number ? tipId : undefined}
                                            register={(node) => {
                                                if (node) refs.current.set(dot.team.number, node);
                                                else refs.current.delete(dot.team.number);
                                            }}
                                            onEnter={() => setActive(dot.team.number)}
                                            onLeave={() =>
                                                setActive((current) =>
                                                    current === dot.team.number && document.activeElement !== refs.current.get(dot.team.number)
                                                        ? null
                                                        : current,
                                                )
                                            }
                                            onFocus={() => {
                                                setFocusable(dot.team.number);
                                                setActive(dot.team.number);
                                            }}
                                            onBlur={() => setActive((current) => (current === dot.team.number ? null : current))}
                                            onTap={() => setActive(dot.team.number)}
                                            onKeyDown={(event) => onKeyDown(event, dot.team.number)}
                                        />
                                    ))}
                            </g>
                        ))}

                        <g aria-hidden="true">
                            {dots
                                .filter((d) => labelled.has(d.team.number))
                                .map((dot) => {
                                    const right = dot.x < plotWidth * 0.62;
                                    const labelY = placedLanes[dot.laneIndex].labelY ?? dot.y + 4;
                                    const leaderEnd = dot.y - (dot.mine ? MINE_R + 4 : DOT_R + 2);
                                    return (
                                        <g key={dot.team.number}>
                                            {leaderEnd - (labelY + 3) > 2 && (
                                                <Box
                                                    component="line"
                                                    x1={dot.x}
                                                    x2={dot.x}
                                                    y1={labelY + 3}
                                                    y2={leaderEnd}
                                                    sx={{
                                                        stroke: (theme) => (theme.vars || theme).palette.text.secondary,
                                                        strokeWidth: 1,
                                                    }}
                                                />
                                            )}
                                            <Box
                                                component="text"
                                                x={right ? dot.x - 4 : dot.x + 4}
                                                y={labelY}
                                                textAnchor={right ? "start" : "end"}
                                                sx={(theme) => ({
                                                    fontSize: 12,
                                                    fontWeight: dot.mine ? 800 : 600,
                                                    fill: (theme.vars || theme).palette.text.primary,
                                                    paintOrder: "stroke",
                                                    stroke: (theme.vars || theme).palette.background.paper,
                                                    strokeWidth: 3,
                                                    strokeLinejoin: "round",
                                                    pointerEvents: "none",
                                                })}
                                            >
                                                {dot.mine ? `${dot.team.name} (you)` : dot.team.name}
                                            </Box>
                                        </g>
                                    );
                                })}
                        </g>
                    </Box>
                </Box>
                {activeDot && (
                    <TierTooltip id={tipId} dot={activeDot} total={data.rankedCount} left={labelWidth + activeDot.x} top={activeDot.y} width={width} />
                )}
            </Box>
            <Box
                component="figcaption"
                sx={{
                    mt: 1,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    columnGap: 2,
                    rowGap: 0.5,
                }}
            >
                <Typography variant="caption" color="text.secondary">
                    Arrow keys move between teams; Enter opens a team.
                    {data.unplotted.length > 0 ? ` Not on the scale (no games or excluded): ${data.unplotted.map((t) => t.name).join(", ")}.` : ""}
                </Typography>
                {onShowTable && (
                    <Button size="small" onClick={onShowTable} sx={{ minHeight: 44, displayPrint: "none" }}>
                        {VIEW_AS_TABLE_LABEL}
                    </Button>
                )}
            </Box>
        </Box>
    );
}

function LaneLabel({ lane, height, narrow, levelCount }: { lane: TierLane; height: number; narrow: boolean; levelCount: number }) {
    const name = lane.level ?? (narrow ? "Below last" : BELOW_LAST_LEVEL);
    const count = `${lane.teams.length} ${lane.teams.length === 1 ? "team" : "teams"}`;
    return (
        <Box
            data-lane={lane.key}
            sx={(theme) => {
                const light = theme.colorSchemes?.light?.palette.primary.main ?? theme.palette.primary.main;
                const dark = theme.colorSchemes?.dark?.palette.primary.main ?? light;
                return {
                    height,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    pr: 1,
                    overflow: "hidden",
                    ...(lane.levelIndex === null
                        ? {}
                        : {
                              backgroundColor: alpha(light, levelBandAlpha("light", lane.levelIndex, levelCount)),
                              ...theme.applyStyles("dark", {
                                  backgroundColor: alpha(dark, levelBandAlpha("dark", lane.levelIndex, levelCount)),
                              }),
                          }),
                };
            }}
        >
            <Box
                sx={{
                    alignSelf: "stretch",
                    my: 0.75,
                    width: 6,
                    flexShrink: 0,
                    borderRadius: "0 4px 4px 0",
                    bgcolor: lane.levelIndex === null ? "divider" : `var(--tier-${lane.levelIndex})`,
                }}
            />
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    sx={{
                        fontWeight: 800,
                        fontSize: narrow ? 13 : 15,
                        lineHeight: 1.15,
                        overflowWrap: "anywhere",
                    }}
                >
                    {name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
                    {count}
                    {!narrow && lane.min !== null && lane.max !== null ? ` · ${formatRating(lane.min)}–${formatRating(lane.max)}` : ""}
                </Typography>
            </Box>
        </Box>
    );
}

interface DotProps {
    dot: PlacedDot;
    total: number;
    tabbable: boolean;
    describedBy: string | undefined;
    register: (node: SVGGElement | null) => void;
    onEnter: () => void;
    onLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onTap: () => void;
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
}

function Dot({ dot, total, tabbable, describedBy, register, onEnter, onLeave, onFocus, onBlur, onTap, onKeyDown }: DotProps) {
    const { team, x, y, mine } = dot;
    const hollow = team.lowConfidence && !mine;
    return (
        <g
            ref={register}
            className="tier-hit"
            role="img"
            aria-label={dotLabel(team, total, mine)}
            aria-describedby={describedBy}
            tabIndex={tabbable ? 0 : -1}
            data-team={team.number}
            data-mine={mine ? "true" : undefined}
            onPointerEnter={(event) => event.pointerType === "mouse" && onEnter()}
            onPointerLeave={(event) => event.pointerType === "mouse" && onLeave()}
            onClick={onTap}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
        >
            <circle cx={x} cy={y} r={HIT_R} fill="transparent" />
            <Box
                component="circle"
                className="focus-ring"
                cx={x}
                cy={y}
                r={(mine ? MINE_R : DOT_R) + 5}
                sx={{
                    fill: "none",
                    stroke: (theme) => (theme.vars || theme).palette.text.primary,
                    strokeWidth: 2,
                }}
            />
            {mine && (
                <Box
                    component="circle"
                    cx={x}
                    cy={y}
                    r={MINE_R + 3.5}
                    sx={{
                        fill: "none",
                        stroke: (theme) => (theme.vars || theme).palette.secondary.main,
                        strokeWidth: 1.5,
                    }}
                />
            )}
            <Box
                component="circle"
                className="tier-dot"
                cx={x}
                cy={y}
                r={mine ? MINE_R : hollow ? DOT_R - 1 : DOT_R}
                sx={(theme) => {
                    const vars = (theme.vars || theme).palette;
                    if (mine)
                        return {
                            fill: vars.secondary.main,
                            stroke: vars.background.paper,
                            strokeWidth: 2,
                        };
                    if (hollow)
                        return {
                            fill: vars.background.paper,
                            stroke: "var(--tier-dot)",
                            strokeWidth: 2,
                        };
                    return {
                        fill: "var(--tier-dot)",
                        stroke: vars.background.paper,
                        strokeWidth: 2,
                    };
                }}
            />
        </g>
    );
}

function TierTooltip({ id, dot, total, left, top, width }: { id: string; dot: PlacedDot; total: number; left: number; top: number; width: number }) {
    const { team } = dot;
    const half = 110;
    const clamped = Math.min(Math.max(left, half), Math.max(half, width - half));
    const below = top < 76;
    const movement = movementText(team);
    return (
        <Box
            id={id}
            role="tooltip"
            className="tier-tooltip"
            sx={{
                position: "absolute",
                left: clamped,
                top: below ? top + HIT_R + 4 : top - HIT_R - 4,
                transform: below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
                width: 2 * half,
                p: 1.25,
                borderRadius: 1,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                boxShadow: 3,
                pointerEvents: "none",
                zIndex: 2,
                displayPrint: "none",
            }}
        >
            <Typography sx={{ fontWeight: 800, lineHeight: 1.2 }}>{team.name}</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
                {formatRating(team.rpi)}{" "}
                <Typography component="span" variant="caption" color="text.secondary">
                    RPI · rank {team.rank} of {total}
                </Typography>
            </Typography>
            <Typography variant="body2" color="text.secondary">
                {team.level ?? BELOW_LAST_LEVEL} · {team.wins}-{team.losses}-{team.ties}
                {team.lowConfidence ? " · few games" : ""}
            </Typography>
            {movement && team.movement && (
                <Typography variant="body2" color="text.secondary">
                    <span aria-hidden="true">{MOVEMENT_ICONS[team.movement]}</span> {movement}
                </Typography>
            )}
        </Box>
    );
}

function Legend() {
    const item = {
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
    } as const;
    return (
        <Box
            aria-hidden="true"
            sx={{
                display: "flex",
                flexWrap: "wrap",
                columnGap: 2,
                rowGap: 0.5,
                mb: 1,
                color: "text.secondary",
                fontSize: 13,
            }}
        >
            <Box sx={item}>
                <svg width="14" height="14" viewBox="0 0 14 14">
                    <circle cx="7" cy="7" r="5" style={{ fill: "var(--tier-dot)" }} />
                </svg>
                Team
            </Box>
            <Box sx={item}>
                <svg width="14" height="14" viewBox="0 0 14 14">
                    <circle cx="7" cy="7" r="4" style={{ fill: "none", stroke: "var(--tier-dot)", strokeWidth: 2 }} />
                </svg>
                Few games
            </Box>
            <Box sx={item}>
                <Box
                    component="svg"
                    width={20}
                    height={20}
                    viewBox="0 0 20 20"
                    sx={{
                        "& circle": {
                            stroke: (theme) => (theme.vars || theme).palette.secondary.main,
                        },
                    }}
                >
                    <circle cx="10" cy="10" r="9" style={{ fill: "none", strokeWidth: 1.5 }} />
                    <Box
                        component="circle"
                        cx="10"
                        cy="10"
                        r="6"
                        sx={{
                            fill: (theme) => (theme.vars || theme).palette.secondary.main,
                        }}
                    />
                </Box>
                Your team
            </Box>
            <Box sx={item}>
                <Box
                    component="svg"
                    width={10}
                    height={16}
                    viewBox="0 0 10 16"
                    sx={{
                        "& line": {
                            stroke: (theme) => (theme.vars || theme).palette.text.secondary,
                        },
                    }}
                >
                    <line x1="5" x2="5" y1="1" y2="15" strokeWidth="1.5" />
                </Box>
                Cut between levels
            </Box>
        </Box>
    );
}
