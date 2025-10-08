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
  SportsSoccer as SportsIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";

type TeamCardProps = {
  team: {
    id: string;
    name: string;
    sport: string;
    season: string;
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

export default function TeamCard({ 
  team, 
  role, 
  showLeagueInfo = false,
  showStats = false 
}: TeamCardProps) {
  const router = useRouter();

  const handleViewTeam = () => {
    router.push(`/team/${team.id}`);
  };

  const handleManageTeam = () => {
    router.push(`/team/${team.id}/roster`);
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
    <Card 
      sx={{ 
        height: '100%',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          boxShadow: 3,
          transform: 'translateY(-2px)',
        }
      }}
    >
      <CardContent>
        {/* Team Header */}
        <Box display="flex" alignItems="flex-start" gap={2} mb={2}>
          <Avatar 
            sx={{ 
              width: 40, 
              height: 40, 
              bgcolor: 'primary.main',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}
          >
            {getTeamInitials(team.name)}
          </Avatar>
          <Box flex={1}>
            <Typography variant="h6" component="h3" gutterBottom>
              {team.name}
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Chip 
                icon={<SportsIcon />}
                label={team.sport} 
                size="small" 
                variant="outlined" 
              />
              <Typography variant="body2" color="text.secondary">
                {team.season}
              </Typography>
            </Box>
          </Box>
        </Box>
        
        {/* League and Division Info - Only shown in league mode */}
        {showLeagueInfo && (team.league || team.division) && (
          <Box sx={{ mb: 2 }}>
            {team.league && (
              <Chip 
                label={team.league.name} 
                size="small" 
                variant="outlined"
                color="primary"
                sx={{ mr: 1, mb: 0.5 }}
              />
            )}
            {team.division && (
              <Chip 
                label={`Division: ${team.division.name}`} 
                size="small" 
                variant="outlined"
                color="secondary"
                sx={{ mb: 0.5 }}
              />
            )}
          </Box>
        )}

        {/* Team Stats */}
        {showStats && team._count && (
          <Box 
            sx={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 2,
              mb: 2
            }}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <PeopleIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {team._count.players} players
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <EventIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {team._count.events} events
              </Typography>
            </Box>
          </Box>
        )}

        {/* Role Badge */}
        <Chip
          label={role === "ADMIN" ? "Team Admin" : "Member"}
          size="small"
          color={role === "ADMIN" ? "primary" : "default"}
        />
      </CardContent>

      <CardActions sx={{ pt: 0 }}>
        <Button size="small" onClick={handleViewTeam}>
          View Team
        </Button>
        {role === "ADMIN" && (
          <Button size="small" onClick={handleManageTeam}>
            Manage
          </Button>
        )}
      </CardActions>
    </Card>
  );
}
