/**
 * One team's identity in the rankings screens: its Crest, number and name.
 * Every rankings list draws a team through this, so a per-team logo only has
 * to be passed in here (`logoUrl`) to show up everywhere. The Crest is
 * decorative (aria-hidden); the number and name are the accessible text.
 */
import { Box, Stack } from "@mui/material";
import { Crest, type CrestSize } from "@/components/ui/Crest";

export interface TeamMarkProps {
    number: string;
    name: string;
    /** A team logo, when the rankings document has one. */
    logoUrl?: string | null;
    size?: Extract<CrestSize, "xs" | "sm" | "md" | "lg">;
    /** The orbital ring: marks the user's own team. */
    mine?: boolean;
    /** Draw only the crest (the name is shown elsewhere). */
    crestOnly?: boolean;
    /** Make the text heavier, e.g. a game's winner. */
    strong?: boolean;
    /** Make the text quieter, e.g. a game's loser. */
    muted?: boolean;
}

/** The Crest's colour is seeded by the team number, the team's durable id in a rankings document. */
export const teamCrestId = (number: string) => `rankings-team-${number}`;

export function TeamMark({ number, name, logoUrl = null, size = "sm", mine = false, crestOnly = false, strong = false, muted = false }: TeamMarkProps) {
    const crest = <Crest name={name || number} id={teamCrestId(number)} logoUrl={logoUrl} size={size} ring={mine ? "accent" : "none"} />;
    if (crestOnly) return crest;
    return (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
            {crest}
            <Box sx={{ minWidth: 0, display: "flex", alignItems: "baseline", columnGap: 0.75 }}>
                <Box
                    component="span"
                    sx={{ fontFamily: "var(--font-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", fontSize: "0.8125rem", color: "text.secondary", flexShrink: 0 }}
                >
                    {number}
                </Box>
                <Box
                    component="span"
                    sx={{ fontWeight: strong ? 800 : muted ? 500 : 600, color: muted ? "text.secondary" : "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
                >
                    {name}
                </Box>
            </Box>
        </Stack>
    );
}
