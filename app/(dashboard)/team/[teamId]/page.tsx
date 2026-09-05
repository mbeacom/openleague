import { notFound } from "next/navigation";
import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Event as EventIcon,
  Forum as ForumIcon,
  Groups as GroupsIcon,
  People as PeopleIcon,
  Palette as PaletteIcon,
} from "@mui/icons-material";
import { getTeamOverviewData } from "@/lib/actions/team-context";
import { formatSport } from "@/lib/utils/validation";
import { LinkButton, LinkCard } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { EntityHeader } from "@/components/ui/EntityHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DateBlock } from "@/components/ui/DateBlock";

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function formatAccessRole(role: string, isAdmin: boolean) {
  switch (role) {
    case "LEAGUE_ADMIN":
      return "League admin";
    case "TEAM_ADMIN":
      return "League team admin";
    default:
      return isAdmin ? "Team admin" : "Member";
  }
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { teamId } = await params;
  const team = await getTeamOverviewData(teamId);

  if (!team) {
    notFound();
  }

  return (
    <PageContainer>
      <LinkButton href="/dashboard" startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>
        Back to dashboard
      </LinkButton>

      <EntityHeader
        name={team.name}
        id={team.id}
        logoUrl={team.logoUrl}
        brandColor={team.brandPrimaryColor}
        isAdmin={team.isAdmin}
        eyebrow={team.league ? team.league.name : "Team"}
        meta={
          <>
            <Chip size="small" label={formatSport(team.sport)} />
            <Chip size="small" variant="outlined" label={team.season} />
            <Chip
              size="small"
              label={formatAccessRole(team.role, team.isAdmin)}
              color={team.isAdmin ? "primary" : "default"}
              variant={team.isAdmin ? "filled" : "outlined"}
            />
            {team.division ? (
              <Chip size="small" variant="outlined" label={team.division.name} />
            ) : null}
          </>
        }
        stats={[
          { label: "Players", value: team.stats.players },
          { label: "Events", value: team.stats.events },
          { label: "Members", value: team.stats.members },
        ]}
        actions={
          <>
            <LinkButton
              href={`/team/${team.id}/roster`}
              variant="contained"
              startIcon={<PeopleIcon />}
            >
              {team.isAdmin ? "Manage roster" : "View roster"}
            </LinkButton>
            <LinkButton
              href={`/team/${team.id}/messages`}
              variant="outlined"
              startIcon={<ForumIcon />}
            >
              {team.isAdmin ? "Message team" : "Messages"}
            </LinkButton>
            {team.league ? (
              <LinkButton
                href={`/league/${team.league.id}/teams`}
                variant="outlined"
                startIcon={<GroupsIcon />}
              >
                League teams
              </LinkButton>
            ) : null}
            {team.isAdmin ? (
              <LinkButton
                href={`/team/${team.id}/settings`}
                variant="outlined"
                startIcon={<PaletteIcon />}
              >
                Appearance
              </LinkButton>
            ) : null}
          </>
        }
      />

      <Box component="section">
        <SectionHeader
          title="Upcoming events"
          badge={team.upcomingEvents.length || undefined}
          action={
            <LinkButton href="/calendar" size="small">
              Full calendar
            </LinkButton>
          }
        />

        {team.upcomingEvents.length === 0 ? (
          <EmptyState
            icon={<EventIcon />}
            title="No upcoming events"
            description="No games or practices are scheduled for this team yet."
          />
        ) : (
          <Stack spacing={1.5}>
            {team.upcomingEvents.map((event) => {
              const startAt = new Date(event.startAt);
              const isGame = event.type === "GAME";

              const content = (
                <CardContent
                  sx={{
                    py: 1.5,
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    "&:last-child": { pb: 1.5 },
                  }}
                >
                  <DateBlock value={startAt} />

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                      {event.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {TIME_FORMAT.format(startAt)} · {event.location || "Location TBD"}
                      {event.opponent ? ` · vs. ${event.opponent}` : ""}
                    </Typography>
                  </Box>

                  <Chip
                    size="small"
                    label={isGame ? "Game" : "Practice"}
                    color={isGame ? "primary" : "default"}
                    variant={isGame ? "filled" : "outlined"}
                    sx={{ flexShrink: 0 }}
                  />
                </CardContent>
              );

              const cardSx = {
                color: "inherit",
                textDecoration: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
                ...(team.canOpenEventDetails && {
                  cursor: "pointer",
                  "&:hover": { borderColor: "secondary.main", boxShadow: 1 },
                }),
              } as const;

              return team.canOpenEventDetails ? (
                <LinkCard
                  key={event.id}
                  href={`/events/${event.id}`}
                  variant="outlined"
                  sx={cardSx}
                >
                  {content}
                </LinkCard>
              ) : (
                <Card key={event.id} variant="outlined" sx={cardSx}>
                  {content}
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>
    </PageContainer>
  );
}
