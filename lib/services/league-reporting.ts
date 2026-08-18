/**
 * League Reporting Service
 * Provides export functionality for league data
 */

import { prisma } from "@/lib/db/prisma";
import { format } from "date-fns";
import { getLeagueScheduleItems } from "@/lib/data/schedule-items";
import { generateSimplePdfReportBase64 } from "@/lib/utils/pdf-report";

interface LeagueRosterCSVOptions {
    includeAdminFields?: boolean;
}

type ReportCell = string | number | null | undefined;

interface FinancialIceTimeRequest {
    status: string;
    scheduleBlock: {
        priceAmount: number | null;
        priceCurrency: string;
    } | null;
}

interface LeagueReportMetadata {
    leagueName: string;
    sport: string;
    teamCount: number;
    playerCount: number;
    eventCount: number;
    generatedAt: Date;
}

const PENDING_ICE_TIME_STATUSES = new Set(["SUBMITTED", "UNDER_REVIEW"]);

type LeagueReportRole = "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER";

async function requireLeagueReportViewer(
    leagueId: string,
    authenticatedUserId: string,
    requiredRole?: "LEAGUE_ADMIN",
): Promise<{
    userId: string;
    leagueRole: LeagueReportRole;
}> {
    if (!authenticatedUserId) throw new Error("Authenticated user identity is required");
    const membership = await prisma.leagueUser.findFirst({
        where: {
            leagueId,
            userId: authenticatedUserId,
            league: { isActive: true },
            ...(requiredRole ? { role: requiredRole } : {}),
        },
        select: { role: true },
    });
    if (!membership) throw new Error("Unauthorized league report export");

    return { userId: authenticatedUserId, leagueRole: membership.role };
}

function buildCsvContent(headers: string[], rows: ReportCell[][]): string {
    return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
}

async function generatePdfFromCsv(
    leagueId: string,
    authenticatedUserId: string,
    reportTitle: string,
    csv: string,
    metadata?: LeagueReportMetadata
): Promise<string> {
    const reportMetadata = metadata ?? await getReportMetadata(leagueId, authenticatedUserId);
    const lines = csvToPdfLines(csv);

    return generateSimplePdfReportBase64({
        title: `${reportMetadata.leagueName} - ${reportTitle}`,
        subtitle: [
            `Sport: ${reportMetadata.sport}`,
            `Teams: ${reportMetadata.teamCount} | Players: ${reportMetadata.playerCount} | Events: ${reportMetadata.eventCount}`,
        ],
        lines,
        generatedAt: reportMetadata.generatedAt,
    });
}

function csvToPdfLines(csv: string): string[] {
    return csv
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => parseCsvLine(line).join(' | '));
}

function parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const nextChar = line[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            cells.push(cell);
            cell = '';
            continue;
        }

        cell += char;
    }

    cells.push(cell);
    return cells;
}

function summarizeIceTimeRequests(requests: FinancialIceTimeRequest[]) {
    const amountsByCurrency: Record<string, number> = {};
    let approvedRequests = 0;
    let pendingRequests = 0;
    let pricedApprovedRequests = 0;

    requests.forEach((request) => {
        if (request.status === "ACCEPTED") {
            approvedRequests += 1;

            const priceAmount = request.scheduleBlock?.priceAmount;
            if (priceAmount !== null && priceAmount !== undefined) {
                pricedApprovedRequests += 1;
                const currency = request.scheduleBlock?.priceCurrency || "USD";
                amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + priceAmount;
            }
        }

        if (PENDING_ICE_TIME_STATUSES.has(request.status)) {
            pendingRequests += 1;
        }
    });

    return {
        totalRequests: requests.length,
        approvedRequests,
        pendingRequests,
        pricedApprovedRequests,
        amountsByCurrency,
    };
}

function formatCostSummary(amountsByCurrency: Record<string, number>): string {
    const entries = Object.entries(amountsByCurrency);
    if (entries.length === 0) return "0";

    return entries
        .sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB))
        .map(([currency, amount]) => `${currency} ${amount}`)
        .join('; ');
}

function formatCurrencySummary(amountsByCurrency: Record<string, number>): string {
    const currencies = Object.keys(amountsByCurrency).sort();
    if (currencies.length === 0) return "";
    if (currencies.length === 1) return currencies[0];
    return "Multiple";
}

/**
 * Generate CSV content for league roster.
 * Admin-only fields are excluded unless explicitly requested by an authorized caller.
 */
