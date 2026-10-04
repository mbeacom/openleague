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
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { useMounted } from "@/lib/hooks/useClockText";
import { plannedLabel } from "@/components/features/practice-planner/SessionTimeline";
import { planToEditorSession, type PlanDocument } from "@/lib/plan-document";
import { blockTitle, drillRows, isBlockRow } from "@/lib/utils/session-rows";
import { BLOCK_ICONS } from "@/components/features/practice-planner/BlockRowCard";

const THUMB = { width: 120, height: 51 } as const;

export function PlanPreview({ plan }: { plan: PlanDocument }) {
    const session = useMemo(() => planToEditorSession(plan), [plan]);
    const groups = useMemo(() => groupStations(session.plays, session.transitionMinutes), [session]);
    const mounted = useMounted();

    // Canvas needs the DOM: thumbnails are drawn in the first render after mount.
    const thumbnails = useMemo(() => {
        const map = new Map<string, string>();
        if (!mounted) return map;
        for (const play of drillRows(session.plays)) {
            try {
                map.set(play.key, generateThumbnail(play.playData));
            } catch (error) {
                console.warn("Plan preview: couldn't draw a diagram", error);
            }
        }
        return map;
    }, [mounted, session]);

    return (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h5" component="h2" fontWeight={800}>
                {session.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {[
                    `${session.duration} min`,
                    ...(session.transitionMinutes > 0 ? [betweenBlocksLabel(session.transitionMinutes)] : []),
                    plannedLabel(sessionWallMinutes(session.plays, session.transitionMinutes), session.duration),
                ].join(" · ")}
            </Typography>
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
                                            {head.instructions ? `${head.duration} min · ${head.instructions}` : `${head.duration} min`}
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
                                        const src = thumbnails.get(play.key);
                                        const timing = stationTimingLabel(play, rotation);
                                        return (
                                            <Stack key={play.key} direction="row" spacing={1.5} alignItems="center">
                                                {src ? (
                                                    <Box
                                                        component="img"
                                                        src={src}
                                                        alt={`${play.name} diagram`}
                                                        sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, border: 1, borderColor: "divider" }}
                                                    />
                                                ) : (
                                                    <Box aria-hidden sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, bgcolor: "action.hover" }} />
                                                )}
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Typography fontWeight={600}>{play.name}</Typography>
                                                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                                                        {play.instructions ? `${timing} · ${play.instructions}` : timing}
                                                    </Typography>
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
