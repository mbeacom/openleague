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
    const goingCount = rsvps.filter((r: { status: string }) => r.status === 'GOING').length;
    const notGoingCount = rsvps.filter((r: { status: string }) => r.status === 'NOT_GOING').length;
    const maybeCount = rsvps.filter((r: { status: string }) => r.status === 'MAYBE').length;
    const noResponseCount = rsvps.filter((r: { status: string }) => r.status === 'NO_RESPONSE').length;

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

    // Get monthly activity data
    const monthlyActivity = [];
    const participationTrend = [];

    for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthLabel = format(monthDate, 'MMM yyyy');

        // Count teams created in this month
        const teamsCreated = await prisma.team.count({
            where: {
                leagueId,
                createdAt: {
                    gte: monthStart,
                    lte: monthEnd,
                },
            },
        });

        // Count players added in this month
        const playersAdded = await prisma.player.count({
            where: {
                leagueId,
                createdAt: {
                    gte: monthStart,
                    lte: monthEnd,
                },
            },
        });

        // Count events scheduled in this month
        const eventsScheduled = await prisma.event.count({
            where: {
                leagueId,
                createdAt: {
                    gte: monthStart,
                    lte: monthEnd,
                },
            },
        });

        monthlyActivity.push({
            month: monthLabel,
            teamsCreated,
            playersAdded,
            eventsScheduled,
        });

        // Get participation rate for events that occurred in this month
        const monthEvents = await prisma.event.findMany({
            where: {
                leagueId,
                startAt: {
                    gte: monthStart,
                    lte: monthEnd,
                },
            },
            select: {
                rsvps: {
                    select: {
                        status: true,
                    },
                },
            },
        });

        const monthRSVPs = monthEvents.flatMap(e => e.rsvps);
        const totalRSVPs = monthRSVPs.length;
        const goingRSVPs = monthRSVPs.filter(r => r.status === 'GOING' || r.status === 'MAYBE').length;
        const participationRate = totalRSVPs > 0
            ? Math.round((goingRSVPs / totalRSVPs) * 1000) / 10
            : 0;

        participationTrend.push({
            month: monthLabel,
            participationRate,
            totalRSVPs,
        });
    }

    return {
        monthlyActivity,
        participationTrend,
    };
}
