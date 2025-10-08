"use client";

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Fab,
  TextField,
  InputAdornment,
  Select,
  FormControl,
  InputLabel,
  type SelectChangeEvent,
} from '@mui/material';
import {
  Add as AddIcon,
  Groups as TeamsIcon,
  People as PlayersIcon,
  Event as EventIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Category as DivisionIcon,
  Schedule as ScheduleIcon,
  Search as SearchIcon,
  FileDownload as DownloadIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { exportLeagueTeamsToCSV } from '@/lib/utils/csv-export';

interface LeagueTeamsViewProps {
  league: {
    id: string;
    name: string;
    sport: string;
    divisions: Array<{
      id: string;
      name: string;
      ageGroup: string | null;
      skillLevel: string | null;
      teams: Array<{
        id: string;
        name: string;
        sport: string;
        season: string;
        createdAt: Date;
        _count: {
          players: number;
          events: number;
        };
      }>;
    }>;
    unassignedTeams: Array<{
      id: string;
      name: string;
      sport: string;
      season: string;
      createdAt: Date;
      _count: {
        players: number;
        events: number;
      };
    }>;
    stats: {
      totalTeams: number;
      totalPlayers: number;
      totalDivisions: number;
    };
  };
}

interface TeamCardProps {
  team: {
    id: string;
    name: string;
    sport: string;
    season: string;
    createdAt: Date;
    _count: {
      players: number;
      events: number;
    };
  };
  leagueId: string;
}

function TeamCard({ team, leagueId }: TeamCardProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <TeamsIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" component="div">
                {team.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {team.season} • {team.sport}
              </Typography>
            </Box>
          </Box>
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            aria-label="team options"
          >
            <MoreVertIcon />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PlayersIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {team._count.players} players
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <EventIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {team._count.events} events
            </Typography>
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary">
          Created {formatDistanceToNow(new Date(team.createdAt))} ago
        </Typography>
      </CardContent>

      <CardActions>
        <Button
          size="small"
          component={Link}
          href={`/league/${leagueId}/teams/${team.id}`}
        >
          View Team
        </Button>
        <Button
          size="small"
          component={Link}
          href={`/league/${leagueId}/teams/${team.id}/roster`}
        >
          Roster
        </Button>
      </CardActions>

      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          component={Link}
          href={`/league/${leagueId}/teams/${team.id}/edit`}
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Team</ListItemText>
        </MenuItem>
        <MenuItem
          component={Link}
          href={`/league/${leagueId}/teams/${team.id}/schedule`}
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <ScheduleIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Schedule</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleMenuClose} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete Team</ListItemText>
        </MenuItem>
      </Menu>
    </Card>
  );
}

