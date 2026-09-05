"use client";

import React from 'react';
import { formatSport } from "@/lib/utils/validation";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Groups as TeamsIcon,
  People as PlayersIcon,
  Event as EventIcon,
  CalendarToday as CalendarIcon,
  Category as DivisionIcon,
  Add as AddIcon,
  Schedule as ScheduleIcon,
  Announcement as AnnouncementIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as TimeIcon,
  LocationOn as LocationIcon,
  Assessment as AssessmentIcon,
  Download as DownloadIcon,
  Payments as PaymentsIcon,
} from '@mui/icons-material';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';
import { EntityHeader } from '@/components/ui/EntityHeader';

interface LeagueDashboardProps {
  league: {
    id: string;
    name: string;
    sport: string;
    contactEmail: string;
    contactPhone: string | null;
    createdAt: Date;
    logoUrl?: string | null;
    brandPrimaryColor?: string | null;
    stats: {
      totalTeams: number;
      totalPlayers: number;
      totalEvents: number;
      upcomingEvents: number;
      activeDivisions: number;
    };
    recentActivity: Array<{
      id: string;
      type: 'team_created' | 'player_added' | 'event_scheduled' | 'division_created';
      description: string;
      timestamp: Date;
      teamName?: string;
      playerName?: string;
      eventTitle?: string;
      divisionName?: string;
    }>;
    upcomingEvents: Array<{
      id: string;
      title: string;
      startAt: Date;
      location: string;
      teamName: string;
      homeTeamName?: string;
      awayTeamName?: string;
      type: string;
    }>;
    divisions: Array<{
      id: string;
      name: string;
      ageGroup: string | null;
      skillLevel: string | null;
      teamCount: number;
    }>;
  };
}

