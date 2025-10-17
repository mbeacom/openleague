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
import type { PlayerWithTeam, TeamWithDivision, Division } from "@/types/roster";

interface LeagueRosterViewProps {
  players: PlayerWithTeam[];
  teams: TeamWithDivision[];
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
    }, {} as Record<string, { team: PlayerWithTeam['team']; players: PlayerWithTeam[] }>);

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
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 3 } }}>
        <Box sx={{
          display: "flex",
          gap: { xs: 1, sm: 2 },
          mb: 2,
          flexWrap: "wrap",
          alignItems: "center",
          flexDirection: { xs: 'column', sm: 'row' }
        }}>
          <TextField
            placeholder="Search players, emails, or teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 300 } }}
          />

          <Button
            variant="outlined"
            startIcon={<FilterListIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
            onClick={() => setShowFilters(!showFilters)}
            size="small"
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Filters
          </Button>

          {isLeagueAdmin && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              onClick={handleExport}
              disabled={isExporting}
              size="small"
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          )}
        </Box>

        {/* Filter Controls */}
        {showFilters && (
          <Box sx={{
            display: "flex",
            gap: { xs: 1, sm: 2 },
            flexWrap: "wrap",
            alignItems: "center",
            flexDirection: { xs: 'column', sm: 'row' }
          }}>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
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

            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
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
              <Button
                variant="text"
                onClick={clearFilters}
                size="small"
                sx={{
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  width: { xs: '100%', sm: 'auto' }
                }}
              >
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
      <Box sx={{ mb: { xs: 2, sm: 3 } }}>
        <Typography
          variant="h6"
          gutterBottom
          sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
        >
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
          <Box key={team.id} sx={{ mb: { xs: 3, sm: 4 } }}>
            <Box sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1, sm: 2 },
              mb: 2,
              flexWrap: 'wrap'
            }}>
              <Typography
                variant="h5"
                component="h2"
                sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}
              >
                {team.name}
              </Typography>
              {team.division && (
                <Chip
                  label={`${team.division.name}${team.division.ageGroup ? ` (${team.division.ageGroup})` : ''}`}
                  variant="outlined"
                  size="small"
                  sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                />
              )}
              <Chip
                label={`${teamPlayers.length} player${teamPlayers.length !== 1 ? 's' : ''}`}
                size="small"
                color="primary"
                sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
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