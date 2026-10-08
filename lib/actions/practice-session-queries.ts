"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import type { EquipmentCountItem, PlayData, SessionItem, SessionRow, SessionStaffMember, StaffOption, TeamMark } from "@/types/practice-planner";
import { readPracticeEquipment } from "@/lib/utils/equipment-needs";
import { isBlockKind, toRowKind } from "@/lib/utils/session-rows";
import { drillTags } from "@/lib/utils/drill-tags";
import { toAgeGroups } from "@/lib/utils/age-groups";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import type { SegmentKind } from "@prisma/client";
import { normalizeGroups } from "@/lib/utils/session-timeline";
import { TEAM_OFFICIAL_ROLE_LABELS } from "@/lib/utils/validation";
import { toStaffName } from "@/lib/utils/session-staff";
import { parseId } from "@/lib/utils/ids";
import { canViewPracticeSession } from "@/lib/utils/practice-access";
import { PRACTICE_ROSTER_SELECT, readPracticeRoster } from "@/lib/services/practice-session-roster";
import { toRosterNumber, type PracticeRoster, type RosterOption } from "@/lib/utils/practice-roster";

/**
 * Get the practice planner list page data for the user's primary team.
 * Returns null if the user has no team membership.
 */
export async function getPracticePlannerListData(): Promise<{
  teamId: string;
  teamName: string;
  isAdmin: boolean;
  sessions: Array<{
    id: string;
    title: string;
    date: string;
    duration: number;
    isShared: boolean;
    createdByName: string;
    playCount: number;
    firstPlayThumbnail: string | null;
  }>;
} | null> {
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    include: { team: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  const teamId = teamMember.team.id;
  const isAdmin = teamMember.role === "ADMIN";

  const sessions = await prisma.practiceSession.findMany({
    where: {
      teamId,
      ...(isAdmin ? {} : { isShared: true }),
    },
    orderBy: { date: "desc" },
    include: {
      createdBy: { select: { name: true } },
      plays: {
        where: { kind: "drill" },
        select: { play: { select: { thumbnail: true } } },
        orderBy: { sequence: "asc" },
        take: 1,
      },
      _count: { select: { plays: { where: { kind: "drill" } } } },
    },
  });

  return {
    teamId,
    teamName: teamMember.team.name,
    isAdmin,
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date.toISOString(),
      duration: s.duration,
      isShared: s.isShared,
      createdByName: s.createdBy.name || "Unknown",
      playCount: s._count.plays,
      firstPlayThumbnail: s.plays[0]?.play?.thumbnail || null,
    })),
  };
}

/**
 * Get a single practice session detail page data.
 * Returns null if the session is not found or user has no access.
 */
