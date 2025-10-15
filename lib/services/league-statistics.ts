/**
 * League Statistics Service
 * Provides analytics and reporting for league-wide data
 */

import { prisma } from "@/lib/db/prisma";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export interface LeagueStatistics {
    overview: {
        totalTeams: number;
        totalPlayers: number;
        totalEvents: number;
        upcomingEvents: number;
        activeDivisions: number;
    };
    participation: {
        totalRSVPs: number;
        goingCount: number;
        notGoingCount: number;
        maybeCount: number;
        noResponseCount: number;
        participationRate: number;
    };
    attendance: {
        byTeam: Array<{
            teamId: string;
            teamName: string;
            totalEvents: number;
            averageAttendance: number;
            goingRate: number;
        }>;
        byDivision: Array<{
            divisionId: string;
            divisionName: string;
            totalEvents: number;
            averageAttendance: number;
            goingRate: number;
        }>;
        overall: {
            totalEvents: number;
            averageAttendance: number;
            goingRate: number;
        };
    };
    trends: {
        monthlyActivity: Array<{
            month: string;
            teamsCreated: number;
            playersAdded: number;
            eventsScheduled: number;
        }>;
        participationTrend: Array<{
            month: string;
            participationRate: number;
            totalRSVPs: number;
        }>;
    };
}

/**
 * Get comprehensive league statistics
 */
export async function getLeagueStatistics(leagueId: string): Promise<LeagueStatistics> {
    const [overview, participation, attendance, trends] = await Promise.all([
        getLeagueOverview(leagueId),
        getParticipationStats(leagueId),
        getAttendanceStats(leagueId),
        getTrendAnalysis(leagueId),
    ]);

    return {
        overview,
        participation,
        attendance,
        trends,
    };
}

/**
 * Get basic league overview statistics
 */
async function getLeagueOverview(leagueId: string) {
    const [
        totalTeams,
        totalPlayers,
        totalEvents,
        upcomingEvents,
        activeDivisions,
    ] = await Promise.all([
        prisma.team.count({
            where: { leagueId, isActive: true },
        }),
        prisma.player.count({
            where: { leagueId },
        }),
        prisma.event.count({
            where: { leagueId },
        }),
        prisma.event.count({
            where: {
                leagueId,
                startAt: { gte: new Date() },
            },
        }),
        prisma.division.count({
            where: { leagueId, isActive: true },
        }),
    ]);

    return {
        totalTeams,
        totalPlayers,
        totalEvents,
        upcomingEvents,
        activeDivisions,
    };
}

/**
 * Get participation statistics across all teams
 */
async function getParticipationStats(leagueId: string) {
    // Get all RSVPs for events in this league
    const rsvps = await prisma.rSVP.findMany({
        where: {
            event: {
                leagueId,
            },
        },
        select: {
            status: true,
        },
    });

    const totalRSVPs = rsvps.length;
    const { goingCount, notGoingCount, maybeCount, noResponseCount } = rsvps.reduce(
        (acc, r: { status: string }) => {
            switch (r.status) {
                case 'GOING':
                    acc.goingCount += 1;
                    break;
                case 'NOT_GOING':
                    acc.notGoingCount += 1;
                    break;
                case 'MAYBE':
                    acc.maybeCount += 1;
                    break;
                case 'NO_RESPONSE':
                    acc.noResponseCount += 1;
                    break;
            }
            return acc;
        },
        { goingCount: 0, notGoingCount: 0, maybeCount: 0, noResponseCount: 0 }
    );

    // Calculate participation rate (going + maybe / total)
    const participationRate = totalRSVPs > 0
        ? ((goingCount + maybeCount) / totalRSVPs) * 100
        : 0;

    return {
        totalRSVPs,
        goingCount,
        notGoingCount,
        maybeCount,
        noResponseCount,
        participationRate: Math.round(participationRate * 10) / 10, // Round to 1 decimal
    };
}

/**
 * Get attendance analytics aggregated by team and division
 */