export async function generateLeagueRosterCSV(
    leagueId: string,
    authenticatedUserId: string,
    options: LeagueRosterCSVOptions = {}
): Promise<string> {
    const viewer = await requireLeagueReportViewer(leagueId, authenticatedUserId);
    const includeAdminFields =
        options.includeAdminFields === true && viewer.leagueRole === "LEAGUE_ADMIN";

    const players = await prisma.player.findMany({
        where: { leagueId },
        select: {
            name: true,
            email: true,
            phone: true,
            jerseyNumber: true,
            position: true,
            createdAt: true,
            ...(includeAdminFields
                ? {
                    emergencyContact: true,
                    emergencyPhone: true,
                    usahMemberId: true,
                }
                : {}),
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
        'Jersey Number',
        'Position',
        'Date Added',
    ];

    if (includeAdminFields) {
        headers.push(
            'Emergency Contact Name',
            'Emergency Contact Phone',
            'USA Hockey Member ID'
        );
    }

    // CSV Rows
    const rows = players.map(player => {
        const row = [
            player.name,
            player.email || '',
            player.phone || '',
            player.team.name,
            player.team.division?.name || 'Unassigned',
            player.jerseyNumber?.toString() || '',
            player.position || '',
            format(player.createdAt, 'yyyy-MM-dd'),
        ];

        if (includeAdminFields) {
            row.push(
                'emergencyContact' in player ? player.emergencyContact || '' : '',
                'emergencyPhone' in player ? player.emergencyPhone || '' : '',
                'usahMemberId' in player ? player.usahMemberId || '' : ''
            );
        }

        return row;
    });

    return buildCsvContent(headers, rows);
}

/**
 * Generate PDF content for league roster.
 */
export async function generateLeagueRosterPDF(
    leagueId: string,
    authenticatedUserId: string,
    options: LeagueRosterCSVOptions = {},
    metadata?: LeagueReportMetadata
): Promise<string> {
    const csv = await generateLeagueRosterCSV(leagueId, authenticatedUserId, options);
    return generatePdfFromCsv(
        leagueId,
        authenticatedUserId,
        "League Roster Report",
        csv,
        metadata,
    );
}

/**
 * Generate CSV content for league schedule
 */
export async function generateLeagueScheduleCSV(
    leagueId: string,
    authenticatedUserId: string,
): Promise<string> {
    const viewer = await requireLeagueReportViewer(leagueId, authenticatedUserId);
    const events = await getLeagueScheduleItems(leagueId, viewer);

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
        format(event.startsAt, 'yyyy-MM-dd'),
        format(event.startsAt, 'HH:mm'),
        event.eventType ?? event.source,
        event.title,
        event.teamName || '',
        event.divisionName || 'Unassigned',
        event.homeTeam?.name || '',
        event.awayTeam?.name || '',
        event.location || event.venueName || '',
        event.opponent || '',
        event.notes || '',
    ]);

    return buildCsvContent(headers, rows);
}

/**
 * Generate PDF content for league schedule.
 */
export async function generateLeagueSchedulePDF(
    leagueId: string,
    authenticatedUserId: string,
    metadata?: LeagueReportMetadata,
): Promise<string> {
    const viewer = await requireLeagueReportViewer(leagueId, authenticatedUserId);
    const events = await getLeagueScheduleItems(leagueId, viewer);
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
    const rows = events.map(event => [
        format(event.startsAt, 'yyyy-MM-dd'),
        format(event.startsAt, 'HH:mm'),
        event.eventType ?? event.source,
        event.title,
        event.teamName || '',
        event.divisionName || 'Unassigned',
        event.homeTeam?.name || '',
        event.awayTeam?.name || '',
        event.location || event.venueName || '',
        event.opponent || '',
        event.notes || '',
    ]);
    const csv = buildCsvContent(headers, rows);
    return generatePdfFromCsv(
        leagueId,
        authenticatedUserId,
        "League Schedule Report",
        csv,
        metadata,
    );
}

/**
 * Generate CSV content for attendance report by division
 */
export async function generateAttendanceReportByDivisionCSV(
    leagueId: string,
    authenticatedUserId: string,
): Promise<string> {
    await requireLeagueReportViewer(leagueId, authenticatedUserId);
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

    return buildCsvContent(headers, rows);
}

/**
 * Generate PDF content for attendance report by division.
 */
export async function generateAttendanceReportByDivisionPDF(
    leagueId: string,
    authenticatedUserId: string,
    metadata?: LeagueReportMetadata
): Promise<string> {
    const csv = await generateAttendanceReportByDivisionCSV(leagueId, authenticatedUserId);
    return generatePdfFromCsv(
        leagueId,
        authenticatedUserId,
        "Attendance by Division Report",
        csv,
        metadata,
    );
}

