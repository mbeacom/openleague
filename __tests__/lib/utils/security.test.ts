import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    LeagueAccessLevel,
    AuditAction,
    validateLeagueOperationData,
    checkLeagueOperationRateLimit,
    cleanupRateLimitEntries
} from '@/lib/utils/security';

// Mock prisma
vi.mock('@/lib/db/prisma', () => ({
    prisma: {
        leagueUser: {
            findFirst: vi.fn(),
        },
        teamMember: {
            count: vi.fn(),
        },
        team: {
            findUnique: vi.fn(),
        },
        player: {
            findUnique: vi.fn(),
        },
        event: {
            findUnique: vi.fn(),
        },
        division: {
            findUnique: vi.fn(),
        },
    },
}));

// Mock auth session
vi.mock('@/lib/auth/session', () => ({
    requireUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

describe('Security Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('validateLeagueOperationData', () => {
        it('should pass validation for clean data', () => {
            const data = {
                name: 'Test League',
                sport: 'Soccer',
                contactEmail: 'test@example.com',
            };

            const result = validateLeagueOperationData(data);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect null bytes in strings', () => {
            const data = {
                name: 'Test League\0',
                sport: 'Soccer',
            };

            const result = validateLeagueOperationData(data);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('name contains null bytes');
        });

        it('should detect dangerous control characters', () => {
            const data = {
                name: 'Test League\x08',
                sport: 'Soccer',
            };

            const result = validateLeagueOperationData(data);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('name contains dangerous control characters');
        });

        it('should detect potential SQL injection patterns', () => {
            const data = {
                name: 'Test League',
                sport: 'Soccer; DROP TABLE users;',
            };

            const result = validateLeagueOperationData(data);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('sport contains potentially dangerous SQL patterns');
        });

        it('should validate nested objects', () => {
            const data = {
                league: {
                    name: 'Test League\0',
                    sport: 'Soccer',
                },
            };

            const result = validateLeagueOperationData(data);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('league.name contains null bytes');
        });

        it('should validate arrays', () => {
            const data = {
                teams: [
                    { name: 'Team 1' },
                    { name: 'Team 2\0' },
                ],
            };

            const result = validateLeagueOperationData(data);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('teams[1].name contains null bytes');
        });
    });

    describe('checkLeagueOperationRateLimit', () => {
        it('should allow operations within rate limit', () => {
            const userId = 'test-user';
            const operation = 'create_team';

            const result1 = checkLeagueOperationRateLimit(userId, operation, 5);
            const result2 = checkLeagueOperationRateLimit(userId, operation, 5);

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        it('should block operations exceeding rate limit', () => {
            const userId = 'test-user-2';
            const operation = 'create_team';
            const maxOperations = 2;

            // First two operations should succeed
            expect(checkLeagueOperationRateLimit(userId, operation, maxOperations)).toBe(true);
            expect(checkLeagueOperationRateLimit(userId, operation, maxOperations)).toBe(true);

            // Third operation should be blocked
            expect(checkLeagueOperationRateLimit(userId, operation, maxOperations)).toBe(false);
        });

        it('should reset rate limit after window expires', async () => {
            const userId = 'test-user-3';
            const operation = 'create_team';
            const maxOperations = 1;
            const windowMs = 100; // 100ms window

            // First operation should succeed
            expect(checkLeagueOperationRateLimit(userId, operation, maxOperations, windowMs)).toBe(true);

            // Second operation should be blocked
            expect(checkLeagueOperationRateLimit(userId, operation, maxOperations, windowMs)).toBe(false);

            // Wait for window to expire and try again
            await new Promise(resolve => setTimeout(resolve, windowMs + 10));

            // Try again - should succeed after window expired
            expect(checkLeagueOperationRateLimit(userId, operation, maxOperations, windowMs)).toBe(true);
        });

        it('should handle different operations separately', () => {
            const userId = 'test-user-4';
            const maxOperations = 1;

            expect(checkLeagueOperationRateLimit(userId, 'create_team', maxOperations)).toBe(true);
            expect(checkLeagueOperationRateLimit(userId, 'create_division', maxOperations)).toBe(true);

            // Both operations should now be at their limit
            expect(checkLeagueOperationRateLimit(userId, 'create_team', maxOperations)).toBe(false);
            expect(checkLeagueOperationRateLimit(userId, 'create_division', maxOperations)).toBe(false);
        });
    });

    describe('cleanupRateLimitEntries', () => {
        it('should remove expired entries', async () => {
            const userId = 'test-user-5';
            const operation = 'test_operation';
            const windowMs = 50; // Very short window

            // Create an entry
            checkLeagueOperationRateLimit(userId, operation, 1, windowMs);

            // Wait for it to expire
            await new Promise(resolve => setTimeout(resolve, windowMs + 10));
            cleanupRateLimitEntries();

            // Should be able to perform operation again after cleanup
            expect(checkLeagueOperationRateLimit(userId, operation, 1, windowMs)).toBe(true);
        });
    });

    describe('LeagueAccessLevel enum', () => {
        it('should have correct hierarchy values', () => {
            expect(LeagueAccessLevel.NONE).toBe(0);
            expect(LeagueAccessLevel.MEMBER).toBe(1);
            expect(LeagueAccessLevel.TEAM_ADMIN).toBe(2);
            expect(LeagueAccessLevel.LEAGUE_ADMIN).toBe(3);
        });
    });

    describe('AuditAction enum', () => {
        it('should contain expected audit actions', () => {
            expect(AuditAction.LEAGUE_CREATED).toBe('league_created');
            expect(AuditAction.TEAM_CREATED).toBe('team_created');
            expect(AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT).toBe('unauthorized_access_attempt');
            expect(AuditAction.PERMISSION_DENIED).toBe('permission_denied');
        });
    });
});