export async function getPracticeSessionDetail(sessionId: string): Promise<{
  session: {
    id: string;
    title: string;
    date: string;
    duration: number;
    isShared: boolean;
    createdByName: string;
    teamId: string;
    teamName: string;
    teamMark: TeamMark;
    // Optional venue attachment (FR-019, feature 006)
    venueId: string | null;
    venueName: string | null;
    /** The booked venue's IANA zone (3b); null when no venue is attached. */
    venueTimezone: string | null;
    surfaceId: string | null;
    surfaceName: string | null;
    segmentId: string | null;
    segmentName: string | null;
    segmentKind: SegmentKind | null;
    startAt: string | null;
    goaliesAttending: number | null;
    /** Minutes between blocks (practice timing). */
    transitionMinutes: number;
    /** The practice's staff (spec R9); rows name them by id. */
    staff: SessionStaffMember[];
    /** The practice's own equipment (practice equipment spec R3). */
    equipment: EquipmentCountItem[];
    /** The practice's roster (roster spec R15); null = none. */
    roster: PracticeRoster | null;
    plays: SessionRow[];
  };
  isAdmin: boolean;
} | null> {
  const parsedSessionId = parseId(sessionId);
  if (!parsedSessionId) return null;
  sessionId = parsedSessionId;
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      createdBy: { select: { name: true } },
      plays: {
        orderBy: { sequence: "asc" },
        include: {
          play: {
            select: {
              id: true,
              name: true,
              description: true,
              thumbnail: true,
              playData: true,
              focus: true,
              goalies: true,
              ageGroups: true,
            },
          },
          staff: { orderBy: { position: "asc" }, select: { staffId: true } },
        },
      },
      team: { select: { id: true, name: true, logoUrl: true, brandPrimaryColor: true } },
      venue: { select: { name: true, timezone: true } },
      surface: { select: { name: true } },
      segment: { select: { name: true, kind: true } },
      staff: { orderBy: { position: "asc" }, select: { id: true, name: true } },
      rosterPlayers: PRACTICE_ROSTER_SELECT.rosterPlayers,
    },
  });

  if (!session) return null;

  const membership = await prisma.teamMember.findFirst({
    where: { userId, teamId: session.teamId },
  });

  if (!membership || !canViewPracticeSession(membership.role, session.isShared)) return null;
  const isAdmin = membership.role === "ADMIN";

  return {
    session: {
      id: session.id,
      title: session.title,
      date: session.date.toISOString(),
      duration: session.duration,
      isShared: session.isShared,
      createdByName: session.createdBy.name || "Unknown",
      teamId: session.team.id,
      teamName: session.team.name,
      teamMark: {
        id: session.team.id,
        name: session.team.name,
        logoUrl: session.team.logoUrl ?? null,
        color: session.team.brandPrimaryColor ?? null,
      },
      venueId: session.venueId,
      venueName: session.venue?.name ?? null,
      venueTimezone: session.venue?.timezone ?? null,
      surfaceId: session.surfaceId,
      surfaceName: session.surface?.name ?? null,
      segmentId: session.segmentId,
      segmentName: session.segment?.name ?? null,
      segmentKind: session.segment?.kind ?? null,
      startAt: session.startAt ? session.startAt.toISOString() : null,
      goaliesAttending: session.goaliesAttending ?? null,
      transitionMinutes: session.transitionMinutes ?? 0,
      staff: session.staff.map((member) => ({ id: member.id, name: member.name })),
      equipment: readPracticeEquipment(session.equipment),
      roster: readPracticeRoster(session),
      plays: session.plays.flatMap((sp): SessionRow[] => {
        const kind = toRowKind(sp.kind);
        if (isBlockKind(kind)) {
          return [{ id: sp.id, kind, label: sp.label ?? null, sequence: sp.sequence, duration: sp.duration ?? 0, instructions: sp.instructions, runsWithPrevious: false, staff: sp.staff.map((assignment) => assignment.staffId) }];
        }
        // Every drill row has its play (CHECK practice_session_plays_kind_play_check).
        if (!sp.play) return [];
        const play = sp.play;
        return [{
          id: sp.id,
          sequence: sp.sequence,
          duration: sp.duration ?? 0,
          instructions: sp.instructions,
          runsWithPrevious: sp.runsWithPrevious,
          stays: sp.stays ?? false,
          rotateEveryMinutes: sp.rotateEveryMinutes ?? null,
          staff: sp.staff.map((assignment) => assignment.staffId),
          play: {
            id: play.id,
            name: play.name,
            description: play.description,
            thumbnail: play.thumbnail,
            ...drillTags(play),
            ageGroups: toAgeGroups(play.ageGroups),
            playData: (() => {
              const parsed = parseStoredPlayData(play.playData);
              if (!parsed.ok) console.error(`Unreadable playData (play ${play.id}):`, parsed.error);
              return parsed.ok ? parsed.data : null;
            })(),
          },
        }];
      }),
    },
    isAdmin,
  };
}

/** What the session detail page and the bench sheet read (3b). */
export type PracticeSessionDetail = NonNullable<Awaited<ReturnType<typeof getPracticeSessionDetail>>>;

/**
 * An unreadable diagram becomes an empty board (logged) flagged
 * `playDataUnreadable`, so the editor's station warnings skip the drill
 * instead of reading its missing area as full ice (2b).
 */
function editorPlayData(raw: unknown, playId: string): { playData: PlayData; playDataUnreadable?: true } {
  const parsed = parseStoredPlayData(raw);
  if (parsed.ok) return { playData: parsed.data };
  console.error(`Unreadable playData (play ${playId}):`, parsed.error);
  return { playData: createEmptyPlayData(), playDataUnreadable: true };
}

/**
 * Get a practice session for editing (admin only).
 * Returns null if not found or user is not an admin for the team.
 */