export default function LeagueDashboard({ league }: LeagueDashboardProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'team_created':
        return <TeamsIcon fontSize="small" />;
      case 'player_added':
        return <PlayersIcon fontSize="small" />;
      case 'event_scheduled':
        return <EventIcon fontSize="small" />;
      case 'division_created':
        return <DivisionIcon fontSize="small" />;
      default:
        return <TrendingUpIcon fontSize="small" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'team_created':
        return 'primary';
      case 'player_added':
        return 'success';
      case 'event_scheduled':
        return 'info';
      case 'division_created':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <EntityHeader
        name={league.name}
        id={league.id}
        logoUrl={league.logoUrl}
        brandColor={league.brandPrimaryColor}
        eyebrow="Association"
        meta={
          <>
            <Chip label={formatSport(league.sport)} color="primary" size="small" />
            <Chip
              label={`Since ${format(new Date(league.createdAt), 'MMM yyyy')}`}
              size="small"
              variant="outlined"
            />
          </>
        }
        stats={[
          { label: 'Teams', value: league.stats.totalTeams },
          { label: 'Players', value: league.stats.totalPlayers },
          { label: 'Divisions', value: league.stats.activeDivisions },
          { label: 'Events', value: league.stats.totalEvents },
          { label: 'Upcoming', value: league.stats.upcomingEvents },
        ]}
      />

      {/* Quick Actions */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            Quick Actions
          </Typography>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
            gap: { xs: 1, sm: 2 }
          }}>
            <Button
              variant="contained"
              startIcon={<AddIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              component={Link}
              href={`/league/${league.id}/teams/new`}
              fullWidth
              size="small"
              sx={{
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                py: { xs: 1, sm: 1.5 }
              }}
            >
              Add Team
            </Button>
            <Button
              variant="outlined"
              startIcon={<ScheduleIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              component={Link}
              href={`/league/${league.id}/schedule/new-game`}
              fullWidth
              size="small"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              Schedule
            </Button>
            <Button
              variant="outlined"
              startIcon={<AnnouncementIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              component={Link}
              href={`/league/${league.id}/messages`}
              fullWidth
              size="small"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              Announce
            </Button>
            <Button
              variant="outlined"
              startIcon={<DivisionIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              component={Link}
              href={`/league/${league.id}/divisions`}
              fullWidth
              size="small"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              Division
            </Button>
            <Button
              variant="outlined"
              startIcon={<AssessmentIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              component={Link}
              href={`/league/${league.id}/statistics`}
              fullWidth
              size="small"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              Stats
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              component={Link}
              href={`/league/${league.id}/reports`}
              fullWidth
              size="small"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              Reports
            </Button>
            <Button
              variant="outlined"
              startIcon={<PaymentsIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              component={Link}
              href={`/league/${league.id}/payments`}
              fullWidth
              size="small"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              Payments
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Content Grid */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: { xs: 2, sm: 3 },
        mb: { xs: 2, sm: 3 }
      }}>
        {/* Upcoming Events */}
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
              flexWrap: 'wrap',
              gap: 1
            }}>
              <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Upcoming Events
              </Typography>
              <Button
                size="small"
                component={Link}
                href={`/league/${league.id}/schedule`}
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                View All
              </Button>
            </Box>
            {league.upcomingEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No upcoming events scheduled
              </Typography>
            ) : (
              <List dense>
                {league.upcomingEvents.map((event, index) => (
                  <React.Fragment key={event.id}>
                    <ListItem sx={{ px: 0, py: { xs: 1.5, sm: 2 } }}>
                      <ListItemIcon sx={{ minWidth: { xs: 40, sm: 56 } }}>
                        <Avatar sx={{ width: { xs: 28, sm: 32 }, height: { xs: 28, sm: 32 }, bgcolor: 'primary.main' }}>
                          <EventIcon fontSize="small" />
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box>
                            <Typography
                              variant="subtitle2"
                              component="div"
                              sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                            >
                              {event.title}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                              <TimeIcon sx={{ fontSize: { xs: 14, sm: 16 } }} color="action" />
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                              >
                                {format(new Date(event.startAt), 'MMM d, h:mm a')}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <LocationIcon sx={{ fontSize: { xs: 14, sm: 16 } }} color="action" />
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  fontSize: { xs: '0.7rem', sm: '0.75rem' },
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {event.location}
                              </Typography>
                            </Box>
                          </Box>
                        }
                        secondary={
                          event.homeTeamName && event.awayTeamName
                            ? `${event.homeTeamName} vs ${event.awayTeamName}`
                            : event.teamName
                        }
                        secondaryTypographyProps={{
                          sx: { fontSize: { xs: '0.7rem', sm: '0.75rem' } }
                        }}
                      />
                    </ListItem>
                    {index < league.upcomingEvents.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Recent Activity
            </Typography>
            {league.recentActivity.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No recent activity
              </Typography>
            ) : (
              <List dense>
                {league.recentActivity.map((activity, index) => (
                  <React.Fragment key={activity.id}>
                    <ListItem sx={{ px: 0, py: { xs: 1.5, sm: 2 } }}>
                      <ListItemIcon sx={{ minWidth: { xs: 40, sm: 56 } }}>
                        <Avatar
                          sx={{
                            width: { xs: 28, sm: 32 },
                            height: { xs: 28, sm: 32 },
                            bgcolor: `${getActivityColor(activity.type)}.main`
                          }}
                        >
                          {getActivityIcon(activity.type)}
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={activity.description}
                        secondary={formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                        primaryTypographyProps={{
                          sx: { fontSize: { xs: '0.875rem', sm: '1rem' } }
                        }}
                        secondaryTypographyProps={{
                          sx: { fontSize: { xs: '0.7rem', sm: '0.75rem' } }
                        }}
                      />
                    </ListItem>
                    {index < league.recentActivity.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Divisions Overview */}
      {league.divisions.length > 0 && (
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
              flexWrap: 'wrap',
              gap: 1
            }}>
              <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Divisions
              </Typography>
              <Button
                size="small"
                component={Link}
                href={`/league/${league.id}/teams`}
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                Manage Teams
              </Button>
            </Box>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: { xs: 1.5, sm: 2 }
            }}>
              {league.divisions.map((division) => (
                <Card variant="outlined" key={division.id}>
                  <CardContent sx={{ py: { xs: 1.5, sm: 2 }, px: { xs: 1.5, sm: 2 } }}>
                    <Typography
                      variant="subtitle1"
                      gutterBottom
                      sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                    >
                      {division.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                      {division.ageGroup && (
                        <Chip label={division.ageGroup} size="small" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }} />
                      )}
                      {division.skillLevel && (
                        <Chip label={division.skillLevel} size="small" variant="outlined" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }} />
                      )}
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      {division.teamCount} {division.teamCount === 1 ? 'team' : 'teams'}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}