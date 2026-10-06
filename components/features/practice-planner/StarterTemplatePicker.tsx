"use client";

import { Box, Button, Card, CardActions, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { STARTER_TEMPLATES, starterTemplatePlan, type StarterTemplate } from "@/lib/data/starter-templates";
import { parsePlan, type ParsePlanResult, type PlanGenerator } from "@/lib/plan-document";
import { groupStations } from "@/lib/utils/session-timeline";
import { drillRows } from "@/lib/utils/session-rows";
import { formatAgeGroups, matchesAgeGroup } from "@/lib/utils/age-groups";
import { AgeFilter, AgeFilterEmpty } from "./AgeFilter";
import { useAgeFilter } from "./useAgeFilter";

/**
 * A template as the import views receive a plan file: stamped with the running
 * app and the moment it was chosen, then parsed. The JSON round trip matters:
 * the template's diagrams are the starter drills' own objects, and the import
 * must never hold (or let an editor mutate) those.
 */
export function starterTemplateImport(template: StarterTemplate, generator: PlanGenerator, now: Date = new Date()): ParsePlanResult {
    return parsePlan(JSON.parse(JSON.stringify(starterTemplatePlan(template, generator, now))));
}

export interface StarterTemplatePickerProps {
    onUse: (template: StarterTemplate) => void;
    disabled?: boolean;
    /** The templates offered; tests pass their own. */
    templates?: readonly StarterTemplate[];
}

/**
 * Starter practice templates (spec R11). Choosing one hands it to the import
 * view, which previews it and saves it exactly like a plan file. Filtered by
 * the remembered age (R3) against each template's own ages.
 */
export function StarterTemplatePicker({ onUse, disabled = false, templates = STARTER_TEMPLATES }: StarterTemplatePickerProps) {
    const [ageFilter, setAgeFilter] = useAgeFilter();
    const shown = templates.filter((template) => matchesAgeGroup(template.ageGroups, ageFilter));
    return (
        <Stack component="section" spacing={2} aria-labelledby="starter-templates-heading">
            <Box>
                <Typography id="starter-templates-heading" variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                    Start from a template
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Station practices with a goalie station, built from the starter drills. Everything stays editable after you save it.
                </Typography>
            </Box>
            <AgeFilter value={ageFilter} onChange={setAgeFilter} />
            {ageFilter && shown.length === 0 && <AgeFilterEmpty noun="templates" ageGroup={ageFilter} onShowAll={() => setAgeFilter(null)} />}
            <Grid container spacing={2}>
                {shown.map((template) => {
                    const blocks = groupStations(template.session.drills).filter((group) => group.stations.length > 1).length;
                    return (
                        <Grid key={template.id} size={{ xs: 12, md: 4 }}>
                            <Card
                                variant="outlined"
                                sx={{ height: "100%", display: "flex", flexDirection: "column", borderTop: 4, borderTopColor: "primary.main" }}
                            >
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 800 }}>
                                        {template.name}
                                    </Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 1 }}>
                                        <Chip size="small" label={`${template.session.durationMinutes} min`} />
                                        <Chip size="small" label={`${drillRows(template.session.drills).length} drills`} />
                                        <Chip size="small" label={`${blocks} station ${blocks === 1 ? "block" : "blocks"}`} />
                                        <Chip size="small" color="primary" variant="outlined" label={formatAgeGroups(template.ageGroups)} />
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        {template.description}
                                    </Typography>
                                </CardContent>
                                <CardActions sx={{ px: 2, pb: 2 }}>
                                    <Button
                                        variant="contained"
                                        onClick={() => onUse(template)}
                                        disabled={disabled}
                                        aria-label={`Use template: ${template.name}`}
                                        sx={{ minHeight: 44 }}
                                    >
                                        Use template
                                    </Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>
        </Stack>
    );
}
