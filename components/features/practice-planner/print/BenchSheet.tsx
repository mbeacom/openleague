"use client";

/**
 * Bench sheet (practice planner 3b). Page 1: the header, the timeline and one
 * combined legend. Then the drills, two per page. app/(print)/print.css does
 * the paging. Nothing auto-prints: the toolbar's Print button calls
 * window.print(), and the toolbar itself is hidden in print.
 */
import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowBack as ArrowBackIcon, PrintOutlined as PrintIcon } from "@mui/icons-material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import type { PracticeSessionDetail } from "@/lib/actions/practice-session-queries";
import { buildSchedule } from "@/lib/utils/session-timeline";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";
import { sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { useClockText } from "@/lib/hooks/useClockText";
import { SessionTimeline } from "../SessionTimeline";
import { BenchSheetDrill, drillText } from "./BenchSheetDrill";
import { LegendList } from "./LegendList";

export type BenchSheetSession = PracticeSessionDetail["session"];

export const NO_DRILLS_MESSAGE = "No drills planned";

const MS_PER_MINUTE = 60_000;

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

    return (
        <Box className="bench-sheet" sx={{ maxWidth: 820, mx: "auto", p: { xs: 2, sm: 4 }, bgcolor: "#fff", color: "#000" }}>
            <Stack direction="row" spacing={1} className="no-print" sx={{ mb: 3 }}>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                    Print
                </Button>
                <LinkButton href={`/practice-planner/${session.id}`} variant="outlined" startIcon={<ArrowBackIcon />}>
                    Back to session
                </LinkButton>
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
                        {drills.map(({ sp, startsAt, station }, i) => (
                            <BenchSheetDrill
                                key={sp.id}
                                number={i + 1}
                                name={sp.play.name}
                                startLabel={clock.time(startsAt)}
                                minutes={sp.duration}
                                station={station}
                                playData={sp.play.playData}
                                text={drillText(sp.instructions, sp.play.description)}
                                breakAfter={i % 2 === 1 && i < drills.length - 1}
                            />
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
}