export async function getPracticeSessionForEdit(sessionId: string): Promise<{
  sessionId: string;
  teamId: string;
  initialData: {
    title: string;
    date: Date;
    duration: number;
    isShared: boolean;
    // Optional venue attachment (FR-019, feature 006)
    venueId: string | null;
    surfaceId: string | null;
    segmentId: string | null;
    startAt: Date | null;
    goaliesAttending: number | null;
    /** Minutes between blocks (practice timing). */
    transitionMinutes: number;
    /** The practice's staff; a stale link loads unlinked (spec R4). */
    staff: SessionStaffMember[];
    /** The practice's own equipment (practice equipment spec R3). */
    equipment: EquipmentCountItem[];
    /** The practice's roster (roster spec R7); null = none. */
    roster: PracticeRoster | null;
    plays: SessionItem[];
  };
} | null> {
  const parsedSessionId = parseId(sessionId);
  if (!parsedSessionId) return null;
  sessionId = parsedSessionId;
  const userId = await requireUserId();

  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      plays: {
        orderBy: { sequence: "asc" },
        include: {
          play: {
            select: {
              id: true,
              name: true,
              description: true,
              thumbnail: true,
              playData: true,
              focus: true,
              goalies: true,
              ageGroups: true,
            },
          },
          staff: { orderBy: { position: "asc" }, select: { staffId: true } },
        },
      },
      staff: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, teamOfficialId: true, userId: true, teamOfficial: { select: { status: true } } },
      },
      rosterPlayers: PRACTICE_ROSTER_SELECT.rosterPlayers,
    },
  });

  if (!session) return null;

  const membership = await prisma.teamMember.findFirst({
    where: { userId, teamId: session.teamId, role: "ADMIN" },
  });

  if (!membership) return null;

  // A link that went stale (an official removed, an admin demoted) loads unlinked, so this
  // editor's saves aren't refused for it (spec R4); its next save stores the name typed.
  const linkedUsers = session.staff.flatMap((member) => (member.userId ? [member.userId] : []));
  const admins = new Set(
    linkedUsers.length === 0
      ? []
      : (
          await prisma.teamMember.findMany({
            where: { teamId: session.teamId, role: "ADMIN", userId: { in: linkedUsers } },
            select: { userId: true },
          })
        ).map((admin) => admin.userId),
  );
  const activeOfficial = (status: string | undefined) => status === "ACTIVE" || status === "INVITED";

  return {
    sessionId: session.id,
    teamId: session.teamId,
    initialData: {
      title: session.title,
      date: session.date,
      duration: session.duration,
      isShared: session.isShared,
      venueId: session.venueId,
      surfaceId: session.surfaceId,
      segmentId: session.segmentId,
      startAt: session.startAt,
      goaliesAttending: session.goaliesAttending ?? null,
      transitionMinutes: session.transitionMinutes ?? 0,
      equipment: readPracticeEquipment(session.equipment),
      staff: session.staff.map((member) => ({
        id: member.id,
        name: member.name,
        teamOfficialId: member.teamOfficialId && activeOfficial(member.teamOfficial?.status) ? member.teamOfficialId : null,
        userId: member.userId && admins.has(member.userId) ? member.userId : null,
      })),
      roster: readPracticeRoster(session),
      // Plays are ordered by sequence asc. Before 3a, deleting a library play
      // cascaded its PracticeSessionPlay row away and could leave gaps (e.g.
      // 0,2), which the save validator rejects, or a block's stations without
      // their first drill. normalizeGroups renumbers to consecutive 0-based
      // indices and clears the first drill's station flag (2b).
      plays: normalizeGroups(session.plays.flatMap((sp): SessionItem[] => {
        const kind = toRowKind(sp.kind);
        if (isBlockKind(kind)) {
          return [{ id: sp.id, kind, label: sp.label ?? "", sequence: sp.sequence, duration: sp.duration ?? 0, instructions: sp.instructions || "", runsWithPrevious: false, staff: sp.staff.map((assignment) => assignment.staffId) }];
        }
        if (!sp.play) return [];
        return [{
          id: sp.id,
          playId: sp.play.id,
          name: sp.play.name,
          description: sp.play.description ?? "",
          sequence: sp.sequence,
          runsWithPrevious: sp.runsWithPrevious,
          duration: sp.duration ?? 0,
          instructions: sp.instructions || "",
          // Loaded so an untouched editor saves them back unchanged.
          stays: sp.stays ?? false,
          rotateEveryMinutes: sp.rotateEveryMinutes ?? null,
          staff: sp.staff.map((assignment) => assignment.staffId),
          ...drillTags(sp.play),
          ageGroups: toAgeGroups(sp.play.ageGroups),
          ...editorPlayData(sp.play.playData, sp.play.id),
          thumbnail: sp.play.thumbnail || "",
        }];
      })),
    },
  };
}

