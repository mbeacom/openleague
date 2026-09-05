import { Box, Card, Chip, Stack, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { formatSport } from "@/lib/utils/validation";
import { LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { Crest } from "@/components/ui/Crest";
import { StatStrip } from "@/components/ui/StatStrip";
import { resolveCrestColor } from "@/lib/utils/crest";

type TeamCardProps = {
  team: {
    id: string;
    name: string;
    sport: string;
    season: string;
    logoUrl?: string | null;
    brandPrimaryColor?: string | null;
    league?: {
      id: string;
      name: string;
    } | null;
    division?: {
      id: string;
      name: string;
    } | null;
    _count?: {
      players: number;
      events: number;
    };
  };
  role: string;
  showLeagueInfo?: boolean;
  showStats?: boolean;
};

/**
 * A team tile on the dashboard.
 *
 * The entire card is one link to the team. It previously carried a "View Team"
 * text button and pushed with the router on click, which meant the tile — the
 * obvious target — did nothing, and the one thing that worked could not be
 * opened in a new tab, middle-clicked, or reached in the tab order as a link.
 * A single CardActionArea over an anchor fixes all of that at once, and lets
 * this drop its client boundary and render on the server.
 */
export default function TeamCard({
  team,
  role,
  showLeagueInfo = false,
  showStats = false,
}: TeamCardProps) {
  const isAdmin = role === "ADMIN";
  const accent = resolveCrestColor(team.id, team.brandPrimaryColor);

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
        // The team's own color as a left edge — enough to tell two tiles apart
        // in peripheral vision, not enough to fight the card's content.
        "&::before": {
          content: '""',
          position: "absolute",
          insetBlock: 0,
          left: 0,
          width: 3,
          backgroundColor: accent,
          zIndex: 1,
        },
        "&:hover": {
          borderColor: "secondary.main",
          boxShadow: 3,
          transform: "translateY(-2px)",
        },
        "&:has(:focus-visible)": {
          borderColor: "secondary.main",
        },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
          "&:hover": { transform: "none" },
        },
      }}
    >
      <LinkCardActionArea
        href={`/team/${team.id}`}
        sx={{ height: "100%", p: 2.5, pl: 3 }}
      >
        {/* Column with the strip pushed to the bottom: without this a card
            carrying an "Admin" chip sits its scoreboard a row lower than its
            neighbors, and a grid of tiles stops lining up. */}
        <Box
          sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
        >
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Crest
              name={team.name}
              id={team.id}
              logoUrl={team.logoUrl}
              brandColor={team.brandPrimaryColor}
              size="md"
              ring={isAdmin ? "accent" : "none"}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                component="h3"
                sx={{ fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em" }}
              >
                {team.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {formatSport(team.sport)} · {team.season}
              </Typography>
            </Box>
            <ChevronRightIcon
              fontSize="small"
              sx={{ color: "text.disabled", mt: 0.5, flexShrink: 0 }}
            />
          </Stack>

          <Stack
            direction="row"
            spacing={0.75}
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 1.5, mb: "auto" }}
          >
            {isAdmin ? <Chip size="small" label="Admin" color="primary" /> : null}
            {showLeagueInfo && team.league ? (
              <Chip size="small" variant="outlined" label={team.league.name} />
            ) : null}
            {showLeagueInfo && team.division ? (
              <Chip size="small" variant="outlined" label={team.division.name} />
            ) : null}
          </Stack>

          {showStats && team._count ? (
            <StatStrip
              sx={{ mt: 2, pt: 1 }}
              stats={[
                { label: "Players", value: team._count.players },
                { label: "Events", value: team._count.events },
              ]}
            />
          ) : null}
        </Box>
      </LinkCardActionArea>
    </Card>
  );
}
