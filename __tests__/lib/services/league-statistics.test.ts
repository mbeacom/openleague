import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getLeagueStatistics } from '@/lib/services/league-statistics';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/lib/db/prisma', () => ({
    prisma: {
        team: {
            count: vi.fn(),
            findMany: vi.fn(),
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
            count: vi.fn(),
            findMany: vi.fn(),
        },
        rSVP: {
            findMany: vi.fn(),
        },
    },
}));

describe('League Statistics Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getLeagueStatistics', () => {
        it('should return comprehensive league statistics', async () => {
            const leagueId = 'league-1';

            // Mock overview data
            vi.mocked(prisma.team.count).mockResolvedValueOnce(5); // totalTeams
            vi.mocked(prisma.player.count).mockResolvedValueOnce(50); // totalPlayers
            vi.mocked(prisma.event.count)
                .mockResolvedValueOnce(20) // totalEvents
                .mockResolvedValueOnce(8) // upcomingEvents
                .mockResolvedValue(0);
            vi.mocked(prisma.division.count).mockResolvedValueOnce(3); // activeDivisions

            // Mock participation data
            vi.mocked(prisma.rSVP.findMany).mockResolvedValueOnce([
                { status: 'GOING' },
                { status: 'GOING' },
                { status: 'NOT_GOING' },
                { status: 'MAYBE' },
                { status: 'NO_RESPONSE' },
            ] as unknown as Awaited<ReturnType<typeof prisma.rSVP.findMany>>);

            // Mock attendance and trend data
            const attendanceTeamMock = [
                {
                    id: 'team-1',
                    name: 'Team A',
                    divisionId: 'div-1',
                    events: [
                        {
                            id: 'event-1',
                            rsvps: [{ status: 'GOING' }, { status: 'GOING' }],
                        },
                    ],
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.team.findMany>>;

            const trendTeamMock = [
                { createdAt: new Date('2024-10-15') },
                { createdAt: new Date('2024-10-20') },
            ] as unknown as Awaited<ReturnType<typeof prisma.team.findMany>>;

            // Use mockResolvedValueOnce for sequential calls
            vi.mocked(prisma.team.findMany)
                .mockResolvedValueOnce(attendanceTeamMock)
                .mockResolvedValueOnce(trendTeamMock);

            vi.mocked(prisma.division.findMany).mockResolvedValueOnce([
                {
                    id: 'div-1',
                    name: 'Division A',
                    teams: [
                        {
                            events: [
                                {
                                    id: 'event-1',
                                    rsvps: [{ status: 'GOING' }],
                                },
                            ],
                        },
                    ],
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.division.findMany>>);

            // Mock trend analysis player and event data
            vi.mocked(prisma.player.findMany).mockResolvedValue([
                { createdAt: new Date('2024-10-10') },
                { createdAt: new Date('2024-10-18') },
            ] as unknown as Awaited<ReturnType<typeof prisma.player.findMany>>);
            vi.mocked(prisma.event.findMany).mockResolvedValue([
                {
                    createdAt: new Date('2024-10-12'),
                    startAt: new Date('2024-10-25'),
                    rsvps: [{ status: 'GOING' }, { status: 'NOT_GOING' }],
                },
            ] as unknown as Awaited<ReturnType<typeof prisma.event.findMany>>);

            const result = await getLeagueStatistics(leagueId);

            // Verify overview
            expect(result.overview).toEqual({
                totalTeams: 5,
                totalPlayers: 50,
                totalEvents: 20,
                upcomingEvents: 8,
                activeDivisions: 3,
            });

            // Verify participation stats
            expect(result.participation.totalRSVPs).toBe(5);
            expect(result.participation.goingCount).toBe(2);
            expect(result.participation.notGoingCount).toBe(1);
            expect(result.participation.maybeCount).toBe(1);
            expect(result.participation.noResponseCount).toBe(1);
            expect(result.participation.participationRate).toBeGreaterThan(0);

            // Verify attendance structure
            expect(result.attendance.byTeam).toBeInstanceOf(Array);
            expect(result.attendance.byDivision).toBeInstanceOf(Array);
            expect(result.attendance.overall).toBeDefined();

            // Verify trends structure
            expect(result.trends.monthlyActivity).toBeInstanceOf(Array);
            expect(result.trends.monthlyActivity).toHaveLength(6);
            expect(result.trends.participationTrend).toBeInstanceOf(Array);
            expect(result.trends.participationTrend).toHaveLength(6);
        });

        it('should calculate participation rate correctly', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.team.count).mockResolvedValue(0);
            vi.mocked(prisma.player.count).mockResolvedValue(0);
            vi.mocked(prisma.event.count).mockResolvedValue(0);
            vi.mocked(prisma.division.count).mockResolvedValue(0);

            // 60% going, 20% maybe = 80% participation rate
            vi.mocked(prisma.rSVP.findMany).mockResolvedValueOnce([
                { status: 'GOING' },
                { status: 'GOING' },
                { status: 'GOING' },
                { status: 'MAYBE' },
                { status: 'NOT_GOING' },
            ] as unknown as Awaited<ReturnType<typeof prisma.rSVP.findMany>>);

            vi.mocked(prisma.team.findMany).mockResolvedValue([]);
            vi.mocked(prisma.player.findMany).mockResolvedValue([]);
            vi.mocked(prisma.division.findMany).mockResolvedValue([]);
            vi.mocked(prisma.event.findMany).mockResolvedValue([]);

            const result = await getLeagueStatistics(leagueId);

            expect(result.participation.participationRate).toBe(80.0);
        });

        it('should handle zero RSVPs gracefully', async () => {
            const leagueId = 'league-1';

            vi.mocked(prisma.team.count).mockResolvedValue(0);
            vi.mocked(prisma.player.count).mockResolvedValue(0);
            vi.mocked(prisma.event.count).mockResolvedValue(0);
            vi.mocked(prisma.division.count).mockResolvedValue(0);
            vi.mocked(prisma.rSVP.findMany).mockResolvedValue([]);
            vi.mocked(prisma.team.findMany).mockResolvedValue([]);
            vi.mocked(prisma.player.findMany).mockResolvedValue([]);
            vi.mocked(prisma.division.findMany).mockResolvedValue([]);
            vi.mocked(prisma.event.findMany).mockResolvedValue([]);

            const result = await getLeagueStatistics(leagueId);

            expect(result.participation.participationRate).toBe(0);
            expect(result.participation.totalRSVPs).toBe(0);
        });
    });
});
