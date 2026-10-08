"use client";

/**
 * The practice roster on the session page (roster and suggestions spec R15):
 * the counts, then each position's players. Renders nothing for a practice
 * without players. Portable.
 */
import { Box, Paper, Stack, Typography } from "@mui/material";
import { rosterByRole, rosterCounts, rosterCountsLabel, rosterRoleLabel, type PracticeRoster } from "@/lib/utils/practice-roster";
import { AGE_GROUP_LABELS } from "@/lib/utils/age-groups";

export function RosterSummary({ roster }: { roster: PracticeRoster | null | undefined }) {
    if (!roster || rosterCounts(roster).total === 0) return null;
    return (
        <Paper sx={{ p: { xs: 2, md: 3 } }} component="section" aria-label="Roster">
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, textTransform: "uppercase", letterSpacing: 1 }}>
                Roster{roster.ageGroup ? ` · ${AGE_GROUP_LABELS[roster.ageGroup]}` : ""}
            </Typography>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>{rosterCountsLabel(roster)}</Typography>
            <Stack spacing={0.5}>
                {rosterByRole(roster).map((group) => (
                    <Box key={group.role}>
                        <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
                            {rosterRoleLabel(group.role)}:{" "}
                        </Typography>
                        <Typography variant="body2" component="span" color="text.secondary">
                            {group.players.join(", ")}
                        </Typography>
                    </Box>
                ))}
            </Stack>
        </Paper>
    );
}
