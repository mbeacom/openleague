"use client";

/**
 * Bench sheet (practice planner 3b). Page 1: the header, the timeline and one
 * combined legend. Then the drills, paired into .bench-page containers that
 * app/(print)/print.css starts on fresh pages. Nothing auto-prints: the
 * toolbar's Print button calls window.print(), and stays disabled until every
 * drill's diagram is ready. The toolbar itself is hidden in print.
 */
import { useCallback, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowBack as ArrowBackIcon, PrintOutlined as PrintIcon } from "@mui/icons-material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import type { PracticeSessionView } from "@/types/practice-planner";
import { buildSchedule } from "@/lib/utils/session-timeline";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";
import { sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { useClockText } from "@/lib/hooks/useClockText";
import { SessionTimeline } from "../SessionTimeline";
import { BenchSheetDrill, drillText } from "./BenchSheetDrill";
import { printPixelRatio } from "./PrintDiagram";
import { LegendList } from "./LegendList";

export type BenchSheetSession = PracticeSessionView;

export const NO_DRILLS_MESSAGE = "No drills planned";
export const PREPARING_DIAGRAMS = "Preparing diagrams…";

const MS_PER_MINUTE = 60_000;
const DRILLS_PER_PAGE = 2;

function chunk<T>(items: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

export function BenchSheet({ session }: { session: BenchSheetSession }) {
    const start = sessionStart(session);
    const end = new Date(start.getTime() + session.duration * MS_PER_MINUTE);
    const { timeZone, showZone } = sessionTimeZone(session);
    const clock = useClockText(timeZone, showZone);
    const place = [session.venueName, session.surfaceName, session.segmentName].filter(Boolean).join(" · ");
    const legend = combinedLegendData(session.plays.map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    const drills = buildSchedule(session.plays, start).flatMap((row) =>
        row.group.stations.map((sp, k) => ({
            sp,
            startsAt: row.startsAt,
            station: row.group.stations.length > 1 ? { position: k + 1, count: row.group.stations.length } : null,
        }))
    );
    const pixelRatio = printPixelRatio(drills.filter(({ sp }) => sp.play.playData !== null).length);

    // Keyed by session-play row id: a session may schedule the same play twice.
    const [readyIds, setReadyIds] = useState<ReadonlySet<string>>(() => new Set());
    const markReady = useCallback(
        (id: string) => setReadyIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id))),
        []
    );
    const allReady = drills.every(({ sp }) => readyIds.has(sp.id));

    return (
        <Box className="bench-sheet" sx={{ maxWidth: 820, mx: "auto", p: { xs: 2, sm: 4 }, bgcolor: "#fff", color: "#000" }}>
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
                <LinkButton href={`/practice-planner/${session.id}`} variant="outlined" startIcon={<ArrowBackIcon />}>
                    Back to session
                </LinkButton>
                {!allReady && (
                    <Typography variant="body2" role="status" sx={{ color: "text.secondary" }}>
                        {PREPARING_DIAGRAMS}
                    </Typography>
                )}
            </Stack>

            <Box component="header" sx={{ mb: 3 }}>
                <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
                    {session.title}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {session.teamName}
                </Typography>
                <Typography variant="body1">
                    {`${clock.longDate(start)} · ${clock.time(start, false)} – ${clock.time(end)}`}
                </Typography>
                {place && <Typography variant="body1">{place}</Typography>}
            </Box>

            {drills.length === 0 ? (
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    {NO_DRILLS_MESSAGE}
                </Typography>
            ) : (
                <>
                    <SessionTimeline
                        variant="print"
                        plays={session.plays}
                        sessionStart={start}
                        timeZone={timeZone}
                        showZone={showZone}
                        durationMinutes={session.duration}
                    />
                    <LegendList playData={legend} />
                    <Box component="section" aria-label="Drills" className="bench-page-break" sx={{ mt: 4 }}>
                        {chunk(drills, DRILLS_PER_PAGE).map((page, p) => (
                            <div className="bench-page" key={page[0].sp.id}>
                                {page.map(({ sp, startsAt, station }, k) => (
                                    <BenchSheetDrill
                                        key={sp.id}
                                        number={p * DRILLS_PER_PAGE + k + 1}
                                        name={sp.play.name}
                                        startLabel={clock.time(startsAt)}
                                        minutes={sp.duration}
                                        station={station}
                                        playData={sp.play.playData}
                                        text={drillText(sp.instructions, sp.play.description)}
                                        pixelRatio={pixelRatio}
                                        onReady={() => markReady(sp.id)}
                                    />
                                ))}
                            </div>
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
}
