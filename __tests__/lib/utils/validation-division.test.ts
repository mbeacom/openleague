import { describe, it, expect } from 'vitest';
import {
  createDivisionSchema,
  updateDivisionSchema,
  deleteDivisionSchema,
  assignTeamToDivisionSchema,
} from '@/lib/utils/validation';

describe('Division Validation Schemas', () => {
  describe('createDivisionSchema', () => {
    it('should validate a complete division creation', () => {
      const input = {
        leagueId: 'clabcdef1234567890',
        name: 'U10 Division',
        ageGroup: 'Under 10',
        skillLevel: 'Recreational',
      };

      const result = createDivisionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const input = {
        leagueId: 'clabcdef1234567890',
        name: 'U10 Division',
      };

      const result = createDivisionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should fail with empty name', () => {
      const input = {
        leagueId: 'clabcdef1234567890',
        name: '',
      };

      const result = createDivisionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should fail with invalid league ID format', () => {
      const input = {
        leagueId: 'invalid-id',
        name: 'U10 Division',
      };

      const result = createDivisionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should sanitize name by trimming whitespace', () => {
      const input = {
        leagueId: 'clabcdef1234567890',
        name: '  U10 Division  ',
      };

      const result = createDivisionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('U10 Division');
      }
    });
  });

  describe('updateDivisionSchema', () => {
    it('should validate a complete division update', () => {
      const input = {
        id: 'clabcdef1234567890',
        leagueId: 'clabcdef1234567890',
        name: 'U12 Division',
        ageGroup: 'Under 12',
        skillLevel: 'Competitive',
      };

      const result = updateDivisionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should fail without division ID', () => {
      const input = {
        leagueId: 'clabcdef1234567890',
        name: 'U12 Division',
      };

      const result = updateDivisionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('deleteDivisionSchema', () => {
    it('should validate division deletion', () => {
      const input = {
        id: 'clabcdef1234567890',
        leagueId: 'clabcdef1234567890',
      };

      const result = deleteDivisionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid IDs', () => {
      const input = {
        id: 'invalid',
        leagueId: 'invalid',
      };

      const result = deleteDivisionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('assignTeamToDivisionSchema', () => {
    it('should validate team assignment to division', () => {
      const input = {
        teamId: 'clabcdef1234567890',
        divisionId: 'clabcdef1234567890',
        leagueId: 'clabcdef1234567890',
      };

      const result = assignTeamToDivisionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate team removal from division with null divisionId', () => {
      const input = {
        teamId: 'clabcdef1234567890',
        divisionId: null,
        leagueId: 'clabcdef1234567890',
      };

      const result = assignTeamToDivisionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid team ID', () => {
      const input = {
        teamId: 'invalid',
        divisionId: 'clabcdef1234567890',
        leagueId: 'clabcdef1234567890',
      };

      const result = assignTeamToDivisionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
