"use client";

/**
 * Bench sheet (practice planner 3b). Page 1: the header, the timeline and one
 * combined legend, then as many of the first drills as fit there (the model's
 * firstPageDrills, which the HTML and Word files share). The rest go two to a
 * .bench-page container that app/(print)/print.css starts on a fresh page.
 * Headings and table headers wear the team's colors (teamPalette); the
 * toolbar's "Team colors" option redraws the diagrams' team markers in them,
 * for this sheet only. Nothing auto-prints: the
 * toolbar's Print button calls window.print(), and stays disabled until every
 * drill's diagram and the team mark are ready. The toolbar itself is hidden in print.
 */
import { useCallback, useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowBack as ArrowBackIcon, PrintOutlined as PrintIcon } from "@mui/icons-material";
import { usePlannerPlatform } from "@/lib/planner-store";
import type { PracticeSessionView } from "@/types/practice-planner";
import { betweenBlocksLabel, buildSchedule } from "@/lib/utils/session-timeline";
import { sessionForDisplay } from "@/lib/utils/drill-tags";
import { drillRows } from "@/lib/utils/session-rows";
import { staffHeaderLabel } from "@/lib/utils/session-staff";
import { rosterSheetLines } from "@/lib/utils/practice-roster";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";
import { sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { useClockText } from "@/lib/hooks/useClockText";
import { SessionTimeline } from "../SessionTimeline";
import { BenchSheetDrill, drillText } from "./BenchSheetDrill";
import { drillEquipment, drillEquipmentText } from "@/lib/utils/equipment-needs";
import { benchSheetEquipment, benchSheetPages, buildBenchSheetModel, type BenchSheetRenderers } from "../export/bench-sheet-model";
import { EQUIPMENT_HEADING } from "../export/labels";
import { printPixelRatio } from "./PrintDiagram";
import { LegendList } from "./LegendList";
import { TeamMarkImage } from "./TeamMarkImage";
import { TeamColorsToggle } from "../TeamColorsToggle";
import { useTeamRoleColors } from "../useTeamColors";
import { sessionWithTeamColors, teamPalette } from "@/lib/utils/team-palette";

export type BenchSheetSession = PracticeSessionView;

export const NO_DRILLS_MESSAGE = "No drills planned";
export const PREPARING_PRINT = "Preparing print…";

const MS_PER_MINUTE = 60_000;

/** The layout call needs only text: no images are drawn for it. */
const NO_IMAGES: BenchSheetRenderers = { diagram: () => null, swatch: () => null, crest: () => null };

export function BenchSheet({ session: stored }: { session: BenchSheetSession }) {
    const { Link, routes } = usePlannerPlatform();
    // A static device without "Your team" has no name: nothing prints (practice logo spec R4).
    const teamName = stored.teamName?.trim() || null;
    const mark = teamName ? stored.teamMark ?? null : null;
    const palette = useMemo(() => teamPalette(mark), [mark]);
    const teamColors = useTeamRoleColors(mark);
    // Goalie markers hidden and team colors applied at render time only (spec R7); the stored session is untouched.
    const session = useMemo(() => sessionWithTeamColors(sessionForDisplay(stored), teamColors.roleColors), [stored, teamColors.roleColors]);
    // How many drills follow the legend on page 1: the model's call, so the downloads paginate alike.
    const firstPageDrills = useMemo(() => buildBenchSheetModel(stored, NO_IMAGES, { includeRosterNames: true }).firstPageDrills, [stored]);
    const start = sessionStart(session);
    const end = new Date(start.getTime() + session.duration * MS_PER_MINUTE);
    const { timeZone, showZone } = sessionTimeZone(session);
    const clock = useClockText(timeZone, showZone);
    const place = [session.venueName, session.surfaceName, session.segmentName].filter(Boolean).join(" · ");
    const gap = session.transitionMinutes ?? 0;
    const staffLine = staffHeaderLabel(session.staff);
    // The coach's own sheet on screen and on paper: names shown (roster spec R10).
    const rosterLines = rosterSheetLines(session.roster, true);
    const legend = combinedLegendData(drillRows(session.plays).map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    // The practice's equipment (practice equipment spec R5): after the timeline, before the legend.
    const equipment = benchSheetEquipment(session);
    // One page per drill; a block (warm-up, break…) is a timeline row only. Start times come
    // from the stored rows, as the timeline's do; each page draws the display copy of its drill.
    const shown = new Map(drillRows(session.plays).map((sp) => [sp.id, sp]));
    const drills = buildSchedule(stored.plays, start, gap).flatMap((row) => {
        const stations = drillRows(row.group.stations);
        return stations.map((sp, k) => ({
            sp: shown.get(sp.id) ?? sp,
            startsAt: row.startsAt,
            station: stations.length > 1 ? { position: k + 1, count: stations.length } : null,
        }));
    });
    const pixelRatio = printPixelRatio(drills.filter(({ sp }) => sp.play.playData !== null).length);

    // Keyed by session-play row id: a session may schedule the same play twice.
    const [readyIds, setReadyIds] = useState<ReadonlySet<string>>(() => new Set());
    const markReady = useCallback(
        (id: string) => setReadyIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id))),
        []
    );
    // The team mark counts too: a hosted logo is a network image (practice logo spec R5).
    const [markShown, setMarkShown] = useState(false);
    const onMarkReady = useCallback(() => setMarkShown(true), []);
    const allReady = drills.every(({ sp }) => readyIds.has(sp.id)) && (!mark || markShown);

    const equipmentSection =
        equipment.length > 0 ? (
                <Box component="section" aria-labelledby="bench-equipment-heading" className="bench-equipment" sx={{ mt: 2 }}>
                    <Typography id="bench-equipment-heading" variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                        {EQUIPMENT_HEADING}
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2.5, columns: { xs: 2, sm: 3 }, columnGap: 3 }}>
                        {equipment.map((item) => (
                            <Typography key={item} component="li" variant="body2" sx={{ breakInside: "avoid" }}>
                                {item}
                            </Typography>
                        ))}
                    </Box>
                </Box>
        ) : null;

    return (
        <Box
            className="bench-sheet"
            sx={{
                maxWidth: 820,
                mx: "auto",
                p: { xs: 2, sm: 4 },
                bgcolor: "#fff",
                color: "#000",
                // Read by print.css for the timeline's header cells.
                "--bench-ink": palette.ink,
                "--bench-tint": palette.tint,
            }}
        >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap className="no-print" sx={{ mb: 3 }}>
                <Button
                    variant="contained"
                    startIcon={<PrintIcon />}
                    onClick={() => window.print()}
                    disabled={!allReady}
                    aria-busy={!allReady || undefined}
                >
                    Print
                </Button>
                <Button component={Link} href={routes.session(session.id)} variant="outlined" startIcon={<ArrowBackIcon />}>
                    Back to session
                </Button>
                {teamColors.available && <TeamColorsToggle checked={teamColors.enabled} onChange={teamColors.setEnabled} />}
                {!allReady && (
                    <Typography variant="body2" role="status" sx={{ color: "text.secondary" }}>
                        {PREPARING_PRINT}
                    </Typography>
                )}
            </Stack>

            <Box component="header" sx={{ mb: 3, pb: 1, borderBottom: `3px solid ${palette.accent}` }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    {mark && <TeamMarkImage mark={mark} onReady={onMarkReady} />}
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 800, minWidth: 0, color: palette.ink }}>
                        {session.title}
                    </Typography>
                </Stack>
                {teamName && (
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {teamName}
                    </Typography>
                )}
                <Typography variant="body1">
                    {`${clock.longDate(start)} · ${clock.time(start, false)} – ${clock.time(end)}`}
                </Typography>
                {place && <Typography variant="body1">{place}</Typography>}
                {staffLine && <Typography variant="body1">{staffLine}</Typography>}
                {rosterLines && <Typography variant="body1">{rosterLines.counts}</Typography>}
                {rosterLines?.players.map((line) => (
                    <Typography key={line} variant="body2">
                        {line}
                    </Typography>
                ))}
                {gap > 0 && <Typography variant="body1">{betweenBlocksLabel(gap)}</Typography>}
            </Box>

            {session.plays.length === 0 ? (
                <>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {NO_DRILLS_MESSAGE}
                    </Typography>
                    {equipmentSection}
                </>
            ) : (
                <>
                    {/* Timing reads the stored rows; the display copy only redraws diagrams. */}
                    <SessionTimeline
                        variant="print"
                        plays={stored.plays}
                        sessionStart={start}
                        timeZone={timeZone}
                        showZone={showZone}
                        durationMinutes={session.duration}
                        transitionMinutes={gap}
                        staff={session.staff}
                    />
                    {equipmentSection}
                    <LegendList playData={legend} roleColors={teamColors.roleColors} />
                    {drills.length > 0 && (
                    // Drills start on page 2 unless the first ones fit under a short page 1.
                    <Box component="section" aria-label="Drills" className={firstPageDrills > 0 ? undefined : "bench-page-break"} sx={{ mt: 4 }}>
                        {benchSheetPages(drills, firstPageDrills).map((page) => (
                            <div className="bench-page" key={page.items[0].sp.id}>
                                {page.items.map(({ sp, startsAt, station }, k) => (
                                    <BenchSheetDrill
                                        key={sp.id}
                                        number={page.first + k + 1}
                                        name={sp.play.name}
                                        startLabel={clock.time(startsAt)}
                                        minutes={sp.duration}
                                        station={station}
                                        playData={sp.play.playData}
                                        text={drillText(sp.instructions, sp.play.description)}
                                        equipment={drillEquipmentText(drillEquipment(sp.play.playData))}
                                        pixelRatio={pixelRatio}
                                        onReady={() => markReady(sp.id)}
                                    />
                                ))}
                            </div>
                        ))}
                    </Box>
                    )}
                </>
            )}
        </Box>
    );
}
