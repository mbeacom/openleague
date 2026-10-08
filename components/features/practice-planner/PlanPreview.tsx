"use client";

/** Read-only preview of a plan being imported: header, station-grouped drills with diagram thumbnails, and blocks. */

import { useMemo } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import {
    betweenBlocksLabel,
    groupStations,
    rotationBlockLabel,
    sessionWallMinutes,
    stationBlockLabel,
    stationTimingLabel,
} from "@/lib/utils/session-timeline";
import { PlayDiagram } from "./PlayDiagram";
import { plannedLabel } from "@/components/features/practice-planner/SessionTimeline";
import { planToEditorSession, type PlanDocument } from "@/lib/plan-document";
import { blockTitle, drillRows, isBlockRow } from "@/lib/utils/session-rows";
import { BLOCK_ICONS } from "@/components/features/practice-planner/BlockRowCard";
import { runBySuffix, staffHeaderLabel, staffNameKey } from "@/lib/utils/session-staff";
import { Crest } from "@/components/ui/Crest";
import type { PlayData, TeamMark } from "@/types/practice-planner";

const THUMB = { width: 120, height: 51 } as const;

/** True when a diagram has nothing on it. */
function isBlankDiagram(playData: PlayData): boolean {
    return playData.players.length === 0 && playData.drawings.length === 0 && playData.equipment.length === 0 && playData.annotations.length === 0;
}

export function PlanPreview({
    plan,
    teamMark = null,
    emptyDiagramCaption,
}: {
    plan: PlanDocument;
    teamMark?: TeamMark | null;
    /** Shown under a drill whose diagram is empty, such as an AI draft's "No diagram yet". */
    emptyDiagramCaption?: string;
}) {
    const session = useMemo(() => planToEditorSession(plan), [plan]);
    const groups = useMemo(() => groupStations(session.plays, session.transitionMinutes), [session]);
    const staffLine = staffHeaderLabel(session.staff.map((name) => ({ name })));
    // A row's names in the list's spelling (a file may spell them differently; they match ignoring case).
    const listed = useMemo(() => new Map(session.staff.map((name) => [staffNameKey(name), name])), [session]);
    const runBy = (names: readonly string[] | undefined) => runBySuffix((names ?? []).map((name) => listed.get(staffNameKey(name)) ?? name));


    return (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
                {teamMark && <Crest name={teamMark.name} id={teamMark.id} logoUrl={teamMark.logoUrl} brandColor={teamMark.color} size="md" />}
                <Typography variant="h5" component="h2" fontWeight={800} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {session.title}
                </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: staffLine ? 0.5 : 2 }}>
                {[
                    `${session.duration} min`,
                    ...(session.transitionMinutes > 0 ? [betweenBlocksLabel(session.transitionMinutes)] : []),
                    plannedLabel(sessionWallMinutes(session.plays, session.transitionMinutes), session.duration),
                ].join(" · ")}
            </Typography>
            {staffLine && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {staffLine}
                </Typography>
            )}
            {session.plays.length === 0 ? (
                <Typography color="text.secondary">No drills in this plan</Typography>
            ) : (
                <Stack component="ol" aria-label="Practice timeline" spacing={2} sx={{ listStyle: "none", p: 0, m: 0 }}>
                    {groups.map((group) => {
                        const head = group.stations[0];
                        if (isBlockRow(head)) {
                            const Icon = BLOCK_ICONS[head.kind];
                            return (
                                <Stack component="li" key={head.key} direction="row" spacing={1.5} alignItems="center">
                                    <Box aria-hidden sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, bgcolor: "action.hover", display: "grid", placeItems: "center", color: "secondary.main" }}>
                                        <Icon />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography fontWeight={600}>{blockTitle(head.kind, head.label)}</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                                            {`${head.instructions ? `${head.duration} min · ${head.instructions}` : `${head.duration} min`}${runBy(head.staff)}`}
                                        </Typography>
                                    </Box>
                                </Stack>
                            );
                        }
                        const stations = drillRows(group.stations);
                        const rotation = group.rotation;
                        return (
                            <Box component="li" key={group.index}>
                                {stations.length > 1 && (
                                    <Typography variant="overline" color="secondary.main">
                                        {rotation
                                            ? rotationBlockLabel(rotation.minutes, group.wallMinutes)
                                            : stationBlockLabel(stations.length, group.wallMinutes)}
                                    </Typography>
                                )}
                                <Stack spacing={1}>
                                    {stations.map((play) => {
                                        const timing = stationTimingLabel(play, rotation);
                                        return (
                                            <Stack key={play.key} direction="row" spacing={1.5} alignItems="center">
                                                <PlayDiagram
                                                    playData={play.playData}
                                                    label={play.name}
                                                    sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, border: 1, borderColor: "divider", overflow: "hidden" }}
                                                />
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Typography fontWeight={600}>{play.name}</Typography>
                                                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                                                        {`${play.instructions ? `${timing} · ${play.instructions}` : timing}${runBy(play.staff)}`}
                                                    </Typography>
                                                    {emptyDiagramCaption && isBlankDiagram(play.playData) && (
                                                        <Typography variant="caption" fontWeight={600} sx={(theme) => ({ color: theme.palette.warning.dark, ...theme.applyStyles("dark", { color: theme.palette.warning.light }) })}>
                                                            {emptyDiagramCaption}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                            </Box>
                        );
                    })}
                </Stack>
            )}
        </Paper>
    );
}