export default function LeagueTeamsView({ league }: LeagueTeamsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'players' | 'created'>('name');

  // Flatten all teams for filtering
  const allTeams = useMemo(() => {
    const teamsWithDivision = league.divisions.flatMap(division =>
      division.teams.map(team => ({
        ...team,
        divisionName: division.name,
        divisionId: division.id,
      }))
    );
    const unassigned = league.unassignedTeams.map(team => ({
      ...team,
      divisionName: undefined,
      divisionId: undefined,
    }));
    return [...teamsWithDivision, ...unassigned];
  }, [league.divisions, league.unassignedTeams]);

  // Filter and sort teams
  const filteredTeams = useMemo(() => {
    let filtered = allTeams;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(team =>
        team.name.toLowerCase().includes(query) ||
        team.sport.toLowerCase().includes(query) ||
        team.season.toLowerCase().includes(query)
      );
    }

    // Apply division filter
    if (divisionFilter !== 'all') {
      if (divisionFilter === 'unassigned') {
        filtered = filtered.filter(team => !team.divisionId);
      } else {
        filtered = filtered.filter(team => team.divisionId === divisionFilter);
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'players':
          return b._count.players - a._count.players;
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [allTeams, searchQuery, divisionFilter, sortBy]);

  // Group filtered teams by division for display
  const groupedTeams = useMemo(() => {
    const groups: Record<string, typeof filteredTeams> = {};

    filteredTeams.forEach(team => {
      const key = team.divisionId || 'unassigned';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(team);
    });

    return groups;
  }, [filteredTeams]);

  // Handle export
  const handleExport = () => {
    const exportData = allTeams.map(team => ({
      name: team.name,
      sport: team.sport,
      season: team.season,
      divisionName: team.divisionName,
      playerCount: team._count.players,
      eventCount: team._count.events,
      createdAt: team.createdAt,
    }));
    exportLeagueTeamsToCSV(exportData, league.name);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Teams
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Manage teams in {league.name}
        </Typography>

        {/* Stats */}
        <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TeamsIcon color="primary" />
            <Typography variant="body2">
              {league.stats.totalTeams} teams
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PlayersIcon color="success" />
            <Typography variant="body2">
              {league.stats.totalPlayers} players
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DivisionIcon color="secondary" />
            <Typography variant="body2">
              {league.stats.totalDivisions} divisions
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Search and Filters */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            data-search-input
            sx={{ flexGrow: 1, minWidth: 200 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Division</InputLabel>
            <Select
              value={divisionFilter}
              label="Division"
              onChange={(e: SelectChangeEvent) => setDivisionFilter(e.target.value)}
            >
              <MenuItem value="all">All Divisions</MenuItem>
              {league.divisions.map(division => (
                <MenuItem key={division.id} value={division.id}>
                  {division.name}
                </MenuItem>
              ))}
              <MenuItem value="unassigned">Unassigned</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              label="Sort By"
              onChange={(e: SelectChangeEvent<'name' | 'players' | 'created'>) =>
                setSortBy(e.target.value as 'name' | 'players' | 'created')
              }
            >
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="players">Players</MenuItem>
              <MenuItem value="created">Newest</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            sx={{ ml: 'auto' }}
          >
            Export CSV
          </Button>
        </Box>
      </Box>

      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
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
          startIcon={<DivisionIcon />}
          component={Link}
          href={`/league/${league.id}/divisions/new`}
        >
          Create Division
        </Button>
      </Box>

      {/* Results count */}
      {(searchQuery || divisionFilter !== 'all') && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {filteredTeams.length} of {allTeams.length} teams
            {searchQuery && ` matching "${searchQuery}"`}
          </Typography>
        </Box>
      )}

      {/* Divisions with filtered teams */}
      {league.divisions.map((division) => {
        const divisionTeams = groupedTeams[division.id] || [];

        // Skip division if no teams match filter
        if (divisionFilter !== 'all' && divisionFilter !== division.id && divisionTeams.length === 0) {
          return null;
        }

        return (
          <Box key={division.id} sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h5" component="h2" gutterBottom>
                  {division.name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {division.ageGroup && (
                    <Chip label={division.ageGroup} size="small" />
                  )}
                  {division.skillLevel && (
                    <Chip label={division.skillLevel} size="small" variant="outlined" />
                  )}
                  {divisionTeams.length > 0 && (
                    <Chip
                      label={`${divisionTeams.length} team${divisionTeams.length !== 1 ? 's' : ''}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
              <Button
                size="small"
                component={Link}
                href={`/league/${league.id}/divisions/${division.id}/edit`}
              >
                Edit Division
              </Button>
            </Box>

            {divisionTeams.length === 0 ? (
              <Card variant="outlined">
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {searchQuery || divisionFilter !== 'all'
                      ? 'No teams match your search in this division'
                      : 'No teams in this division yet'}
                  </Typography>
                  {!searchQuery && divisionFilter === 'all' && (
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      component={Link}
                      href={`/league/${league.id}/teams/new?divisionId=${division.id}`}
                      sx={{ mt: 1 }}
                    >
                      Add Team to Division
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 2
              }}>
                {divisionTeams.map((team) => (
                  <TeamCard key={team.id} team={team} leagueId={league.id} />
                ))}
              </Box>
            )}
          </Box>
        );
      })}

      {/* Unassigned Teams */}
      {(() => {
        const unassignedTeams = groupedTeams['unassigned'] || [];

        if (divisionFilter !== 'all' && divisionFilter !== 'unassigned' && unassignedTeams.length === 0) {
          return null;
        }

        if (unassignedTeams.length === 0 && league.unassignedTeams.length === 0) {
          return null;
        }

        return (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom>
              Other Teams
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Teams not assigned to any division
            </Typography>

            {unassignedTeams.length === 0 ? (
              <Card variant="outlined">
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No unassigned teams match your search
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 2
              }}>
                {unassignedTeams.map((team) => (
                  <TeamCard key={team.id} team={team} leagueId={league.id} />
                ))}
              </Box>
            )}
          </Box>
        );
      })()}

      {/* Empty State */}
      {league.stats.totalTeams === 0 && (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <TeamsIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No teams yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Get started by creating your first team in this league
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              component={Link}
              href={`/league/${league.id}/teams/new`}
            >
              Create First Team
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Floating Action Button for Mobile */}
      <Fab
        color="primary"
        aria-label="add team"
        component={Link}
        href={`/league/${league.id}/teams/new`}
        sx={{
          position: 'fixed',
          bottom: { xs: 80, md: 16 }, // Account for mobile bottom nav
          right: 16,
          display: { xs: 'flex', sm: 'none' }, // Only show on mobile
        }}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}