async function getAttendanceStats(leagueId: string) {
    // Get attendance by team
    const teams = await prisma.team.findMany({
        where: { leagueId, isActive: true },
        select: {
            id: true,
            name: true,
            divisionId: true,
            events: {
                select: {
                    id: true,
                    rsvps: {
                        select: {
                            status: true,
                        },
                    },
                },
            },
        },
    });

    const byTeam = teams.map(team => {
        const totalEvents = team.events.length;
        const allRSVPs = team.events.flatMap(e => e.rsvps);
        const goingRSVPs = allRSVPs.filter(r => r.status === 'GOING').length;
        const totalRSVPs = allRSVPs.length;

        return {
            teamId: team.id,
            teamName: team.name,
            totalEvents,
            averageAttendance: totalEvents > 0 ? Math.round((goingRSVPs / totalEvents) * 10) / 10 : 0,
            goingRate: totalRSVPs > 0 ? Math.round((goingRSVPs / totalRSVPs) * 1000) / 10 : 0,
        };
    });

    // Get attendance by division
    const divisions = await prisma.division.findMany({
        where: { leagueId, isActive: true },
        select: {
            id: true,
            name: true,
            teams: {
                where: { isActive: true },
                select: {
                    events: {
                        select: {
                            id: true,
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
    });

    const byDivision = divisions.map(division => {
        const allEvents = division.teams.flatMap(t => t.events);
        const totalEvents = allEvents.length;
        const allRSVPs = allEvents.flatMap(e => e.rsvps);
        const goingRSVPs = allRSVPs.filter(r => r.status === 'GOING').length;
        const totalRSVPs = allRSVPs.length;

        return {
            divisionId: division.id,
            divisionName: division.name,
            totalEvents,
            averageAttendance: totalEvents > 0 ? Math.round((goingRSVPs / totalEvents) * 10) / 10 : 0,
            goingRate: totalRSVPs > 0 ? Math.round((goingRSVPs / totalRSVPs) * 1000) / 10 : 0,
        };
    });

    // Calculate overall attendance
    const allEvents = teams.flatMap(t => t.events);
    const totalEvents = allEvents.length;
    const allRSVPs = allEvents.flatMap(e => e.rsvps);
    const goingRSVPs = allRSVPs.filter(r => r.status === 'GOING').length;
    const totalRSVPs = allRSVPs.length;

    const overall = {
        totalEvents,
        averageAttendance: totalEvents > 0 ? Math.round((goingRSVPs / totalEvents) * 10) / 10 : 0,
        goingRate: totalRSVPs > 0 ? Math.round((goingRSVPs / totalRSVPs) * 1000) / 10 : 0,
    };

    return {
        byTeam,
        byDivision,
        overall,
    };
}

/**
 * Get trend analysis for league activity over the last 6 months
 */
async function getTrendAnalysis(leagueId: string) {
    const now = new Date();

    // Calculate 6-month window
    const months: Array<{ start: Date; end: Date; label: string; key: string }> = [];
    for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        months.push({
            start: startOfMonth(monthDate),
            end: endOfMonth(monthDate),
            label: format(monthDate, 'MMM yyyy'),
            key: format(monthDate, 'yyyy-MM'),
        });
    }

    const windowStart = months[0].start;
    const windowEnd = months[months.length - 1].end;

    // Batch fetch all data for the 6-month window
    const [teams, players, events, eventsWithRsvps] = await Promise.all([
        prisma.team.findMany({
            where: {
                leagueId,
                createdAt: {
                    gte: windowStart,
                    lte: windowEnd,
                },
            },
            select: { createdAt: true },
        }),
        prisma.player.findMany({
            where: {
                leagueId,
                createdAt: {
                    gte: windowStart,
                    lte: windowEnd,
                },
            },
            select: { createdAt: true },
        }),
        prisma.event.findMany({
            where: {
                leagueId,
                createdAt: {
                    gte: windowStart,
                    lte: windowEnd,
                },
            },
            select: { createdAt: true },
        }),
        prisma.event.findMany({
            where: {
                leagueId,
                startAt: {
                    gte: windowStart,
                    lte: windowEnd,
                },
            },
            select: {
                startAt: true,
                rsvps: {
                    select: {
                        status: true,
                    },
                },
            },
        }),
    ]);

    // Helper to get month key from date
    const getMonthKey = (date: Date) => format(date, 'yyyy-MM');

    // Group teams by month
    const teamsByMonth: Record<string, number> = {};
    teams.forEach(team => {
        const key = getMonthKey(team.createdAt);
        teamsByMonth[key] = (teamsByMonth[key] || 0) + 1;
    });

    // Group players by month
    const playersByMonth: Record<string, number> = {};
    players.forEach(player => {
        const key = getMonthKey(player.createdAt);
        playersByMonth[key] = (playersByMonth[key] || 0) + 1;
    });

    // Group events by month
    const eventsByMonth: Record<string, number> = {};
    events.forEach(event => {
        const key = getMonthKey(event.createdAt);
        eventsByMonth[key] = (eventsByMonth[key] || 0) + 1;
    });

    // Group RSVPs by month
    const rsvpsByMonth: Record<string, { total: number; going: number }> = {};
    eventsWithRsvps.forEach(event => {
        const key = getMonthKey(event.startAt);
        if (!rsvpsByMonth[key]) {
            rsvpsByMonth[key] = { total: 0, going: 0 };
        }
        const total = event.rsvps.length;
        const going = event.rsvps.filter(r => r.status === 'GOING' || r.status === 'MAYBE').length;
        rsvpsByMonth[key].total += total;
        rsvpsByMonth[key].going += going;
    });

    // Build monthly activity and participation trend arrays
    const monthlyActivity = [];
    const participationTrend = [];

    for (const { label, key } of months) {
        monthlyActivity.push({
            month: label,
            teamsCreated: teamsByMonth[key] || 0,
            playersAdded: playersByMonth[key] || 0,
            eventsScheduled: eventsByMonth[key] || 0,
        });

        const rsvpStats = rsvpsByMonth[key] || { total: 0, going: 0 };
        const participationRate = rsvpStats.total > 0
            ? Math.round((rsvpStats.going / rsvpStats.total) * 1000) / 10
            : 0;

        participationTrend.push({
            month: label,
            participationRate,
            totalRSVPs: rsvpStats.total,
        });
    }

    return {
        monthlyActivity,
        participationTrend,
    };
}
