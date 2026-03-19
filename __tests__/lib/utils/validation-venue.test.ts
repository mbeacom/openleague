import { describe, it, expect } from 'vitest';
import {
  createVenueSchema,
  updateVenueSchema,
  venueAvailabilitySchema,
} from '@/lib/utils/validation';

describe('Venue Validation Schemas', () => {
  describe('createVenueSchema', () => {
    it('should validate a complete venue creation', () => {
      const input = {
        name: 'Main Ice Arena',
        address: '123 Hockey St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        surfaceType: 'ICE',
        capacity: 500,
        amenities: ['Parking', 'Locker Rooms'],
        phone: '555-0100',
        website: 'https://example.com',
        notes: 'Great venue',
        visibility: 'PUBLIC',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const input = {
        name: 'Simple Venue',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const input = {
        name: '',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should require leagueId when visibility is LEAGUE', () => {
      const input = {
        name: 'League Venue',
        visibility: 'LEAGUE',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const leagueIdError = result.error.issues.find(
          (issue) => issue.path.includes('leagueId')
        );
        expect(leagueIdError).toBeDefined();
      }
    });

    it('should accept LEAGUE visibility with leagueId', () => {
      const input = {
        name: 'League Venue',
        visibility: 'LEAGUE',
        leagueId: 'clabcdef1234567890',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require teamId when visibility is TEAM', () => {
      const input = {
        name: 'Team Venue',
        visibility: 'TEAM',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const teamIdError = result.error.issues.find(
          (issue) => issue.path.includes('teamId')
        );
        expect(teamIdError).toBeDefined();
      }
    });

    it('should accept TEAM visibility with teamId', () => {
      const input = {
        name: 'Team Venue',
        visibility: 'TEAM',
        teamId: 'clabcdef1234567890',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid surface type', () => {
      const input = {
        name: 'Venue',
        surfaceType: 'CONCRETE',
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject capacity less than 1', () => {
      const input = {
        name: 'Venue',
        capacity: 0,
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject more than 20 amenities', () => {
      const input = {
        name: 'Venue',
        amenities: Array.from({ length: 21 }, (_, i) => `Amenity ${i}`),
      };

      const result = createVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('updateVenueSchema', () => {
    const validUpdate = {
      id: 'clabcdef1234567890',
      name: 'Updated Venue',
    };

    it('should validate a valid update', () => {
      const result = updateVenueSchema.safeParse(validUpdate);
      expect(result.success).toBe(true);
    });

    it('should require id', () => {
      const result = updateVenueSchema.safeParse({ name: 'No ID' });
      expect(result.success).toBe(false);
    });

    it('should require leagueId when visibility is LEAGUE', () => {
      const input = {
        ...validUpdate,
        visibility: 'LEAGUE',
      };

      const result = updateVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const leagueIdError = result.error.issues.find(
          (issue) => issue.path.includes('leagueId')
        );
        expect(leagueIdError).toBeDefined();
      }
    });

    it('should require teamId when visibility is TEAM', () => {
      const input = {
        ...validUpdate,
        visibility: 'TEAM',
      };

      const result = updateVenueSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const teamIdError = result.error.issues.find(
          (issue) => issue.path.includes('teamId')
        );
        expect(teamIdError).toBeDefined();
      }
    });

    it('should accept LEAGUE visibility with leagueId', () => {
      const input = {
        ...validUpdate,
        visibility: 'LEAGUE',
        leagueId: 'clabcdef1234567890',
      };

      const result = updateVenueSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept TEAM visibility with teamId', () => {
      const input = {
        ...validUpdate,
        visibility: 'TEAM',
        teamId: 'clabcdef1234567890',
      };

      const result = updateVenueSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('venueAvailabilitySchema', () => {
    it('should validate a complete availability check', () => {
      const input = {
        venueId: 'clabcdef1234567890',
        startAt: '2025-01-01T10:00:00Z',
        endAt: '2025-01-01T12:00:00Z',
      };

      const result = venueAvailabilitySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject endAt before startAt', () => {
      const input = {
        venueId: 'clabcdef1234567890',
        startAt: '2025-01-01T12:00:00Z',
        endAt: '2025-01-01T10:00:00Z',
      };

      const result = venueAvailabilitySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept excludeEventId', () => {
      const input = {
        venueId: 'clabcdef1234567890',
        startAt: '2025-01-01T10:00:00Z',
        endAt: '2025-01-01T12:00:00Z',
        excludeEventId: 'clxxxxxxxxxxxxxx00',
      };

      const result = venueAvailabilitySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid venueId format', () => {
      const input = {
        venueId: 'not-a-cuid',
        startAt: '2025-01-01T10:00:00Z',
        endAt: '2025-01-01T12:00:00Z',
      };

      const result = venueAvailabilitySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
