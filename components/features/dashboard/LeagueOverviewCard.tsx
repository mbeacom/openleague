"use client";

import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  Button,
  Avatar,
} from "@mui/material";
import {
  People as PeopleIcon,
  Event as EventIcon,
  Groups as GroupsIcon,
  SportsSoccer as SportsIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";

interface LeagueOverviewCardProps {
  league: {
    id: string;
    name: string;
    sport: string;
    _count: {
      teams: number;
      players: number;
      events: number;
      divisions: number;
    };
  };
  userRole: 'LEAGUE_ADMIN' | 'TEAM_ADMIN' | 'MEMBER';
  recentActivity?: {
    description: string;
    timestamp: Date;
  };
}

export default function LeagueOverviewCard({
  league,
  userRole,
  recentActivity
}: LeagueOverviewCardProps) {
  const router = useRouter();

  const handleViewLeague = () => {
    router.push(`/league/${league.id}`);
  };

  const handleManageLeague = () => {
    router.push(`/league/${league.id}/teams`);
  };

  const getLeagueInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'LEAGUE_ADMIN':
        return 'primary';
      case 'TEAM_ADMIN':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'LEAGUE_ADMIN':
        return 'League Admin';
      case 'TEAM_ADMIN':
        return 'Team Admin';
      default:
        return 'Member';
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-2px)',
        }
      }}
    >
      <CardContent>
        {/* League Header */}
        <Box display="flex" alignItems="flex-start" gap={2} mb={2}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: 'primary.main',
              fontSize: '1.1rem',
              fontWeight: 'bold'
            }}
          >
            {getLeagueInitials(league.name)}
          </Avatar>
          <Box flex={1}>
            <Typography variant="h6" component="h3" gutterBottom>
              {league.name}
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Chip
                icon={<SportsIcon />}
                label={league.sport}
                size="small"
                variant="outlined"
              />
              <Chip
                label={getRoleLabel(userRole)}
                size="small"
                color={getRoleColor(userRole) as 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'}
              />
            </Box>
          </Box>
        </Box>

        {/* League Stats */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 2,
            mb: 2
          }}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <GroupsIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {league._count.teams} teams
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <PeopleIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {league._count.players} players
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <EventIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {league._count.events} events
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <GroupsIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {league._count.divisions} divisions
            </Typography>
          </Box>
        </Box>

        {/* Recent Activity */}
        {recentActivity && (
          <Box
            sx={{
              p: 1.5,
              bgcolor: 'grey.50',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'grey.200'
            }}
          >
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Recent Activity
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
              {recentActivity.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }).format(recentActivity.timestamp)}
            </Typography>
          </Box>
        )}
      </CardContent>

      <CardActions sx={{ pt: 0 }}>
        <Button size="small" onClick={handleViewLeague}>
          View League
        </Button>
        {(userRole === 'LEAGUE_ADMIN' || userRole === 'TEAM_ADMIN') && (
          <Button size="small" onClick={handleManageLeague}>
            Manage
          </Button>
        )}
      </CardActions>
    </Card>
  );
}