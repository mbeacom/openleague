import type { ReactNode } from "react";
import { Box, Card, Stack, Typography } from "@mui/material";
import { Crest } from "@/components/ui/Crest";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { resolveCrestColor } from "@/lib/utils/crest";

export interface EntityHeaderProps {
  name: string;
  id: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  /** Small label above the name: "Team", the parent association, a season. */
  eyebrow?: ReactNode;
  /** Chips and other identity metadata, rendered under the name. */
  meta?: ReactNode;
  /** Primary and secondary actions, right-aligned on desktop. */
  actions?: ReactNode;
  /** Counts rendered as a scoreboard strip across the bottom. */
  stats?: Stat[];
  /** Marks an entity the viewer administers — draws the orbital ring. */
  isAdmin?: boolean;
}

/**
 * The identity header for a team, league, association, or venue page.
 *
 * The entity's own color runs as a rule across the top and nowhere else. That
 * restraint is deliberate: an owner's brand color is unvetted against our
 * palette, so it gets one confident stroke where it cannot hurt legibility,
 * rather than being poured into headings and buttons where it would fight the
 * theme and fail contrast at random.
 *
 * Server-safe.
 */
export function EntityHeader({
  name,
  id,
  logoUrl,
  brandColor,
  eyebrow,
  meta,
  actions,
  stats,
  isAdmin = false,
}: EntityHeaderProps) {
  const accent = resolveCrestColor(id, brandColor);

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 3,
        position: "relative",
        overflow: "hidden",
        // The playbook grid: faint ruled paper that says "this is where the
        // plan lives" without competing with anything set on top of it.
        //
        // A CSS variable, not an sx theme callback: a function-valued sx
        // property cannot be serialized from a Server Component into MUI's
        // client components and 500s the page at render time. The variable
        // tracks the color scheme by itself.
        backgroundImage:
          "linear-gradient(var(--mui-palette-divider) 1px, transparent 1px), linear-gradient(90deg, var(--mui-palette-divider) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        backgroundPosition: "-1px -1px",
        "&::before": {
          content: '""',
          position: "absolute",
          insetInline: 0,
          top: 0,
          height: 4,
          backgroundColor: accent,
        },
      }}
    >
      <Box sx={{ p: { xs: 2.5, md: 3.5 }, pt: { xs: 3, md: 4 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 2.5, md: 3 }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Stack direction="row" spacing={2.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Crest
              name={name}
              id={id}
              logoUrl={logoUrl}
              brandColor={brandColor}
              size="lg"
              ring={isAdmin ? "accent" : "none"}
            />
            <Box sx={{ minWidth: 0 }}>
              {eyebrow ? (
                <Typography
                  component="p"
                  sx={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    mb: 0.5,
                  }}
                >
                  {eyebrow}
                </Typography>
              ) : null}
              <Typography
                variant="h4"
                component="h1"
                sx={{ fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}
              >
                {name}
              </Typography>
              {meta ? (
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ mt: 1.5 }}
                >
                  {meta}
                </Stack>
              ) : null}
            </Box>
          </Stack>

          {actions ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ width: { xs: "100%", md: "auto" }, flexShrink: 0 }}
            >
              {actions}
            </Stack>
          ) : null}
        </Stack>

        {stats && stats.length > 0 ? (
          <StatStrip stats={stats} size="md" sx={{ mt: 3 }} />
        ) : null}
      </Box>
    </Card>
  );
}
