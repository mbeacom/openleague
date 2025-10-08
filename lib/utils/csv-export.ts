/**
 * Utility functions for exporting data to CSV format
 */

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV<T extends Record<string, unknown>>(
  data: T[],
  headers: Array<{ key: keyof T; label: string }>
): string {
  // Create header row
  const headerRow = headers.map(h => h.label).join(',');

  // Create data rows
  const dataRows = data.map(row => {
    return headers.map(header => {
      const value = row[header.key];

      // Handle different value types
      if (value === null || value === undefined) {
        return '';
      }

      // Convert to string and escape
      let stringValue = String(value);

      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        stringValue = `"${stringValue.replace(/"/g, '""')}"`;
      }

      return stringValue;
    }).join(',');
  });

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Download CSV file
 */
function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    // Create download link
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export league teams data to CSV
 */
export function exportLeagueTeamsToCSV(
  teams: Array<{
    name: string;
    sport: string;
    season: string;
    divisionName?: string;
    playerCount: number;
    eventCount: number;
    createdAt: Date | string;
  }>,
  leagueName: string
): void {
  const headers = [
    { key: 'name' as const, label: 'Team Name' },
    { key: 'sport' as const, label: 'Sport' },
    { key: 'season' as const, label: 'Season' },
    { key: 'divisionName' as const, label: 'Division' },
    { key: 'playerCount' as const, label: 'Players' },
    { key: 'eventCount' as const, label: 'Events' },
    { key: 'createdAt' as const, label: 'Created Date' },
  ];

  const csvData = teams.map(team => ({
    ...team,
    divisionName: team.divisionName || 'Unassigned',
    createdAt: new Date(team.createdAt).toLocaleDateString(),
  }));

  const csv = arrayToCSV(csvData, headers);
  const filename = `${leagueName.replace(/[^a-z0-9]/gi, '_')}_teams_${new Date().toISOString().split('T')[0]}.csv`;

  downloadCSV(csv, filename);
}

/**
 * Export league roster to CSV
 */
export function exportLeagueRosterToCSV(
  players: Array<{
    name: string;
    email: string | null;
    phone: string | null;
    teamName: string;
    divisionName?: string;
    position?: string;
    jerseyNumber?: string;
    joinedAt: Date | string;
  }>,
  leagueName: string
): void {
  const headers = [
    { key: 'name' as const, label: 'Player Name' },
    { key: 'teamName' as const, label: 'Team' },
    { key: 'divisionName' as const, label: 'Division' },
    { key: 'position' as const, label: 'Position' },
    { key: 'jerseyNumber' as const, label: 'Jersey #' },
    { key: 'email' as const, label: 'Email' },
    { key: 'phone' as const, label: 'Phone' },
    { key: 'joinedAt' as const, label: 'Joined Date' },
  ];

  const csvData = players.map(player => ({
    ...player,
    divisionName: player.divisionName || 'N/A',
    position: player.position || 'N/A',
    jerseyNumber: player.jerseyNumber || 'N/A',
    email: player.email || 'N/A',
    phone: player.phone || 'N/A',
    joinedAt: new Date(player.joinedAt).toLocaleDateString(),
  }));

  const csv = arrayToCSV(csvData, headers);
  const filename = `${leagueName.replace(/[^a-z0-9]/gi, '_')}_roster_${new Date().toISOString().split('T')[0]}.csv`;

  downloadCSV(csv, filename);
}

/**
 * Export league schedule to CSV
 */
export function exportLeagueScheduleToCSV(
  events: Array<{
    title: string;
    type: string;
    startAt: Date | string;
    location: string;
    homeTeam?: string;
    awayTeam?: string;
    teamName?: string;
  }>,
  leagueName: string
): void {
  const headers = [
    { key: 'title' as const, label: 'Event' },
    { key: 'type' as const, label: 'Type' },
    { key: 'startAt' as const, label: 'Date & Time' },
    { key: 'location' as const, label: 'Location' },
    { key: 'homeTeam' as const, label: 'Home Team' },
    { key: 'awayTeam' as const, label: 'Away Team' },
    { key: 'teamName' as const, label: 'Team' },
  ];

  const csvData = events.map(event => ({
    ...event,
    startAt: new Date(event.startAt).toLocaleString(),
    homeTeam: event.homeTeam || 'N/A',
    awayTeam: event.awayTeam || 'N/A',
    teamName: event.teamName || 'N/A',
  }));

  const csv = arrayToCSV(csvData, headers);
  const filename = `${leagueName.replace(/[^a-z0-9]/gi, '_')}_schedule_${new Date().toISOString().split('T')[0]}.csv`;

  downloadCSV(csv, filename);
}

/**
 * Export divisions summary to CSV
 */
export function exportDivisionsToCSV(
  divisions: Array<{
    name: string;
    ageGroup: string | null;
    skillLevel: string | null;
    teamCount: number;
    playerCount?: number;
  }>,
  leagueName: string
): void {
  const headers = [
    { key: 'name' as const, label: 'Division Name' },
    { key: 'ageGroup' as const, label: 'Age Group' },
    { key: 'skillLevel' as const, label: 'Skill Level' },
    { key: 'teamCount' as const, label: 'Teams' },
    { key: 'playerCount' as const, label: 'Players' },
  ];

  const csvData = divisions.map(division => ({
    ...division,
    ageGroup: division.ageGroup || 'N/A',
    skillLevel: division.skillLevel || 'N/A',
    playerCount: division.playerCount || 0,
  }));

  const csv = arrayToCSV(csvData, headers);
  const filename = `${leagueName.replace(/[^a-z0-9]/gi, '_')}_divisions_${new Date().toISOString().split('T')[0]}.csv`;

  downloadCSV(csv, filename);
}