/**
 * Generate CSV content for a basic financial/activity report.
 *
 * OpenLeague does not currently maintain a payment ledger, so this report uses
 * real league data that exists today: roster size, event volume, ice-time
 * request status, and accepted venue schedule prices where a venue has recorded
 * them. This keeps the export data-backed while giving admins actionable cost
 * exposure for league activities.
 */
export async function generateFinancialReportCSV(
    leagueId: string,
    authenticatedUserId: string,
): Promise<string> {
    await requireLeagueReportViewer(leagueId, authenticatedUserId, "LEAGUE_ADMIN");
    const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: {
            name: true,
            teams: {
                where: { isActive: true },
                select: {
                    name: true,
                    division: {
                        select: {
                            name: true,
                        },
                    },
                    _count: {
                        select: {
                            players: true,
                            events: true,
                        },
                    },
                    iceTimeRequests: {
                        select: {
                            status: true,
                            scheduleBlock: {
                                select: {
                                    priceAmount: true,
                                    priceCurrency: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { name: 'asc' },
            },
            iceTimeRequests: {
                select: {
                    status: true,
                    scheduleBlock: {
                        select: {
                            priceAmount: true,
                            priceCurrency: true,
                        },
                    },
                },
            },
        },
    });

    if (!league) {
        throw new Error('League not found');
    }

    const headers = [
        'Scope',
        'Team',
        'Division',
        'Total Players',
        'Total Events',
        'Ice Time Requests',
        'Approved Requests',
        'Pending Requests',
        'Known Scheduled Cost',
        'Currency',
        'Notes',
    ];

    const rows = league.teams.map((team) => {
        const summary = summarizeIceTimeRequests(team.iceTimeRequests);

        return [
            'Team',
            team.name,
            team.division?.name || 'Unassigned',
            team._count.players.toString(),
            team._count.events.toString(),
            summary.totalRequests.toString(),
            summary.approvedRequests.toString(),
            summary.pendingRequests.toString(),
            formatCostSummary(summary.amountsByCurrency),
            formatCurrencySummary(summary.amountsByCurrency),
            summary.pricedApprovedRequests > 0
                ? 'Accepted priced ice-time requests only'
                : 'No accepted priced ice-time requests',
        ];
    });

    const leagueWideSummary = summarizeIceTimeRequests(league.iceTimeRequests);
    if (leagueWideSummary.totalRequests > 0) {
        rows.push([
            'League-wide',
            'League Administration',
            'All Divisions',
            '',
            '',
            leagueWideSummary.totalRequests.toString(),
            leagueWideSummary.approvedRequests.toString(),
            leagueWideSummary.pendingRequests.toString(),
            formatCostSummary(leagueWideSummary.amountsByCurrency),
            formatCurrencySummary(leagueWideSummary.amountsByCurrency),
            leagueWideSummary.pricedApprovedRequests > 0
                ? 'Accepted priced league-level ice-time requests only'
                : 'No accepted priced league-level ice-time requests',
        ]);
    }

    const totalPlayers = league.teams.reduce((sum, team) => sum + team._count.players, 0);
    const totalEvents = league.teams.reduce((sum, team) => sum + team._count.events, 0);
    const allRequests = [
        ...league.iceTimeRequests,
        ...league.teams.flatMap((team) => team.iceTimeRequests),
    ];
    const totalSummary = summarizeIceTimeRequests(allRequests);

    rows.push([
        'TOTAL',
        'All Teams',
        '',
        totalPlayers.toString(),
        totalEvents.toString(),
        totalSummary.totalRequests.toString(),
        totalSummary.approvedRequests.toString(),
        totalSummary.pendingRequests.toString(),
        formatCostSummary(totalSummary.amountsByCurrency),
        formatCurrencySummary(totalSummary.amountsByCurrency),
        'Known costs sum accepted ice-time requests with recorded venue prices',
    ]);

    return buildCsvContent(headers, rows);
}

/**
 * Generate PDF content for financial report.
 */
export async function generateFinancialReportPDF(
    leagueId: string,
    authenticatedUserId: string,
    metadata?: LeagueReportMetadata
): Promise<string> {
    const csv = await generateFinancialReportCSV(leagueId, authenticatedUserId);
    return generatePdfFromCsv(
        leagueId,
        authenticatedUserId,
        "Financial Activity Report",
        csv,
        metadata,
    );
}

/**
 * Get report metadata for a league
 */
export async function getReportMetadata(
    leagueId: string,
    authenticatedUserId: string,
): Promise<LeagueReportMetadata> {
    await requireLeagueReportViewer(leagueId, authenticatedUserId);
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
