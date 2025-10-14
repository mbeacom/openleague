/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  trackEvent,
  identifyUser,
  trackAuth,
  trackTeam,
  trackEventAction,
  trackRSVP,
  UmamiEvents,
} from '@/lib/analytics/umami';

describe('Umami Analytics Utilities', () => {
  beforeEach(() => {
    // Reset window.umami before each test
    if (typeof window !== 'undefined') {
      delete (window as any).umami;
    }
    vi.clearAllMocks();
  });

  describe('trackEvent', () => {
    it('should track event when umami is available', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEvent('test-event', { foo: 'bar' });

      expect(mockTrack).toHaveBeenCalledWith('test-event', { foo: 'bar' });
      expect(mockTrack).toHaveBeenCalledTimes(1);
    });

    it('should track event without data', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEvent('test-event');

      expect(mockTrack).toHaveBeenCalledWith('test-event', undefined);
      expect(mockTrack).toHaveBeenCalledTimes(1);
    });

    it('should not throw error when umami is not available', () => {
      expect(() => trackEvent('test-event')).not.toThrow();
    });

    it('should not throw error when window is undefined', () => {
      const originalWindow = global.window;
      delete (global as any).window;

      expect(() => trackEvent('test-event')).not.toThrow();

      global.window = originalWindow;
    });

    it('should handle errors gracefully when track throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockTrack = vi.fn().mockImplementation(() => {
        throw new Error('Track failed');
      });
      (window as any).umami = { track: mockTrack };

      expect(() => trackEvent('test-event')).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error tracking event:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('identifyUser', () => {
    it('should identify user with ID and data when umami is available', () => {
      const mockIdentify = vi.fn();
      (window as any).umami = { identify: mockIdentify };

      identifyUser('user-123', { role: 'admin' });

      expect(mockIdentify).toHaveBeenCalledWith('user-123', { role: 'admin' });
      expect(mockIdentify).toHaveBeenCalledTimes(1);
    });

    it('should identify user with ID only', () => {
      const mockIdentify = vi.fn();
      (window as any).umami = { identify: mockIdentify };

      identifyUser('user-123');

      expect(mockIdentify).toHaveBeenCalledWith('user-123', undefined);
      expect(mockIdentify).toHaveBeenCalledTimes(1);
    });

    it('should not throw error when umami is not available', () => {
      expect(() => identifyUser('user-123')).not.toThrow();
    });

    it('should handle errors gracefully when identify throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockIdentify = vi.fn().mockImplementation(() => {
        throw new Error('Identify failed');
      });
      (window as any).umami = { identify: mockIdentify };

      expect(() => identifyUser('user-123')).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error identifying user:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('UmamiEvents constants', () => {
    it('should have authentication event names', () => {
      expect(UmamiEvents.SIGNUP).toBe('user-signup');
      expect(UmamiEvents.LOGIN).toBe('user-login');
      expect(UmamiEvents.LOGOUT).toBe('user-logout');
    });

    it('should have team event names', () => {
      expect(UmamiEvents.TEAM_CREATE).toBe('team-create');
      expect(UmamiEvents.TEAM_JOIN).toBe('team-join');
      expect(UmamiEvents.TEAM_LEAVE).toBe('team-leave');
    });

    it('should have event/game event names', () => {
      expect(UmamiEvents.EVENT_CREATE).toBe('event-create');
      expect(UmamiEvents.EVENT_UPDATE).toBe('event-update');
      expect(UmamiEvents.EVENT_DELETE).toBe('event-delete');
      expect(UmamiEvents.GAME_CREATE).toBe('game-create');
      expect(UmamiEvents.PRACTICE_CREATE).toBe('practice-create');
    });

    it('should have RSVP event names', () => {
      expect(UmamiEvents.RSVP_GOING).toBe('rsvp-going');
      expect(UmamiEvents.RSVP_NOT_GOING).toBe('rsvp-not-going');
      expect(UmamiEvents.RSVP_MAYBE).toBe('rsvp-maybe');
    });

    it('should have invitation event names', () => {
      expect(UmamiEvents.INVITATION_SEND).toBe('invitation-send');
      expect(UmamiEvents.INVITATION_ACCEPT).toBe('invitation-accept');
      expect(UmamiEvents.INVITATION_DECLINE).toBe('invitation-decline');
    });

    it('should have navigation event names', () => {
      expect(UmamiEvents.VIEW_CALENDAR).toBe('view-calendar');
      expect(UmamiEvents.VIEW_ROSTER).toBe('view-roster');
      expect(UmamiEvents.VIEW_EVENTS).toBe('view-events');
      expect(UmamiEvents.VIEW_DASHBOARD).toBe('view-dashboard');
    });

    it('should have league event names', () => {
      expect(UmamiEvents.LEAGUE_CREATE).toBe('league-create');
      expect(UmamiEvents.LEAGUE_JOIN).toBe('league-join');
      expect(UmamiEvents.DIVISION_CREATE).toBe('division-create');
      expect(UmamiEvents.INTER_TEAM_GAME_CREATE).toBe('inter-team-game-create');
    });

    it('should have feature usage event names', () => {
      expect(UmamiEvents.EMAIL_NOTIFICATION_SENT).toBe('email-notification-sent');
      expect(UmamiEvents.CALENDAR_FILTER_USED).toBe('calendar-filter-used');
      expect(UmamiEvents.EXPORT_CALENDAR).toBe('export-calendar');
    });

    it('should have roster event names', () => {
      expect(UmamiEvents.PLAYER_ADD).toBe('player-add');
      expect(UmamiEvents.PLAYER_UPDATE).toBe('player-update');
      expect(UmamiEvents.PLAYER_REMOVE).toBe('player-remove');
    });
  });

  describe('trackAuth helper', () => {
    it('should track signup event', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackAuth('signup', { hasInvitation: true });

      expect(mockTrack).toHaveBeenCalledWith('user-signup', { hasInvitation: true });
    });

    it('should track login event', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackAuth('login');

      expect(mockTrack).toHaveBeenCalledWith('user-login', undefined);
    });

    it('should track logout event', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackAuth('logout', { sessionDuration: 3600 });

      expect(mockTrack).toHaveBeenCalledWith('user-logout', { sessionDuration: 3600 });
    });

    it('should work without umami configured', () => {
      expect(() => trackAuth('signup')).not.toThrow();
    });
  });

  describe('trackTeam helper', () => {
    it('should track team create event', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackTeam('create', { sport: 'Soccer', season: 'Fall 2025' });

      expect(mockTrack).toHaveBeenCalledWith('team-create', { sport: 'Soccer', season: 'Fall 2025' });
    });

    it('should track team join event', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackTeam('join', { teamId: 'team-123' });

      expect(mockTrack).toHaveBeenCalledWith('team-join', { teamId: 'team-123' });
    });

    it('should track team leave event', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackTeam('leave');

      expect(mockTrack).toHaveBeenCalledWith('team-leave', undefined);
    });

    it('should work without umami configured', () => {
      expect(() => trackTeam('create')).not.toThrow();
    });
  });

  describe('trackEventAction helper', () => {
    it('should track game creation', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEventAction('create', 'game', { hasOpponent: true });

      expect(mockTrack).toHaveBeenCalledWith('game-create', { hasOpponent: true });
    });

    it('should track practice creation', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEventAction('create', 'practice', { duration: 90 });

      expect(mockTrack).toHaveBeenCalledWith('practice-create', { duration: 90 });
    });

    it('should track generic event creation', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEventAction('create', 'event');

      expect(mockTrack).toHaveBeenCalledWith('event-create', undefined);
    });

    it('should track event update with event type', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEventAction('update', 'game', { eventId: 'event-123' });

      expect(mockTrack).toHaveBeenCalledWith('event-update', { eventId: 'event-123', eventType: 'game' });
    });

    it('should track event deletion with event type', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEventAction('delete', 'practice', { eventId: 'event-456' });

      expect(mockTrack).toHaveBeenCalledWith('event-delete', { eventId: 'event-456', eventType: 'practice' });
    });

    it('should work without umami configured', () => {
      expect(() => trackEventAction('create', 'game')).not.toThrow();
    });
  });

  describe('trackRSVP helper', () => {
    it('should track going RSVP', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackRSVP('going', { eventId: 'event-123' });

      expect(mockTrack).toHaveBeenCalledWith('rsvp-going', { eventId: 'event-123' });
    });

    it('should track not-going RSVP', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackRSVP('not-going', { eventId: 'event-456', reason: 'conflict' });

      expect(mockTrack).toHaveBeenCalledWith('rsvp-not-going', { eventId: 'event-456', reason: 'conflict' });
    });

    it('should track maybe RSVP', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackRSVP('maybe', { eventId: 'event-789' });

      expect(mockTrack).toHaveBeenCalledWith('rsvp-maybe', { eventId: 'event-789' });
    });

    it('should work without umami configured', () => {
      expect(() => trackRSVP('going')).not.toThrow();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle null data gracefully', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEvent('test-event', undefined);

      expect(mockTrack).toHaveBeenCalledWith('test-event', undefined);
    });

    it('should handle empty objects as data', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEvent('test-event', {});

      expect(mockTrack).toHaveBeenCalledWith('test-event', {});
    });

    it('should handle complex nested data', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      const complexData = {
        level1: {
          level2: {
            level3: 'value',
          },
          array: [1, 2, 3],
        },
        boolean: true,
        number: 42,
      };

      trackEvent('test-event', complexData);

      expect(mockTrack).toHaveBeenCalledWith('test-event', complexData);
    });

    it('should handle special characters in event names', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackEvent('test-event-with-dashes_and_underscores');

      expect(mockTrack).toHaveBeenCalledWith('test-event-with-dashes_and_underscores', undefined);
    });
  });

  describe('Multiple consecutive calls', () => {
    it('should track multiple events in sequence', () => {
      const mockTrack = vi.fn();
      (window as any).umami = { track: mockTrack };

      trackAuth('login');
      trackTeam('create', { sport: 'Soccer' });
      trackRSVP('going', { eventId: '123' });

      expect(mockTrack).toHaveBeenCalledTimes(3);
      expect(mockTrack).toHaveBeenNthCalledWith(1, 'user-login', undefined);
      expect(mockTrack).toHaveBeenNthCalledWith(2, 'team-create', { sport: 'Soccer' });
      expect(mockTrack).toHaveBeenNthCalledWith(3, 'rsvp-going', { eventId: '123' });
    });
  });
});
