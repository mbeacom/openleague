/**
 * Umami Analytics Tracking Utilities
 *
 * This module provides type-safe wrappers for Umami event tracking.
 * It handles the window.umami object safely and provides clear event types.
 */

// Extend the Window interface to include umami
declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void;
      identify: (idOrData: string | Record<string, unknown>, data?: Record<string, unknown>) => void;
    };
  }
}

/**
 * Track a custom event with optional data
 * Safely checks if umami is available before tracking
 */
export function trackEvent(eventName: string, data?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && window.umami) {
    try {
      window.umami.track(eventName, data);
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }
}

/**
 * Identify a user session with custom data
 */
export function identifyUser(userId: string, userData?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && window.umami) {
    try {
      window.umami.identify(userId, userData);
    } catch (error) {
      console.error('Error identifying user:', error);
    }
  }
}

/**
 * Predefined event names for consistency across the app
 */
export const UmamiEvents = {
  // Authentication events
  SIGNUP: 'user-signup',
  LOGIN: 'user-login',
  LOGOUT: 'user-logout',

  // Team events
  TEAM_CREATE: 'team-create',
  TEAM_JOIN: 'team-join',
  TEAM_LEAVE: 'team-leave',

  // Roster events
  PLAYER_ADD: 'player-add',
  PLAYER_UPDATE: 'player-update',
  PLAYER_REMOVE: 'player-remove',

  // Event/Game events
  EVENT_CREATE: 'event-create',
  EVENT_UPDATE: 'event-update',
  EVENT_DELETE: 'event-delete',
  GAME_CREATE: 'game-create',
  PRACTICE_CREATE: 'practice-create',

  // RSVP events
  RSVP_GOING: 'rsvp-going',
  RSVP_NOT_GOING: 'rsvp-not-going',
  RSVP_MAYBE: 'rsvp-maybe',

  // Invitation events
  INVITATION_SEND: 'invitation-send',
  INVITATION_ACCEPT: 'invitation-accept',
  INVITATION_DECLINE: 'invitation-decline',

  // Navigation events
  VIEW_CALENDAR: 'view-calendar',
  VIEW_ROSTER: 'view-roster',
  VIEW_EVENTS: 'view-events',
  VIEW_DASHBOARD: 'view-dashboard',

  // League events
  LEAGUE_CREATE: 'league-create',
  LEAGUE_JOIN: 'league-join',
  DIVISION_CREATE: 'division-create',
  INTER_TEAM_GAME_CREATE: 'inter-team-game-create',

  // Feature usage
  EMAIL_NOTIFICATION_SENT: 'email-notification-sent',
  CALENDAR_FILTER_USED: 'calendar-filter-used',
  EXPORT_CALENDAR: 'export-calendar',
} as const;

/**
 * Type for event names
 */
export type UmamiEventName = typeof UmamiEvents[keyof typeof UmamiEvents];

/**
 * Helper to track authentication events
 */
export function trackAuth(action: 'signup' | 'login' | 'logout', data?: Record<string, unknown>): void {
  const eventMap = {
    signup: UmamiEvents.SIGNUP,
    login: UmamiEvents.LOGIN,
    logout: UmamiEvents.LOGOUT,
  };
  trackEvent(eventMap[action], data);
}

/**
 * Helper to track team-related events
 */
export function trackTeam(action: 'create' | 'join' | 'leave', data?: Record<string, unknown>): void {
  const eventMap = {
    create: UmamiEvents.TEAM_CREATE,
    join: UmamiEvents.TEAM_JOIN,
    leave: UmamiEvents.TEAM_LEAVE,
  };
  trackEvent(eventMap[action], data);
}

/**
 * Helper to track event/game creation
 */
export function trackEventAction(
  action: 'create' | 'update' | 'delete',
  eventType: 'game' | 'practice' | 'event',
  data?: Record<string, unknown>
): void {
  if (action === 'create') {
    const eventMap = {
      game: UmamiEvents.GAME_CREATE,
      practice: UmamiEvents.PRACTICE_CREATE,
      event: UmamiEvents.EVENT_CREATE,
    };
    trackEvent(eventMap[eventType], data);
  } else if (action === 'update') {
    trackEvent(UmamiEvents.EVENT_UPDATE, { ...data, eventType });
  } else if (action === 'delete') {
    trackEvent(UmamiEvents.EVENT_DELETE, { ...data, eventType });
  }
}

/**
 * Helper to track RSVP actions
 */
export function trackRSVP(status: 'going' | 'not-going' | 'maybe', data?: Record<string, unknown>): void {
  const eventMap = {
    going: UmamiEvents.RSVP_GOING,
    'not-going': UmamiEvents.RSVP_NOT_GOING,
    maybe: UmamiEvents.RSVP_MAYBE,
  };
  trackEvent(eventMap[status], data);
}
