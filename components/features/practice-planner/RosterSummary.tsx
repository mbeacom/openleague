"use client";

/**
 * The practice roster on the session page (roster and suggestions spec R15):
 * the counts, then each position's players. Collapsed to its counts line
 * until opened, so the drill viewer stays near the top. Renders nothing for a
 * practice without players. Portable.
 */
import { Box, Stack, Typography } from "@mui/material";
import { rosterByRole, rosterCounts, rosterCountsLabel, rosterRoleLabel, type PracticeRoster } from "@/lib/utils/practice-roster";
import { AGE_GROUP_LABELS } from "@/lib/utils/age-groups";
import { CollapsibleSection } from "./CollapsibleSection";

export function RosterSummary({ roster }: { roster: PracticeRoster | null | undefined }) {
    if (!roster || rosterCounts(roster).total === 0) return null;
    return (
        <CollapsibleSection
            label="Roster"
            title={`Roster${roster.ageGroup ? ` · ${AGE_GROUP_LABELS[roster.ageGroup]}` : ""}`}
            summary={rosterCountsLabel(roster)}
        >
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
        </CollapsibleSection>
    );
}
