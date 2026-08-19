/**
 * Permission identifiers, with no imports.
 *
 * Extracted from lib/utils/permissions.ts for the same reason as
 * lib/utils/access-levels.ts: this is a *runtime* enum that client components
 * and mocked tests need, while permissions.ts reaches Prisma and the session
 * helpers — and therefore next-auth, which cannot be resolved in a browser
 * bundle or a unit test that stubs the module.
 *
 * permissions.ts re-exports everything here, so existing importers are
 * unchanged.
 */
export enum Permission {
    // League management
    CREATE_LEAGUE = "create_league",
    UPDATE_LEAGUE = "update_league",
    DELETE_LEAGUE = "delete_league",
    VIEW_LEAGUE = "view_league",

    // Team management
    CREATE_TEAM = "create_team",
    UPDATE_TEAM = "update_team",
    DELETE_TEAM = "delete_team",
    VIEW_TEAM = "view_team",
    MIGRATE_TEAM = "migrate_team",

    // Division management
    CREATE_DIVISION = "create_division",
    UPDATE_DIVISION = "update_division",
    DELETE_DIVISION = "delete_division",
    ASSIGN_TEAM_TO_DIVISION = "assign_team_to_division",

    // Player management
    ADD_PLAYER = "add_player",
    UPDATE_PLAYER = "update_player",
    REMOVE_PLAYER = "remove_player",
    TRANSFER_PLAYER = "transfer_player",
    VIEW_PLAYER_DETAILS = "view_player_details",
    VIEW_EMERGENCY_CONTACTS = "view_emergency_contacts",

    // Event management
    CREATE_EVENT = "create_event",
    UPDATE_EVENT = "update_event",
    DELETE_EVENT = "delete_event",
    CREATE_INTER_TEAM_GAME = "create_inter_team_game",

    // Communication
    SEND_LEAGUE_MESSAGE = "send_league_message",
    SEND_LEAGUE_ANNOUNCEMENT = "send_league_announcement",
    SEND_TEAM_MESSAGE = "send_team_message",

    // User management
    ASSIGN_LEAGUE_ROLE = "assign_league_role",
    ASSIGN_TEAM_ROLE = "assign_team_role",
    INVITE_USER = "invite_user",

    // Reporting and data
    EXPORT_LEAGUE_DATA = "export_league_data",
    EXPORT_TEAM_DATA = "export_team_data",
    VIEW_LEAGUE_REPORTS = "view_league_reports",
    VIEW_FINANCIAL_REPORTS = "view_financial_reports",

    // League-owned gear. Team-admin grants must always be evaluated with the
    // requested team ID, while inventory and public wishlist administration
    // remain league-admin operations.
    MANAGE_GEAR_INVENTORY = "manage_gear_inventory",
    MANAGE_GEAR_WISHLIST = "manage_gear_wishlist",
    CREATE_TEAM_GEAR_NEED = "create_team_gear_need",
    REQUEST_TEAM_GEAR = "request_team_gear",
}

export const TEAM_SCOPED_PERMISSIONS = [
    Permission.UPDATE_TEAM,
    Permission.DELETE_TEAM,
    Permission.ADD_PLAYER,
    Permission.UPDATE_PLAYER,
    Permission.REMOVE_PLAYER,
    Permission.CREATE_EVENT,
    Permission.UPDATE_EVENT,
    Permission.DELETE_EVENT,
    Permission.SEND_TEAM_MESSAGE,
    Permission.EXPORT_TEAM_DATA,
    Permission.CREATE_TEAM_GEAR_NEED,
    Permission.REQUEST_TEAM_GEAR,
] as const;

export type TeamScopedPermission = (typeof TEAM_SCOPED_PERMISSIONS)[number];
