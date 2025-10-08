"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Grid,
  Chip,
  Paper,
  InputAdornment,
  Alert,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import FilterListIcon from "@mui/icons-material/FilterList";
import LeaguePlayerCard from "./LeaguePlayerCard";
import { exportLeagueRoster } from "@/lib/actions/roster";
import { useToast } from "@/components/ui/Toast";

interface Player {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  team: {
    id: string;
    name: string;
    division: {
      id: string;
      name: string;
      ageGroup: string | null;
      skillLevel: string | null;
    } | null;
  };
  user: {
    id: string;
    email: string;
  } | null;
}

interface Team {
  id: string;
  name: string;
  divisionId: string | null;
}

interface Division {
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
}

interface LeagueRosterViewProps {
  players: Player[];
  teams: Team[];
  divisions: Division[];
  leagueId: string;
  isLeagueAdmin: boolean;
}

export default function LeagueRosterView({
  players,
  teams,
  divisions,
  leagueId,
  isLeagueAdmin,
}: LeagueRosterViewProps) {
  const { showError, showSuccess } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedDivision, setSelectedDivision] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filter and search players
  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      // Search filter
      const matchesSearch = searchTerm === "" ||
        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.team.name.toLowerCase().includes(searchTerm.toLowerCase());

      // Team filter
      const matchesTeam = selectedTeam === "all" || player.team.id === selectedTeam;

      // Division filter
      const matchesDivision = selectedDivision === "all" ||
        player.team.division?.id === selectedDivision;

      return matchesSearch && matchesTeam && matchesDivision;
    });
  }, [players, searchTerm, selectedTeam, selectedDivision]);

  // Group players by team for display
  const playersByTeam = useMemo(() => {
    const grouped = filteredPlayers.reduce((acc, player) => {
      const teamId = player.team.id;
      if (!acc[teamId]) {
        acc[teamId] = {
          team: player.team,
          players: [],
        };
      }
      acc[teamId].players.push(player);
      return acc;
    }, {} as Record<string, { team: Player['team']; players: Player[] }>);

    // Sort teams by name
    return Object.values(grouped).sort((a, b) => a.team.name.localeCompare(b.team.name));
  }, [filteredPlayers]);

  const handleExport = async () => {
    if (!isLeagueAdmin) return;

    setIsExporting(true);
    try {
      const result = await exportLeagueRoster(leagueId);
      if (result.error) {
        showError(result.error);
      } else if (result.data) {
        // Create and download CSV file
        const blob = new Blob([result.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `league-roster-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showSuccess('Roster exported successfully');
      }
    } catch {
      showError('Failed to export roster. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedTeam("all");
    setSelectedDivision("all");
  };

  const hasActiveFilters = searchTerm !== "" || selectedTeam !== "all" || selectedDivision !== "all";

  return (
    <Box>
      {/* Search and Filter Controls */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField
            placeholder="Search players, emails, or teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1, minWidth: 300 }}
          />

          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
          </Button>

          {isLeagueAdmin && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          )}
        </Box>

        {/* Filter Controls */}
        {showFilters && (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Team</InputLabel>
              <Select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                label="Team"
              >
                <MenuItem value="all">All Teams</MenuItem>
                {teams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Division</InputLabel>
              <Select
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                label="Division"
              >
                <MenuItem value="all">All Divisions</MenuItem>
                {divisions.map((division) => (
                  <MenuItem key={division.id} value={division.id}>
                    {division.name}
                    {division.ageGroup && ` (${division.ageGroup})`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {hasActiveFilters && (
              <Button variant="text" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </Box>
        )}

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
            {searchTerm && (
              <Chip
                label={`Search: "${searchTerm}"`}
                onDelete={() => setSearchTerm("")}
                size="small"
              />
            )}
            {selectedTeam !== "all" && (
              <Chip
                label={`Team: ${teams.find(t => t.id === selectedTeam)?.name}`}
                onDelete={() => setSelectedTeam("all")}
                size="small"
              />
            )}
            {selectedDivision !== "all" && (
              <Chip
                label={`Division: ${divisions.find(d => d.id === selectedDivision)?.name}`}
                onDelete={() => setSelectedDivision("all")}
                size="small"
              />
            )}
          </Box>
        )}
      </Paper>

      {/* Results Summary */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {filteredPlayers.length} Player{filteredPlayers.length !== 1 ? 's' : ''}
          {hasActiveFilters && ` (filtered from ${players.length} total)`}
        </Typography>
      </Box>

      {/* Players by Team */}
      {playersByTeam.length === 0 ? (
        <Alert severity="info">
          No players found matching your search criteria.
        </Alert>
      ) : (
        playersByTeam.map(({ team, players: teamPlayers }) => (
          <Box key={team.id} sx={{ mb: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Typography variant="h5" component="h2">
                {team.name}
              </Typography>
              {team.division && (
                <Chip
                  label={`${team.division.name}${team.division.ageGroup ? ` (${team.division.ageGroup})` : ''}`}
                  variant="outlined"
                  size="small"
                />
              )}
              <Chip
                label={`${teamPlayers.length} player${teamPlayers.length !== 1 ? 's' : ''}`}
                size="small"
                color="primary"
              />
            </Box>

            <Grid container spacing={2}>
              {teamPlayers.map((player) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={player.id}>
                  <LeaguePlayerCard
                    player={player}
                    isLeagueAdmin={isLeagueAdmin}
                    leagueId={leagueId}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))
      )}
    </Box>
  );
}