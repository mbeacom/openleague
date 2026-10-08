"use client";

/**
 * One team's identity in the rankings screens (hosted rankings and team logos
 * spec, R5): the team's logo when the document holds one, else its Crest
 * (initials on a colour seeded by the team number), with the number and name
 * beside it. `crestOnly` draws the mark alone, for rows that show the name
 * elsewhere. Shared by the static and hosted apps; every rankings screen draws
 * teams through this.
 *
 * The logo comes from `logoUrl` when it is passed (null: no logo). Left out,
 * it is looked up from the nearest TeamLogosProvider, so table cells and
 * ladder rows don't have to thread the document through. The mark is
 * decorative (aria-hidden); the number and name are the accessible text.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Box, Stack } from "@mui/material";
import { Crest, type CrestSize } from "@/components/ui/Crest";
import type { RankingsTeam } from "@/lib/rankings-document";

export interface TeamMarkProps {
    number: string;
    name: string;
    /** The team's logo; null for none. Left out, the nearest TeamLogosProvider's logo for this number. */
    logoUrl?: string | null;
    size?: Extract<CrestSize, "xs" | "sm" | "md" | "lg">;
    /** The orbital ring: marks the user's own team. */
    mine?: boolean;
    /** Draw only the mark (the name is shown elsewhere). */
    crestOnly?: boolean;
    /** Make the text heavier, e.g. a game's winner. */
    strong?: boolean;
    /** Make the text quieter, e.g. a game's loser. */
    muted?: boolean;
}

/** The Crest's colour is seeded by the team number, the team's durable id in a rankings document. */
export const teamCrestId = (number: string) => `rankings-team-${number}`;

const TeamLogosContext = createContext<ReadonlyMap<string, string>>(new Map());

/** Makes the document's team logos available to every TeamMark below it. */
export function TeamLogosProvider({ teams, children }: { teams: readonly Pick<RankingsTeam, "number" | "logo">[]; children: ReactNode }) {
    const logos = useMemo(() => teamLogoUrls(teams), [teams]);
    return <TeamLogosContext.Provider value={logos}>{children}</TeamLogosContext.Provider>;
}

/** Team number to logo data URL, for the teams that have one. */
export function teamLogoUrls(teams: readonly Pick<RankingsTeam, "number" | "logo">[]): ReadonlyMap<string, string> {
    const map = new Map<string, string>();
    for (const team of teams) if (team.logo) map.set(team.number, team.logo.dataUrl);
    return map;
}

export function TeamMark({ number, name, logoUrl, size = "sm", mine = false, crestOnly = false, strong = false, muted = false }: TeamMarkProps) {
    const logos = useContext(TeamLogosContext);
    const logo = logoUrl === undefined ? logos.get(number) ?? null : logoUrl;
    const crest = <Crest name={name || number} id={teamCrestId(number)} logoUrl={logo} size={size} ring={mine ? "accent" : "none"} />;
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
