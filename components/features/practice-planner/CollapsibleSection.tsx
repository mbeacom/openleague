"use client";

/**
 * A titled section of the session page that starts collapsed, with a one-line
 * summary beside its title (the roster's counts, the equipment's item count),
 * so the drill viewer stays near the top of the page. A landmark named by its
 * title either way. Portable.
 */
import { useId, type ReactNode } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";

export interface CollapsibleSectionProps {
    title: string;
    /** The landmark's name; defaults to the title. */
    label?: string;
    /** Shown beside the title while collapsed and open. */
    summary: string;
    defaultExpanded?: boolean;
    children: ReactNode;
}

export function CollapsibleSection({ title, label = title, summary, defaultExpanded = false, children }: CollapsibleSectionProps) {
    const id = useId();
    return (
        <Box component="section" aria-label={label}>
            <Accordion defaultExpanded={defaultExpanded} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={`${id}-content`} id={`${id}-summary`}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            variant="subtitle2"
                            component="span"
                            color="text.secondary"
                            sx={{ display: "block", textTransform: "uppercase", letterSpacing: 1 }}
                        >
                            {title}
                        </Typography>
                        <Typography variant="body2" component="span" sx={{ display: "block", fontWeight: 800, overflowWrap: "anywhere" }}>
                            {summary}
                        </Typography>
                    </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                    {children}
                </AccordionDetails>
            </Accordion>
        </Box>
    );
}
