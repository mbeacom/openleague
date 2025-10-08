"use client";

import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Paper,
  Avatar,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import {
  People as PeopleIcon,
  Event as EventIcon,
  Add as AddIcon,
  Settings as SettingsIcon,
  CalendarToday as CalendarIcon,
  Groups as GroupsIcon,
  SportsSoccer as SportsIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";

interface Team {
  id: string;
  name: string;
  sport: string;
  season: string;
  _count: {
    players: number;
    events: number;
  };
}

interface Division {
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
  teams: Team[];
}

interface League {
  id: string;
  name: string;
  sport: string;
  contactEmail: string;
  divisions: Division[];
  _count: {
    teams: number;
    players: number;
    events: number;
  };
}

interface RecentActivity {
  id: string;
  type: 'team_created' | 'event_scheduled' | 'player_added';
  description: string;
  timestamp: Date;
  teamName?: string;
}

interface LeagueDashboardProps {
  league: League;
  unassignedTeams: Team[];
  recentActivity: RecentActivity[];
  upcomingEvents: Array<{
    id: string;
    title: string;
    startAt: Date;
    teamName: string;
    type: 'GAME' | 'PRACTICE';
  }>;
  canManage: boolean;
}

export default function LeagueDashboard({
  league,
  unassignedTeams,
  recentActivity,
  upcomingEvents,
  canManage,
}: LeagueDashboardProps) {
  const router = useRouter();

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const getTeamInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Box>
      {/* League Header */}
      <Box sx={{ mb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              {league.name}
            </Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <Chip 
                icon={<SportsIcon />}
                label={league.sport} 
                variant="outlined" 
              />
              <Typography variant="body2" color="text.secondary">
                {league.contactEmail}
              </Typography>
            </Box>
          </Box>
          {canManage && (
            <Box display="flex" gap={1}>
              <Tooltip title="League Settings">
                <IconButton 
                  onClick={() => handleNavigate(`/league/${league.id}/settings`)}
                >
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* League Stats */}
        <Box 
          sx={{ 
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 2,
            mb: 3
          }}
        >
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="primary">
              {league._count.teams}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Teams
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="primary">
              {league._count.players}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Players
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="primary">
              {league._count.events}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Events
            </Typography>
          </Paper>
        </Box>
      </Box>

      <Box 
        sx={{ 
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
          gap: 3
        }}
      >
        {/* Left Column - League Structure */}
        <Box>
          {/* Quick Actions */}
          {canManage && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Quick Actions
                </Typography>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleNavigate(`/league/${league.id}/teams/new`)}
                  >
                    Add Team
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<GroupsIcon />}
                    onClick={() => handleNavigate(`/league/${league.id}/divisions`)}
                  >
                    Manage Divisions
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<CalendarIcon />}
                    onClick={() => handleNavigate(`/league/${league.id}/schedule`)}
                  >
                    View Schedule
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<PeopleIcon />}
                    onClick={() => handleNavigate(`/league/${league.id}/roster`)}
                  >
                    All Players
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Divisions and Teams */}
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  League Structure
                </Typography>
                {canManage && (
                  <Button
                    size="small"
                    onClick={() => handleNavigate(`/league/${league.id}/teams`)}
                  >
                    Manage Teams
                  </Button>
                )}
              </Box>

              {/* Divisions */}
              {league.divisions.map((division) => (
                <Box key={division.id} sx={{ mb: 3 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <Typography variant="h6" color="primary">
                      {division.name}
                    </Typography>
                    {(division.ageGroup || division.skillLevel) && (
                      <Typography variant="body2" color="text.secondary">
                        ({[division.ageGroup, division.skillLevel].filter(Boolean).join(", ")})
                      </Typography>
                    )}
                    <Chip 
                      label={`${division.teams.length} teams`} 
                      size="small" 
                      variant="outlined" 
                    />
                  </Box>

                  {division.teams.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mb: 2 }}>
                      No teams in this division
                    </Typography>
                  ) : (
                    <Box 
                      sx={{ 
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                        gap: 2,
                        mb: 2
                      }}
                    >
                      {division.teams.map((team) => (
                        <Box key={team.id}>
                          <Card variant="outlined" sx={{ height: '100%' }}>
                            <CardContent sx={{ pb: 1 }}>
                              <Box display="flex" alignItems="center" gap={2} mb={1}>
                                <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                                  {getTeamInitials(team.name)}
                                </Avatar>
                                <Box flex={1}>
                                  <Typography variant="subtitle2" noWrap>
                                    {team.name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {team.season}
                                  </Typography>
                                </Box>
                              </Box>
                              <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Box display="flex" gap={1}>
                                  <Chip 
                                    icon={<PeopleIcon />}
                                    label={team._count.players} 
                                    size="small" 
                                    variant="outlined" 
                                  />
                                  <Chip 
                                    icon={<EventIcon />}
                                    label={team._count.events} 
                                    size="small" 
                                    variant="outlined" 
                                  />
                                </Box>
                              </Box>
                            </CardContent>
                            <CardActions sx={{ pt: 0 }}>
                              <Button 
                                size="small" 
                                onClick={() => handleNavigate(`/team/${team.id}`)}
                              >
                                View
                              </Button>
                            </CardActions>
                          </Card>
                        </Box>
                      ))}
                    </Box>
                  )}
                  <Divider />
                </Box>
              ))}

              {/* Unassigned Teams */}
              {unassignedTeams.length > 0 && (
                <Box>
                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <Typography variant="h6" color="text.secondary">
                      Unassigned Teams
                    </Typography>
                    <Chip 
                      label={`${unassignedTeams.length} teams`} 
                      size="small" 
                      variant="outlined" 
                      color="secondary"
                    />
                  </Box>
                  <Box 
                    sx={{ 
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                      gap: 2
                    }}
                  >
                    {unassignedTeams.map((team) => (
                      <Box key={team.id}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                          <CardContent sx={{ pb: 1 }}>
                            <Box display="flex" alignItems="center" gap={2} mb={1}>
                              <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                                {getTeamInitials(team.name)}
                              </Avatar>
                              <Box flex={1}>
                                <Typography variant="subtitle2" noWrap>
                                  {team.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {team.season}
                                </Typography>
                              </Box>
                            </Box>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                              <Box display="flex" gap={1}>
                                <Chip 
                                  icon={<PeopleIcon />}
                                  label={team._count.players} 
                                  size="small" 
                                  variant="outlined" 
                                />
                                <Chip 
                                  icon={<EventIcon />}
                                  label={team._count.events} 
                                  size="small" 
                                  variant="outlined" 
                                />
                              </Box>
                            </Box>
                          </CardContent>
                          <CardActions sx={{ pt: 0 }}>
                            <Button 
                              size="small" 
                              onClick={() => handleNavigate(`/team/${team.id}`)}
                            >
                              View
                            </Button>
                          </CardActions>
                        </Card>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {league.divisions.length === 0 && unassignedTeams.length === 0 && (
                <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                  No teams in this league yet.
                  {canManage && " Click 'Add Team' to get started."}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Right Column - Activity and Events */}
        <Box>
          {/* Upcoming Events */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Upcoming Events
              </Typography>
              {upcomingEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No upcoming events
                </Typography>
              ) : (
                <Box>
                  {upcomingEvents.slice(0, 5).map((event) => (
                    <Box key={event.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        {event.title}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <Chip 
                          label={event.type} 
                          size="small" 
                          color={event.type === 'GAME' ? 'primary' : 'default'}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {event.teamName}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(event.startAt)}
                      </Typography>
                    </Box>
                  ))}
                  {upcomingEvents.length > 5 && (
                    <Button 
                      size="small" 
                      onClick={() => handleNavigate(`/league/${league.id}/schedule`)}
                    >
                      View All Events
                    </Button>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>
              {recentActivity.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent activity
                </Typography>
              ) : (
                <Box>
                  {recentActivity.slice(0, 5).map((activity) => (
                    <Box key={activity.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="body2" gutterBottom>
                        {activity.description}
                      </Typography>
                      {activity.teamName && (
                        <Typography variant="caption" color="primary">
                          {activity.teamName}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" display="block">
                        {formatDate(activity.timestamp)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}