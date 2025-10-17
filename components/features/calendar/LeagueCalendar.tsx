"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Chip,
  Button,
  Divider,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Download, CalendarMonth } from "@mui/icons-material";
import EventCard from "./EventCard";
import type { LeagueEvent, TeamWithDivision, Division } from "@/types/events";

interface LeagueCalendarProps {
  events: LeagueEvent[];
  teams: TeamWithDivision[];
  divisions: Division[];
  leagueId: string;
  leagueName: string;
}

type EventTypeFilter = "ALL" | "GAME" | "PRACTICE";
type TimeFilter = "ALL" | "UPCOMING" | "PAST";

export default function LeagueCalendar({
  events,
  teams,
  divisions,
  leagueId,
  leagueName,
}: LeagueCalendarProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("UPCOMING");

  const handleTeamFilterChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value;
    setSelectedTeams(typeof value === 'string' ? value.split(',') : value);
  };

  const handleDivisionFilterChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value;
    setSelectedDivisions(typeof value === 'string' ? value.split(',') : value);
  };

  const handleEventTypeChange = (e: SelectChangeEvent<EventTypeFilter>) => {
    setEventTypeFilter(e.target.value as EventTypeFilter);
  };

  const handleTimeFilterChange = (e: SelectChangeEvent<TimeFilter>) => {
    setTimeFilter(e.target.value as TimeFilter);
  };

  const clearFilters = () => {
    setSelectedTeams([]);
    setSelectedDivisions([]);
    setEventTypeFilter("ALL");
    setTimeFilter("UPCOMING");
  };

  const filteredEvents = useMemo(() => {
    const now = new Date();

    // Create a Map for O(1) team lookups by ID
    const teamMap = new Map(teams.map(t => [t.id, t]));

    return events.filter(event => {
      const eventDate = new Date(event.startAt);

      // Time filter
      if (timeFilter === "UPCOMING" && eventDate < now) return false;
      if (timeFilter === "PAST" && eventDate >= now) return false;

      // Event type filter
      if (eventTypeFilter !== "ALL" && event.type !== eventTypeFilter) return false;

      // Team filter
      if (selectedTeams.length > 0) {
        const isTeamInvolved = selectedTeams.includes(event.team.id) ||
          (event.homeTeam && selectedTeams.includes(event.homeTeam.id)) ||
          (event.awayTeam && selectedTeams.includes(event.awayTeam.id));
        if (!isTeamInvolved) return false;
      }

      // Division filter with O(1) Map lookups
      if (selectedDivisions.length > 0) {
        const team = teamMap.get(event.team.id);
        const homeTeam = event.homeTeam ? teamMap.get(event.homeTeam?.id) : null;
        const awayTeam = event.awayTeam ? teamMap.get(event.awayTeam?.id) : null;

        const isDivisionInvolved =
          (team?.division && selectedDivisions.includes(team.division.id)) ||
          (homeTeam?.division && selectedDivisions.includes(homeTeam.division.id)) ||
          (awayTeam?.division && selectedDivisions.includes(awayTeam.division.id));

        if (!isDivisionInvolved) return false;
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.startAt);
      const dateB = new Date(b.startAt);
      return timeFilter === "PAST" ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
    });
  }, [events, selectedTeams, selectedDivisions, eventTypeFilter, timeFilter, teams]);

  const handleExportCalendar = () => {
    // Generate iCal format
    const icalEvents = filteredEvents.map(event => {
      const startDate = new Date(event.startAt);
      const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // Assume 2 hour duration

      const formatDate = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };

      // Build description and summary with inter-team game support
      let description = '';
      let summary = event.title;
      if (event.homeTeam && event.awayTeam) {
        const home = teams.find(t => t.id === event.homeTeam?.id);
        const away = teams.find(t => t.id === event.awayTeam?.id);
        if (home && away) {
          description = `${home.name} vs ${away.name}`;
          summary = `${home.name} vs ${away.name}`;
        } else if (event.opponent) {
          description = `vs ${event.opponent}`;
        }
      } else if (event.opponent) {
        description = `vs ${event.opponent}`;
      }

      return [
        'BEGIN:VEVENT',
        `UID:${event.id}@openleague.app`,
        `DTSTART:${formatDate(startDate)}`,
        `DTEND:${formatDate(endDate)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${event.location}`,
        'END:VEVENT'
      ].join('\n');
    }).join('\n');

    const icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OpenLeague//League Calendar//EN',
      `X-WR-CALNAME:${leagueName} Schedule`,
      icalEvents,
      'END:VCALENDAR'
    ].join('\n');

    const blob = new Blob([icalContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${leagueName.replace(/\s+/g, '_')}_schedule.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getTeamDisplayName = (team: TeamWithDivision) => {
    return team.division ? `${team.name} (${team.division.name})` : team.name;
  };

  const activeFiltersCount =
    selectedTeams.length +
    selectedDivisions.length +
    (eventTypeFilter !== "ALL" ? 1 : 0) +
    (timeFilter !== "UPCOMING" ? 1 : 0);

  return (
    <Box>
      <Box sx={{
        mb: { xs: 2, sm: 3 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: { xs: 1, sm: 2 }
      }}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' } }}
          >
            League Schedule
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
          >
            {leagueName} • {filteredEvents.length} events
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<Download sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
          onClick={handleExportCalendar}
          disabled={filteredEvents.length === 0}
          size="small"
          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
        >
          Export
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{
        mb: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: isDesktop ? 'row' : 'column',
        gap: { xs: 1, sm: 2 },
        alignItems: isDesktop ? 'center' : 'stretch'
      }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Time</InputLabel>
          <Select
            value={timeFilter}
            onChange={handleTimeFilterChange}
            label="Time"
          >
            <MenuItem value="ALL">All Events</MenuItem>
            <MenuItem value="UPCOMING">Upcoming</MenuItem>
            <MenuItem value="PAST">Past</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Event Type</InputLabel>
          <Select
            value={eventTypeFilter}
            onChange={handleEventTypeChange}
            label="Event Type"
          >
            <MenuItem value="ALL">All Types</MenuItem>
            <MenuItem value="GAME">Games</MenuItem>
            <MenuItem value="PRACTICE">Practices</MenuItem>
          </Select>
        </FormControl>

        {divisions.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Divisions</InputLabel>
            <Select
              multiple
              value={selectedDivisions}
              onChange={handleDivisionFilterChange}
              label="Divisions"
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const division = divisions.find(d => d.id === value);
                    return (
                      <Chip key={value} label={division?.name} size="small" />
                    );
                  })}
                </Box>
              )}
            >
              {divisions.map((division) => (
                <MenuItem key={division.id} value={division.id}>
                  {division.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Teams</InputLabel>
          <Select
            multiple
            value={selectedTeams}
            onChange={handleTeamFilterChange}
            label="Teams"
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => {
                  const team = teams.find(t => t.id === value);
                  return (
                    <Chip key={value} label={team?.name} size="small" />
                  );
                })}
              </Box>
            )}
          >
            {teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {getTeamDisplayName(team)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {activeFiltersCount > 0 && (
          <Button
            variant="text"
            size="small"
            onClick={clearFilters}
            sx={{
              whiteSpace: 'nowrap',
              fontSize: { xs: '0.75rem', sm: '0.875rem' }
            }}
          >
            Clear Filters ({activeFiltersCount})
          </Button>
        )}
      </Box>

      <Divider sx={{ mb: { xs: 2, sm: 3 } }} />

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <Box sx={{ py: { xs: 4, sm: 8 }, textAlign: "center" }}>
          <CalendarMonth sx={{ fontSize: { xs: 48, sm: 64 }, color: 'text.disabled', mb: 2 }} />
          <Typography
            variant="h6"
            color="text.secondary"
            gutterBottom
            sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
          >
            No events found
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
          >
            {activeFiltersCount > 0
              ? "Try adjusting your filters to see more events"
              : "No events have been scheduled yet"
            }
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: isDesktop ? "grid" : "flex",
            flexDirection: isDesktop ? undefined : "column",
            gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(320px, 1fr))" : undefined,
            gap: { xs: 1.5, sm: 2 },
          }}
        >
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              id={event.id}
              type={event.type}
              title={event.title}
              startAt={event.startAt}
              location={event.location}
              opponent={event.opponent}
              leagueId={leagueId}
              homeTeam={event.homeTeam}
              awayTeam={event.awayTeam}
              teamName={event.team.name}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}