/**
 * Get play library page access context.
 * Returns null if user has no team membership.
 * Returns { teamId, isAdmin } — caller redirects if not admin.
 */
export async function getPlayLibraryContext(): Promise<{
  teamId: string;
  teamName: string;
  isAdmin: boolean;
} | null> {
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    include: { team: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  return {
    teamId: teamMember.team.id,
    teamName: teamMember.team.name,
    isAdmin: teamMember.role === "ADMIN",
  };
}

/**
 * Teams the current user may import a practice plan into (ADR-0020): those
 * where createPracticeSession's scheduler check passes without a reservation,
 * i.e. a team ADMIN membership (requireTeamAdmin has no isActive filter, so
 * neither does this).
 */
export async function getPlanImportTeams(): Promise<Array<{ id: string; name: string }>> {
  const userId = await requireUserId();
  const memberships = await prisma.teamMember.findMany({
    where: { userId, role: "ADMIN" },
    select: { team: { select: { id: true, name: true } } },
    orderBy: { team: { name: "asc" } },
  });
  return memberships.map((membership) => membership.team);
}

// Not exported: a "use server" file may export only async functions.
const staffOptionsTeamIdSchema = z.string().cuid("Invalid team ID format");

/**
 * The hosted Staff picker (spec R4): the team's active and invited officials,
 * then its admins who aren't officials, by display name and role label. Admin
 * callers only; nothing here selects or returns an email. An official who is
 * also an admin appears once, as the official; an admin with no name is left
 * out (a coach can type one), as is an official whose name cleans to nothing.
 * Names are offered cut to 60 characters. A team id that isn't a cuid string
 * gets nothing, before any query.
 */
export async function getPracticeStaffOptions(teamId: string): Promise<StaffOption[]> {
  if (!staffOptionsTeamIdSchema.safeParse(teamId).success) return [];
  const userId = await requireUserId();
  const admin = await prisma.teamMember.findFirst({
    where: { userId, teamId, role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) return [];

  const [officials, admins] = await Promise.all([
    prisma.teamOfficial.findMany({
      where: { teamId, status: { in: ["ACTIVE", "INVITED"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true, userId: true },
    }),
    prisma.teamMember.findMany({
      where: { teamId, role: "ADMIN" },
      orderBy: { joinedAt: "asc" },
      select: { userId: true, user: { select: { name: true } } },
    }),
  ]);
  const officialUsers = new Set(officials.flatMap((official) => (official.userId ? [official.userId] : [])));
  return [
    ...officials.flatMap((official): StaffOption[] => {
      const name = toStaffName(official.name);
      return name ? [{ kind: "official", id: official.id, name, roleLabel: TEAM_OFFICIAL_ROLE_LABELS[official.role] }] : [];
    }),
    ...admins.flatMap((member): StaffOption[] => {
      const name = toStaffName(member.user.name ?? "");
      return name && !officialUsers.has(member.userId) ? [{ kind: "admin", id: member.userId, name, roleLabel: "Team admin" }] : [];
    }),
  ];
}

/**
 * What the roster picker reads of a Player (roster spec R8): the name, jersey
 * number and free-text position only. Never a contact, birth date, membership
 * id or guardian. A guard test reads this select.
 */
const ROSTER_OPTION_SELECT = { id: true, name: true, jerseyNumber: true, position: true } as const;

/**
 * The roster's "Add from team" (roster spec R8): the team's players, by
 * jersey number then name. Admin callers only, as the Staff picker. A team id
 * that isn't a cuid string gets nothing, before any query.
 */
export async function getPracticeRosterOptions(teamId: string): Promise<RosterOption[]> {
  if (!staffOptionsTeamIdSchema.safeParse(teamId).success) return [];
  const userId = await requireUserId();
  const admin = await prisma.teamMember.findFirst({
    where: { userId, teamId, role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) return [];
  const players = await prisma.player.findMany({
    where: { teamId },
    orderBy: [{ jerseyNumber: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    select: ROSTER_OPTION_SELECT,
  });
  return players.map((player) => ({
    playerId: player.id,
    name: player.name,
    number: toRosterNumber(player.jerseyNumber ?? ""),
    position: player.position,
  }));
}
