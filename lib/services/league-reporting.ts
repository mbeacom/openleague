/**
 * League Reporting Service
 * Provides export functionality for league data
 */

import { prisma } from "@/lib/db/prisma";
import { format } from "date-fns";

/**
 * Generate CSV content for league roster
 */
export async function generateLeagueRosterCSV(leagueId: string): Promise<string> {
    const players = await prisma.player.findMany({
        where: { leagueId },
        include: {
            team: {
                select: {
                    name: true,
                    division: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
        orderBy: [
            { team: { name: 'asc' } },
            { name: 'asc' },
        ],
    });

    // CSV Header
    const headers = [
        'Player Name',
        'Email',
        'Phone',
        'Team',
        'Division',
        'Emergency Contact Name',
        'Emergency Contact Phone',
        'Date Added',
    ];

    // CSV Rows
    const rows = players.map(player => [
        player.name,
        player.email || '',
        player.phone || '',
        player.team.name,
        player.team.division?.name || 'Unassigned',
        player.emergencyContact || '',
        player.emergencyPhone || '',
        format(player.createdAt, 'yyyy-MM-dd'),
    ]);

    // Combine headers and rows with proper CSV escaping
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
}

/**
 * Generate CSV content for league schedule
 */
export async function generateLeagueScheduleCSV(leagueId: string): Promise<string> {
    const events = await prisma.event.findMany({
        where: { leagueId },
        include: {
            team: {
                select: {
                    name: true,
                    division: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
            homeTeam: {
                select: {
                    name: true,
                },
            },
            awayTeam: {
                select: {
                    name: true,
                },
            },
        },
        orderBy: { startAt: 'asc' },
    });

    // CSV Header
    const headers = [
        'Date',
        'Time',
        'Event Type',
        'Title',
        'Team',
        'Division',
        'Home Team',
        'Away Team',
        'Location',
        'Opponent',
        'Notes',
    ];

    // CSV Rows
    const rows = events.map(event => [
        format(event.startAt, 'yyyy-MM-dd'),
        format(event.startAt, 'HH:mm'),
        event.type,
        event.title,
        event.team.name,
        event.team.division?.name || 'Unassigned',
        event.homeTeam?.name || '',
        event.awayTeam?.name || '',
        event.location,
        event.opponent || '',
        event.notes || '',
    ]);

    // Combine headers and rows with proper CSV escaping
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
}

/**
 * Generate CSV content for attendance report by division
 */
export async function generateAttendanceReportByDivisionCSV(leagueId: string): Promise<string> {
    const divisions = await prisma.division.findMany({
        where: { leagueId, isActive: true },
        include: {
            teams: {
                where: { isActive: true },
                include: {
                    events: {
                        include: {
                            rsvps: {
                                select: {
                                    status: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    // CSV Header
    const headers = [
        'Division',
        'Team',
        'Total Events',
        'Total RSVPs',
        'Going',
        'Not Going',
        'Maybe',
        'No Response',
        'Attendance Rate (%)',
    ];

    // CSV Rows
    const rows: string[][] = [];

    divisions.forEach(division => {
        division.teams.forEach(team => {
            const totalEvents = team.events.length;
            const allRSVPs = team.events.flatMap(e => e.rsvps);
            const totalRSVPs = allRSVPs.length;
            const goingCount = allRSVPs.filter(r => r.status === 'GOING').length;
            const notGoingCount = allRSVPs.filter(r => r.status === 'NOT_GOING').length;
            const maybeCount = allRSVPs.filter(r => r.status === 'MAYBE').length;
            const noResponseCount = allRSVPs.filter(r => r.status === 'NO_RESPONSE').length;
            const attendanceRate = totalRSVPs > 0
                ? ((goingCount / totalRSVPs) * 100).toFixed(1)
                : '0.0';

            rows.push([
                division.name,
                team.name,
                totalEvents.toString(),
                totalRSVPs.toString(),
                goingCount.toString(),
                notGoingCount.toString(),
                maybeCount.toString(),
                noResponseCount.toString(),
                attendanceRate,
            ]);
        });
    });

    // Combine headers and rows with proper CSV escaping
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
}

/**
 * Generate CSV content for financial report (basic)
 * Note: MVP version provides basic player count summaries.
 * Future versions will integrate with payment/registration systems.
 */
export async function generateFinancialReportCSV(leagueId: string): Promise<string> {
    const league = await prisma.league.findUnique({
        where: { id: leagueId },
        include: {
            teams: {
                where: { isActive: true },
                include: {
                    _count: {
                        select: {
                            players: true,
                        },
                    },
                },
            },
        },
    });

    if (!league) {
        throw new Error('League not found');
    }

    // CSV Header
    const headers = [
        'Team Name',
        'Total Players',
        'Notes',
    ];

    // CSV Rows - Basic structure for MVP
    const rows = league.teams.map(team => [
        team.name,
        team._count.players.toString(),
        'Payment tracking not yet implemented',
    ]);

    // Add summary row
    const totalPlayers = league.teams.reduce((sum, team) => sum + team._count.players, 0);
    rows.push([
        'TOTAL',
        totalPlayers.toString(),
        '',
    ]);

    // Combine headers and rows with proper CSV escaping
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
}

/**
 * Get report metadata for a league
 */
export async function getReportMetadata(leagueId: string) {
    const [league, teamCount, playerCount, eventCount] = await Promise.all([
        prisma.league.findUnique({
            where: { id: leagueId },
            select: {
                name: true,
                sport: true,
            },
        }),
        prisma.team.count({
            where: { leagueId, isActive: true },
        }),
        prisma.player.count({
            where: { leagueId },
        }),
        prisma.event.count({
            where: { leagueId },
        }),
    ]);

    return {
        leagueName: league?.name || 'Unknown League',
        sport: league?.sport || 'Unknown',
        teamCount,
        playerCount,
        eventCount,
        generatedAt: new Date(),
    };
}
