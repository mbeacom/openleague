import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  CalendarToday as CalendarIcon,
  Event as EventIcon,
  Groups as GroupsIcon,
  People as PeopleIcon,
  SportsSoccer as SportsIcon,
} from "@mui/icons-material";
import { getTeamOverviewData } from "@/lib/actions/team-context";
import { formatSport } from "@/lib/utils/validation";

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

function getTeamInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAccessRole(role: string, isAdmin: boolean) {
  switch (role) {
    case "LEAGUE_ADMIN":
      return "League Admin";
    case "TEAM_ADMIN":
      return "League Team Admin";
    default:
      if (isAdmin) return "Team Admin";
      return "Member";
  }
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { teamId } = await params;
  const team = await getTeamOverviewData(teamId);

  if (!team) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Button
          component={Link}
          href="/dashboard"
          startIcon={<ArrowBackIcon />}
          sx={{ mb: 3 }}
        >
          Back to dashboard
        </Button>

        <Card
          sx={{
            mb: 3,
            overflow: "hidden",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              spacing={3}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar
                  sx={{
                    width: 64,
                    height: 64,
                    bgcolor: "primary.main",
                    fontSize: "1.25rem",
                    fontWeight: 800,
                  }}
                >
                  {getTeamInitials(team.name)}
                </Avatar>
                <Box>
                  <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
                    {team.name}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip icon={<SportsIcon />} label={formatSport(team.sport)} />
                    <Chip label={team.season} variant="outlined" />
                    <Chip
                      label={formatAccessRole(team.role, team.isAdmin)}
                      color={team.isAdmin ? "primary" : "default"}
                      variant={team.isAdmin ? "filled" : "outlined"}
                    />
                    {team.league ? <Chip label={team.league.name} color="secondary" variant="outlined" /> : null}
                    {team.division ? <Chip label={`Division: ${team.division.name}`} variant="outlined" /> : null}
                  </Stack>
                </Box>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: { xs: "100%", md: "auto" } }}>
                <Button
                  component={Link}
                  href={`/team/${team.id}/roster`}
                  variant="contained"
                  startIcon={<PeopleIcon />}
                  fullWidth
                >
                  {team.isAdmin ? "Manage roster" : "View roster"}
                </Button>
                {team.league ? (
                  <Button
                    component={Link}
                    href={`/league/${team.league.id}/teams`}
                    variant="outlined"
                    startIcon={<GroupsIcon />}
                    fullWidth
                  >
                    League teams
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 2,
            mb: 3,
          }}
        >
          <StatCard icon={<PeopleIcon color="primary" />} label="Players" value={team.stats.players} />
          <StatCard icon={<EventIcon color="primary" />} label="Events" value={team.stats.events} />
          <StatCard icon={<GroupsIcon color="primary" />} label="Members" value={team.stats.members} />
        </Box>

        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CalendarIcon color="primary" />
              <Typography variant="h5" component="h2" fontWeight={700}>
                Upcoming events
              </Typography>
            </Stack>

            {team.upcomingEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No upcoming games or practices are scheduled for this team yet.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {team.upcomingEvents.map((event) => (
                  <Card
                    key={event.id}
                    {...(team.canOpenEventDetails
                      ? { component: Link, href: `/events/${event.id}` }
                      : {})}
                    variant="outlined"
                    sx={{
                      color: "inherit",
                      textDecoration: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                      ...(team.canOpenEventDetails && {
                        cursor: "pointer",
                      }),
                      "&:hover": team.canOpenEventDetails ? {
                        borderColor: "primary.main",
                        boxShadow: 1,
                      } : undefined,
                    }}
                  >
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        spacing={1}
                      >
                        <Box>
                          <Typography variant="subtitle1" fontWeight={700}>
                            {event.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {event.location || "Location TBD"}
                            {event.opponent ? ` • vs. ${event.opponent}` : ""}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={event.type === "GAME" ? "Game" : "Practice"} />
                          <Typography variant="body2" color="text.secondary">
                            {formatEventDate(event.startAt)}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {icon}
          <Box>
            <Typography variant="h4" component="p" fontWeight={800}>
              {value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}