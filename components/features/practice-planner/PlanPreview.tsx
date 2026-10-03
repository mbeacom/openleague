"use client";

/** Read-only preview of a plan being imported: header, station-grouped drills, diagram thumbnails. */

import { useMemo } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { groupStations, sessionWallMinutes, stationBlockLabel } from "@/lib/utils/session-timeline";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { useMounted } from "@/lib/hooks/useClockText";
import { plannedLabel } from "@/components/features/practice-planner/SessionTimeline";
import { planToEditorSession, type PlanDocument } from "@/lib/plan-document";

const THUMB = { width: 120, height: 51 } as const;

export function PlanPreview({ plan }: { plan: PlanDocument }) {
    const session = useMemo(() => planToEditorSession(plan), [plan]);
    const groups = useMemo(() => groupStations(session.plays), [session]);
    const mounted = useMounted();

    // Canvas needs the DOM: thumbnails are drawn in the first render after mount.
    const thumbnails = useMemo(() => {
        const map = new Map<string, string>();
        if (!mounted) return map;
        for (const play of session.plays) {
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
                {`${session.duration} min · ${plannedLabel(sessionWallMinutes(session.plays), session.duration)}`}
            </Typography>
            {session.plays.length === 0 ? (
                <Typography color="text.secondary">No drills in this plan</Typography>
            ) : (
                <Stack component="ol" aria-label="Drills in this plan" spacing={2} sx={{ listStyle: "none", p: 0, m: 0 }}>
                    {groups.map((group) => (
                        <Box component="li" key={group.index}>
                            {group.stations.length > 1 && (
                                <Typography variant="overline" color="secondary.main">
                                    {stationBlockLabel(group.stations.length, group.wallMinutes)}
                                </Typography>
                            )}
                            <Stack spacing={1}>
                                {group.stations.map((play) => {
                                    const src = thumbnails.get(play.key);
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
                                                    {play.instructions ? `${play.duration} min · ${play.instructions}` : `${play.duration} min`}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    );
                                })}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}
