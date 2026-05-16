import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    generateLeagueRosterCSV,
    generateLeagueRosterPDF,
    generateLeagueScheduleCSV,
    generateAttendanceReportByDivisionCSV,
    generateFinancialReportCSV,
} from '@/lib/services/league-reporting';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/lib/db/prisma', () => ({
    prisma: {
        team: {
            count: vi.fn(),
        },
        player: {
            count: vi.fn(),
            findMany: vi.fn(),
        },
        event: {
            count: vi.fn(),
            findMany: vi.fn(),
        },
        division: {
            findMany: vi.fn(),
        },
        league: {
            findUnique: vi.fn(),
        },
    },
}));

describe('League Reporting Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('generateLeagueRosterCSV', () => {
        it('should generate CSV with player roster data', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.player.findMany).mockResolvedValue([
                {
                    id: 'player-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '555-0100',
                    jerseyNumber: 12,
                    position: 'Forward',
                    emergencyContact: 'Jane Doe',
                    emergencyPhone: '555-0101',
                    usahMemberId: '12345678901234',
                    createdAt: new Date('2024-01-01'),
                    team: {
                        name: 'Team A',
                        division: {
                            name: 'Division 1',
                        },
                    },
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.player.findMany>>);

            const csv = await generateLeagueRosterCSV(leagueId);

            expect(csv).toContain('Player Name,Email,Phone,Team,Division,Jersey Number,Position,Date Added');
            expect(csv).toContain('John Doe');
            expect(csv).toContain('john@example.com');
            expect(csv).toContain('Team A');
            expect(csv).toContain('Division 1');
            expect(csv).toContain('12');
            expect(csv).toContain('Forward');
            expect(csv).not.toContain('Emergency Contact Name');
            expect(csv).not.toContain('Jane Doe');
            expect(csv).not.toContain('USA Hockey Member ID');
        });

        it('should handle players without division', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.player.findMany).mockResolvedValue([
                {
                    id: 'player-1',
                    name: 'John Doe',
                    email: null,
                    phone: null,
                    jerseyNumber: null,
                    position: null,
                    emergencyContact: null,
                    emergencyPhone: null,
                    usahMemberId: null,
                    createdAt: new Date('2024-01-01'),
                    team: {
                        name: 'Team A',
                        division: null,
                    },
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.player.findMany>>);

            const csv = await generateLeagueRosterCSV(leagueId);

            expect(csv).toContain('Unassigned');
        });

        it('should include admin-only roster fields only when requested', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.player.findMany).mockResolvedValue([
                {
                    id: 'player-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '555-0100',
                    jerseyNumber: 12,
                    position: 'Forward',
                    emergencyContact: 'Jane Doe',
                    emergencyPhone: '555-0101',
                    usahMemberId: '12345678901234',
                    createdAt: new Date('2024-01-01'),
                    team: {
                        name: 'Team A',
                        division: {
                            name: 'Division 1',
                        },
                    },
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.player.findMany>>);

            const csv = await generateLeagueRosterCSV(leagueId, { includeAdminFields: true });

            expect(csv).toContain('Emergency Contact Name,Emergency Contact Phone,USA Hockey Member ID');
            expect(csv).toContain('Jane Doe');
            expect(csv).toContain('555-0101');
            expect(csv).toContain('12345678901234');
            expect(prisma.player.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    select: expect.objectContaining({
                        emergencyContact: true,
                        emergencyPhone: true,
                        usahMemberId: true,
                    }),
                })
            );
        });

        it('should generate a real PDF for roster exports', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.player.findMany).mockResolvedValue([
                {
                    id: 'player-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '555-0100',
                    jerseyNumber: 12,
                    position: 'Forward',
                    createdAt: new Date('2024-01-01'),
                    team: {
                        name: 'Team A',
                        division: {
                            name: 'Division 1',
                        },
                    },
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.player.findMany>>);
            vi.mocked(prisma.league.findUnique).mockResolvedValue({
                name: 'Test League',
                sport: 'HOCKEY',
            } as unknown as Awaited<ReturnType<typeof prisma.league.findUnique>>);
            vi.mocked(prisma.team.count).mockResolvedValue(1);
            vi.mocked(prisma.player.count).mockResolvedValue(1);
            vi.mocked(prisma.event.count).mockResolvedValue(0);

            const pdfBase64 = await generateLeagueRosterPDF(leagueId);
            const pdfHeader = Buffer.from(pdfBase64, 'base64').toString('utf8', 0, 8);

            expect(pdfHeader).toBe('%PDF-1.4');
        });
    });

    describe('generateLeagueScheduleCSV', () => {
        it('should generate CSV with event schedule data', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.event.findMany).mockResolvedValue([
                {
                    id: 'event-1',
                    title: 'Practice Session',
                    type: 'PRACTICE',
                    startAt: new Date('2024-06-01T10:00:00Z'),
                    location: 'Field 1',
                    opponent: null,
                    notes: 'Bring water',
                    team: {
                        name: 'Team A',
                        division: {
                            name: 'Division 1',
                        },
                    },
                    homeTeam: null,
                    awayTeam: null,
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.event.findMany>>);

            const csv = await generateLeagueScheduleCSV(leagueId);

            expect(csv).toContain('Date,Time,Event Type,Title');
            expect(csv).toContain('Practice Session');
            expect(csv).toContain('PRACTICE');
            expect(csv).toContain('Field 1');
        });

        it('should handle games with home and away teams', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.event.findMany).mockResolvedValue([
                {
                    id: 'event-1',
                    title: 'Championship Game',
                    type: 'GAME',
                    startAt: new Date('2024-06-15T14:00:00Z'),
                    location: 'Stadium',
                    opponent: 'Team B',
                    notes: null,
                    team: {
                        name: 'Team A',
                        division: {
                            name: 'Division 1',
                        },
                    },
                    homeTeam: {
                        name: 'Team A',
                    },
                    awayTeam: {
                        name: 'Team B',
                    },
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.event.findMany>>);

            const csv = await generateLeagueScheduleCSV(leagueId);

            expect(csv).toContain('Team A');
            expect(csv).toContain('Team B');
        });
    });

    describe('generateAttendanceReportByDivisionCSV', () => {
        it('should generate CSV with attendance statistics', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.division.findMany).mockResolvedValue([
                {
                    id: 'div-1',
                    name: 'Division 1',
                    teams: [
                        {
                            name: 'Team A',
                            events: [
                                {
                                    rsvps: [
                                        { status: 'GOING' },
                                        { status: 'GOING' },
                                        { status: 'NOT_GOING' },
                                    ],
                                },
                                {
                                    rsvps: [
                                        { status: 'GOING' },
                                        { status: 'MAYBE' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.division.findMany>>);

            const csv = await generateAttendanceReportByDivisionCSV(leagueId);

            expect(csv).toContain('Division,Team,Total Events,Total RSVPs');
            expect(csv).toContain('Division 1');
            expect(csv).toContain('Team A');
            expect(csv).toContain('Attendance Rate');
        });

        it('should calculate attendance rates correctly', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.division.findMany).mockResolvedValue([
                {
                    id: 'div-1',
                    name: 'Division 1',
                    teams: [
                        {
                            name: 'Team A',
                            events: [
                                {
                                    rsvps: [
                                        { status: 'GOING' },
                                        { status: 'GOING' },
                                        { status: 'GOING' },
                                        { status: 'GOING' },
                                        { status: 'NOT_GOING' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.division.findMany>>);

            const csv = await generateAttendanceReportByDivisionCSV(leagueId);

            // 4 going out of 5 total = 80% attendance rate
            expect(csv).toContain('80.0');
        });
    });

    describe('generateFinancialReportCSV', () => {
        it('should generate financial activity report from real league data', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.league.findUnique).mockResolvedValue({
                id: leagueId,
                name: 'Test League',
                teams: [
                    {
                        name: 'Team A',
                        division: { name: 'Division 1' },
                        _count: {
                            players: 15,
                            events: 3,
                        },
                        iceTimeRequests: [
                            {
                                status: 'ACCEPTED',
                                scheduleBlock: { priceAmount: 120, priceCurrency: 'USD' },
                            },
                            {
                                status: 'SUBMITTED',
                                scheduleBlock: { priceAmount: 80, priceCurrency: 'USD' },
                            },
                        ],
                    },
                    {
                        name: 'Team B',
                        division: null,
                        _count: {
                            players: 12,
                            events: 2,
                        },
                        iceTimeRequests: [],
                    },
                ],
                iceTimeRequests: [
                    {
                        status: 'ACCEPTED',
                        scheduleBlock: { priceAmount: 300, priceCurrency: 'USD' },
                    },
                ],
            } as unknown as Awaited<ReturnType<typeof prisma.league.findUnique>>);

            const csv = await generateFinancialReportCSV(leagueId);

            expect(csv).toContain('Scope,Team,Division,Total Players,Total Events,Ice Time Requests,Approved Requests,Pending Requests,Known Scheduled Cost,Currency,Notes');
            expect(csv).toContain('Team A');
            expect(csv).toContain('15');
            expect(csv).toContain('Division 1');
            expect(csv).toContain('USD 120');
            expect(csv).toContain('League Administration');
            expect(csv).toContain('Team B');
            expect(csv).toContain('12');
            expect(csv).toContain('TOTAL');
            expect(csv).toContain('27'); // Total players
            expect(csv).toContain('5'); // Total events
            expect(csv).toContain('USD 420'); // Team + league-level accepted known costs
            expect(csv).not.toContain('Payment tracking not yet implemented');
        });

        it('should throw error if league not found', async () => {
            const leagueId = 'non-existent';

            vi.mocked(prisma.league.findUnique).mockResolvedValue(null);

            await expect(generateFinancialReportCSV(leagueId)).rejects.toThrow(
                'League not found'
            );
        });
    });
});
