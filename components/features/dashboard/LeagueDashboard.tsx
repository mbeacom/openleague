"use client";

import React from 'react';
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
} from '@mui/icons-material';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';

interface LeagueDashboardProps {
  league: {
    id: string;
    name: string;
    sport: string;
    contactEmail: string;
    contactPhone: string | null;
    createdAt: Date;
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {league.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Chip label={league.sport} color="primary" />
          <Typography variant="body2" color="text.secondary">
            Created {formatDistanceToNow(new Date(league.createdAt))} ago
          </Typography>
        </Box>
      </Box>

      {/* Stats Overview */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(5, 1fr)'
          },
          gap: 2
        }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <TeamsIcon color="primary" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h5" component="div">
                {league.stats.totalTeams}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Teams
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <PlayersIcon color="success" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h5" component="div">
                {league.stats.totalPlayers}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Players
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <EventIcon color="info" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h5" component="div">
                {league.stats.totalEvents}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Events
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CalendarIcon color="warning" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h5" component="div">
                {league.stats.upcomingEvents}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Upcoming
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <DivisionIcon color="secondary" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h5" component="div">
                {league.stats.activeDivisions}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Divisions
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Quick Actions */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Quick Actions
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              component={Link}
              href={`/league/${league.id}/teams/new`}
            >
              Add Team
            </Button>
            <Button
              variant="outlined"
              startIcon={<ScheduleIcon />}
              component={Link}
              href={`/league/${league.id}/schedule/new-game`}
            >
              Schedule Game
            </Button>
            <Button
              variant="outlined"
              startIcon={<AnnouncementIcon />}
              component={Link}
              href={`/league/${league.id}/messages/new`}
            >
              Send Announcement
            </Button>
            <Button
              variant="outlined"
              startIcon={<DivisionIcon />}
              component={Link}
              href={`/league/${league.id}/divisions/new`}
            >
              Create Division
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Content Grid */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 3,
        mb: 3
      }}>
        {/* Upcoming Events */}
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Upcoming Events
              </Typography>
              <Button
                size="small"
                component={Link}
                href={`/league/${league.id}/schedule`}
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
                    <ListItem sx={{ px: 0 }}>
                      <ListItemIcon>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                          <EventIcon fontSize="small" />
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box>
                            <Typography variant="subtitle2" component="div">
                              {event.title}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                              <TimeIcon fontSize="small" color="action" />
                              <Typography variant="caption" color="text.secondary">
                                {format(new Date(event.startAt), 'MMM d, h:mm a')}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LocationIcon fontSize="small" color="action" />
                              <Typography variant="caption" color="text.secondary">
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
          <CardContent>
            <Typography variant="h6" gutterBottom>
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
                    <ListItem sx={{ px: 0 }}>
                      <ListItemIcon>
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: `${getActivityColor(activity.type)}.main`
                          }}
                        >
                          {getActivityIcon(activity.type)}
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={activity.description}
                        secondary={formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
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
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Divisions
              </Typography>
              <Button
                size="small"
                component={Link}
                href={`/league/${league.id}/teams`}
              >
                Manage Teams
              </Button>
            </Box>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2
            }}>
              {league.divisions.map((division) => (
                <Card variant="outlined" key={division.id}>
                  <CardContent sx={{ py: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      {division.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      {division.ageGroup && (
                        <Chip label={division.ageGroup} size="small" />
                      )}
                      {division.skillLevel && (
                        <Chip label={division.skillLevel} size="small" variant="outlined" />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
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