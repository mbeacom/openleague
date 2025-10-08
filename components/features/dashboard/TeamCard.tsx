import { Card, CardContent, Typography, Chip, Box } from "@mui/material";

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
  };
  role: string;
  showLeagueInfo?: boolean;
};

export default function TeamCard({ team, role, showLeagueInfo = false }: TeamCardProps) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h3" gutterBottom>
          {team.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom={showLeagueInfo}>
          {team.sport} • {team.season}
        </Typography>
        
        {/* League and Division Info - Only shown in league mode */}
        {showLeagueInfo && (team.league || team.division) && (
          <Box sx={{ mb: 1 }}>
            {team.league && (
              <Chip 
                label={team.league.name} 
                size="small" 
                variant="outlined"
                sx={{ mr: 1, mb: 0.5 }}
              />
            )}
            {team.division && (
              <Chip 
                label={team.division.name} 
                size="small" 
                variant="outlined"
                sx={{ mb: 0.5 }}
              />
            )}
          </Box>
        )}

        <Chip
          label={role}
          size="small"
          color={role === "ADMIN" ? "primary" : "default"}
          sx={{ mt: showLeagueInfo ? 0 : 1 }}
        />
      </CardContent>
    </Card>
  );
}
