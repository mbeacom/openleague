import { Box, Card, Chip, Stack, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { formatSport } from "@/lib/utils/validation";
import { LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { Crest } from "@/components/ui/Crest";
import { StatStrip } from "@/components/ui/StatStrip";
import { resolveCrestColor } from "@/lib/utils/crest";

interface LeagueOverviewCardProps {
  league: {
    id: string;
    name: string;
    sport: string;
    logoUrl?: string | null;
    brandPrimaryColor?: string | null;
    _count: {
      teams: number;
      players: number;
      events: number;
      divisions: number;
    };
  };
  userRole: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER";
}

const ROLE_LABELS: Record<LeagueOverviewCardProps["userRole"], string> = {
  LEAGUE_ADMIN: "League admin",
  TEAM_ADMIN: "Team admin",
  MEMBER: "Member",
};

/**
 * A league tile. Same contract as TeamCard: the whole card is the link, and it
 * points at the league dashboard because no /league/[leagueId] index exists.
 */
export default function LeagueOverviewCard({
  league,
  userRole,
}: LeagueOverviewCardProps) {
  const isAdmin = userRole === "LEAGUE_ADMIN";
  const accent = resolveCrestColor(league.id, league.brandPrimaryColor);

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
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
        href={`/league/${league.id}/dashboard`}
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
              name={league.name}
              id={league.id}
              logoUrl={league.logoUrl}
              brandColor={league.brandPrimaryColor}
              size="md"
              ring={isAdmin ? "accent" : "none"}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                component="h3"
                sx={{ fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em" }}
              >
                {league.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {formatSport(league.sport)}
              </Typography>
            </Box>
            <ChevronRightIcon
              fontSize="small"
              sx={{ color: "text.disabled", mt: 0.5, flexShrink: 0 }}
            />
          </Stack>

          <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, mb: "auto" }}>
            <Chip
              size="small"
              label={ROLE_LABELS[userRole]}
              color={isAdmin ? "primary" : "default"}
              variant={isAdmin ? "filled" : "outlined"}
            />
          </Stack>

          <StatStrip
            sx={{ mt: 2 }}
            stats={[
              { label: "Teams", value: league._count.teams },
              { label: "Players", value: league._count.players },
              { label: "Divisions", value: league._count.divisions },
            ]}
          />
        </Box>
      </LinkCardActionArea>
    </Card>
  );
}
