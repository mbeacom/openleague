"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserLeagueRole, isTeamAdmin, requireLeagueRole, requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { recordGearActivity } from "@/lib/services/gear-ledger";
import { reportGearActionFailure } from "@/lib/services/gear-observability";
import {
  type GearOutboxEvent,
  queueGearOutboxForLeagueAdmins,
  queueGearOutboxForRecipients,
} from "@/lib/services/gear-outbox";
import {
  GearConflictError,
  gearTransactionOptions,
  withGearSerializableRetry,
} from "@/lib/services/gear-transaction";
import { createTeamGearNeedSchema } from "@/lib/utils/validation";
import type { ActionResult } from "@/lib/actions/gear-inventory";

const gearId = z.string().cuid("Invalid gear identifier");
const needCommandSchema = z.object({
  leagueId: gearId,
  needId: gearId,
  expectedVersion: z.coerce.number().int().min(0),
});

type Tx = Prisma.TransactionClient;

export type GearNeedCapabilities = {
  canSubmit: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canFulfill: boolean;
};

export type GearNeedDto = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  notes: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "FULFILLED" | "CANCELED";
  version: number;
  submittedAt: string | null;
  approvedAt: string | null;
  fulfilledAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  canSubmit: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canFulfill: boolean;
  capabilities: GearNeedCapabilities;
  lines: Array<{
    id: string;
    catalogItemId: string | null;
    nameSnapshot: string;
    categorySnapshot: string | null;
    sizeSnapshot: string | null;
    trackingMode: "POOLED" | "INDIVIDUAL" | null;
    requestedQty: number;
    fulfilledQty: number;
    canceledQty: number;
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    status: "OPEN" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELED";
    notes: string | null;
    version: number;
  }>;
};

type NeedRecord = {
  id: string;
  teamId: string;
  title: string;
  notes: string | null;
  status: GearNeedDto["status"];
  version: number;
  submittedAt: Date | null;
  approvedAt: Date | null;
  fulfilledAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  team: { name: string };
  lines: GearNeedDto["lines"];
};

function needCapabilities(
  need: Pick<NeedRecord, "status">,
  isLeagueAdmin: boolean,
  isTeamAdminForNeed: boolean,
): GearNeedCapabilities {
  return {
    canSubmit: isTeamAdminForNeed && need.status === "DRAFT",
    canCancel: isTeamAdminForNeed && ["DRAFT", "SUBMITTED", "APPROVED"].includes(need.status),
    canApprove: isLeagueAdmin && need.status === "SUBMITTED",
    canFulfill: isLeagueAdmin && need.status === "APPROVED",
  };
}

function serializeNeed(
  need: NeedRecord,
  capabilities: ReturnType<typeof needCapabilities>,
): GearNeedDto {
  return {
    id: need.id,
    teamId: need.teamId,
    teamName: need.team.name,
    title: need.title,
    notes: need.notes,
    status: need.status,
    version: need.version,
    submittedAt: need.submittedAt?.toISOString() ?? null,
    approvedAt: need.approvedAt?.toISOString() ?? null,
    fulfilledAt: need.fulfilledAt?.toISOString() ?? null,
    canceledAt: need.canceledAt?.toISOString() ?? null,
    createdAt: need.createdAt.toISOString(),
    ...capabilities,
    capabilities,
    lines: need.lines,
  };
}

function needsPath(leagueId: string, teamId?: string) {
  return teamId
    ? `/league/${leagueId}/gear/needs/${teamId}`
    : `/league/${leagueId}/gear/needs`;
}

function invalid(message: string): never {
  throw new Error(`Gear validation: ${message}`);
}

function actionError(error: unknown): ActionResult<never> {
  reportGearActionFailure({ action: "need", error });
  if (error instanceof GearConflictError) return { success: false, error: error.message };
  if (error instanceof z.ZodError) {
    return { success: false, error: "Please correct the highlighted gear need fields.", details: error.issues };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("Unauthorized")) {
      return { success: false, error: "You do not have permission to manage this gear need." };
    }
    if (error.message.startsWith("Gear validation:")) {
      return { success: false, error: error.message.slice(17) };
    }
  }
  return { success: false, error: "Unable to update the gear need. Please try again." };
}

async function assertNeedAccess(leagueId: string, teamId: string, userId: string): Promise<boolean> {
  const role = await getUserLeagueRole(userId, leagueId);
  if (role === "LEAGUE_ADMIN") return true;

  const [team, teamAdmin] = await Promise.all([
    prisma.team.findFirst({
      where: { id: teamId, leagueId, isActive: true },
      select: { id: true },
    }),
    isTeamAdmin(userId, teamId),
  ]);
  if (!team || !teamAdmin) {
    throw new Error("Unauthorized: team admin access is required.");
  }
  return false;
}

async function assertTeamAdminNeedAccess(leagueId: string, teamId: string, userId: string): Promise<void> {
  const [team, teamAdmin] = await Promise.all([
    prisma.team.findFirst({
      where: { id: teamId, leagueId, isActive: true },
      select: { id: true },
    }),
    isTeamAdmin(userId, teamId),
  ]);
  if (!team || !teamAdmin) {
    throw new Error("Unauthorized: team admin access is required.");
  }
}

async function getNeedForMutation(tx: Tx, leagueId: string, needId: string) {
  const need = await tx.teamGearNeed.findFirst({
    where: { id: needId, leagueId, league: { isActive: true }, team: { leagueId, isActive: true } },
    include: { lines: true },
  });
  if (!need) invalid("Gear need not found in this league.");
  return need;
}

async function transitionNeed(
  input: unknown,
  target: "SUBMITTED" | "APPROVED" | "FULFILLED" | "CANCELED",
): Promise<ActionResult<{ id: string; status: string; version: number }>> {
  try {
    const validated = needCommandSchema.parse(input);
    const userId = target === "APPROVED" || target === "FULFILLED"
      ? await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN")
      : await requireUserId();

    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const need = await getNeedForMutation(tx, validated.leagueId, validated.needId);
      if (target === "SUBMITTED" || target === "CANCELED") {
        await assertTeamAdminNeedAccess(validated.leagueId, need.teamId, userId);
      }
      if (need.version !== validated.expectedVersion) throw new GearConflictError();

      const permitted: Record<typeof target, readonly string[]> = {
        SUBMITTED: ["DRAFT"],
        APPROVED: ["SUBMITTED"],
        FULFILLED: ["APPROVED"],
        CANCELED: ["DRAFT", "SUBMITTED", "APPROVED"],
      };
      if (!permitted[target].includes(need.status)) {
        invalid(`This gear need cannot transition from ${need.status.toLowerCase()} to ${target.toLowerCase()}.`);
      }

      const now = new Date();
      const update = await tx.teamGearNeed.updateMany({
        where: { id: need.id, version: need.version, status: need.status },
        data: {
          status: target,
          version: { increment: 1 },
          ...(target === "SUBMITTED" ? { submittedAt: now } : {}),
          ...(target === "APPROVED" ? { approvedAt: now } : {}),
          ...(target === "FULFILLED" ? { fulfilledAt: now } : {}),
          ...(target === "CANCELED" ? { canceledAt: now } : {}),
        },
      });
      if (update.count !== 1) throw new GearConflictError();

      if (target === "FULFILLED") {
        await Promise.all(
          need.lines
            .filter((line) => line.status !== "CANCELED")
            .map((line) => tx.teamGearNeedLine.update({
              where: { id: line.id },
              data: {
                fulfilledQty: line.requestedQty,
                status: "FULFILLED",
                version: { increment: 1 },
              },
            })),
        );
      } else if (target === "CANCELED") {
        await tx.teamGearNeedLine.updateMany({
          where: { needId: need.id, status: { not: "FULFILLED" } },
          data: { status: "CANCELED", version: { increment: 1 } },
        });
      }

      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "NEED",
        entityId: need.id,
        action: target.toLowerCase(),
        actorUserId: userId,
        details: { metadata: { teamId: need.teamId } },
      });
      const event: GearOutboxEvent = {
        leagueId: validated.leagueId,
        eventType: `gear.need.${target.toLowerCase()}`,
        occurrenceKey: `v${need.version + 1}`,
        aggregateType: "NEED" as const,
        aggregateId: need.id,
        payload: { kind: "GEAR_NEED", data: { needId: need.id, teamId: need.teamId, status: target } },
      };
      if (target === "SUBMITTED") {
        await queueGearOutboxForLeagueAdmins(tx, event);
      } else {
        const teamAdmins = await tx.teamMember.findMany({
          where: { teamId: need.teamId, role: "ADMIN" },
          select: { userId: true },
        });
        await queueGearOutboxForRecipients(tx, event, [
          ...teamAdmins.map((membership) => membership.userId),
          ...(need.createdById ? [need.createdById] : []),
        ]);
      }
      return { id: need.id, status: target, version: need.version + 1, teamId: need.teamId };
    }, gearTransactionOptions));

    revalidatePath(needsPath(validated.leagueId));
    revalidatePath(needsPath(validated.leagueId, result.teamId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function createTeamGearNeed(
  input: z.input<typeof createTeamGearNeedSchema>,
): Promise<ActionResult<{ id: string; version: number }>> {
  try {
    const validated = createTeamGearNeedSchema.parse(input);
    const userId = await requireUserId();
    await assertNeedAccess(validated.leagueId, validated.teamId, userId);

    const created = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const priorCommand = await tx.teamGearNeedCommand.findUnique({
        where: {
          leagueId_teamId_idempotencyKey: {
            leagueId: validated.leagueId,
            teamId: validated.teamId,
            idempotencyKey: validated.idempotencyKey,
          },
        },
        select: { need: { select: { id: true, version: true } } },
      });
      if (priorCommand) return priorCommand.need;

      const catalogIds = validated.lines
        .map((line) => line.catalogItemId)
        .filter((id): id is string => Boolean(id));
      const catalogItems = catalogIds.length === 0
        ? []
        : await tx.gearCatalogItem.findMany({
            where: { leagueId: validated.leagueId, id: { in: catalogIds }, isActive: true },
            select: { id: true, name: true, category: true, size: true, trackingMode: true },
          });
      const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
      if (catalogById.size !== new Set(catalogIds).size) {
        invalid("A selected catalog item is not active in this league.");
      }

      const need = await tx.teamGearNeed.create({
        data: {
          leagueId: validated.leagueId,
          teamId: validated.teamId,
          title: validated.title,
          notes: validated.notes || null,
          createdById: userId,
          lines: {
            create: validated.lines.map((line) => {
              const catalog = line.catalogItemId ? catalogById.get(line.catalogItemId) : undefined;
              return {
                catalogItemId: catalog?.id ?? null,
                nameSnapshot: catalog?.name ?? line.nameSnapshot,
                categorySnapshot: (catalog?.category ?? line.categorySnapshot) || null,
                sizeSnapshot: (catalog?.size ?? line.sizeSnapshot) || null,
                trackingMode: catalog?.trackingMode ?? line.trackingMode,
                requestedQty: line.requestedQty,
                priority: line.priority,
                notes: line.notes || null,
              };
            }),
          },
        },
        select: { id: true, version: true },
      });
      await tx.teamGearNeedCommand.create({
        data: {
          leagueId: validated.leagueId,
          teamId: validated.teamId,
          idempotencyKey: validated.idempotencyKey,
          needId: need.id,
        },
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "NEED",
        entityId: need.id,
        action: "created",
        actorUserId: userId,
        details: { metadata: { teamId: validated.teamId, lineCount: validated.lines.length } },
      });
      return need;
    }, gearTransactionOptions));

    revalidatePath(needsPath(validated.leagueId));
    revalidatePath(needsPath(validated.leagueId, validated.teamId));
    return { success: true, data: created };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const parsed = createTeamGearNeedSchema.safeParse(input);
      if (parsed.success) {
        const priorCommand = await prisma.teamGearNeedCommand.findUnique({
          where: {
            leagueId_teamId_idempotencyKey: {
              leagueId: parsed.data.leagueId,
              teamId: parsed.data.teamId,
              idempotencyKey: parsed.data.idempotencyKey,
            },
          },
          select: { need: { select: { id: true, version: true } } },
        });
        if (priorCommand) return { success: true, data: priorCommand.need };
      }
    }
    return actionError(error);
  }
}

export async function submitTeamGearNeed(input: unknown) {
  return transitionNeed(input, "SUBMITTED");
}

export async function approveTeamGearNeed(input: unknown) {
  return transitionNeed(input, "APPROVED");
}

export async function fulfillTeamGearNeed(input: unknown) {
  return transitionNeed(input, "FULFILLED");
}

export async function cancelTeamGearNeed(input: unknown) {
  return transitionNeed(input, "CANCELED");
}

export async function decideTeamGearNeed(input: unknown) {
  const parsed = z.object({
    leagueId: gearId,
    needId: gearId,
    expectedVersion: z.coerce.number().int().min(0),
    status: z.enum(["APPROVED", "CANCELED"]),
  }).parse(input);
  return transitionNeed(parsed, parsed.status);
}

export async function getGearNeedsContext(leagueId: string): Promise<{
  canManageAll: boolean;
  teamIds: string[];
  teams: Array<{ id: string; name: string }>;
  needs: GearNeedDto[];
} | null> {
  const userId = await requireUserId();
  const leagueRole = await getUserLeagueRole(userId, leagueId);
  if (!leagueRole) return null;

  const canManageAll = leagueRole === "LEAGUE_ADMIN";
  const [allTeams, teamAdminMemberships] = await Promise.all([
    canManageAll
      ? prisma.team.findMany({
        where: { leagueId, isActive: true },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    prisma.teamMember.findMany({
      where: { userId, role: "ADMIN", team: { leagueId, isActive: true } },
      select: { team: { select: { id: true, name: true } } },
    }),
  ]);
  const teamAdminIds = new Set(teamAdminMemberships.map((membership) => membership.team.id));
  const teams = canManageAll ? allTeams : teamAdminMemberships.map((membership) => membership.team);
  const teamIds = teams.map((team) => team.id);

  if (teamIds.length === 0) return { canManageAll, teamIds, teams, needs: [] };
  const needs = await prisma.teamGearNeed.findMany({
    where: { leagueId, teamId: { in: teamIds } },
    select: {
      id: true, teamId: true, title: true, notes: true, status: true, version: true,
      submittedAt: true, approvedAt: true, fulfilledAt: true, canceledAt: true, createdAt: true,
      team: { select: { name: true } },
      lines: {
        select: {
          id: true, catalogItemId: true, nameSnapshot: true, categorySnapshot: true, sizeSnapshot: true,
          trackingMode: true, requestedQty: true, fulfilledQty: true, canceledQty: true,
          priority: true, status: true, notes: true, version: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    canManageAll,
    teamIds,
    teams,
    needs: needs.map((need) => serializeNeed(
      need,
      needCapabilities(need, canManageAll, teamAdminIds.has(need.teamId)),
    )),
  };
}

export async function getGearNeedDetail(leagueId: string, needId: string): Promise<GearNeedDto | null> {
  const userId = await requireUserId();
  const need = await prisma.teamGearNeed.findFirst({
    where: { id: needId, leagueId, league: { isActive: true }, team: { leagueId, isActive: true } },
    select: {
      id: true, teamId: true, title: true, notes: true, status: true, version: true,
      submittedAt: true, approvedAt: true, fulfilledAt: true, canceledAt: true, createdAt: true,
      team: { select: { name: true } },
      lines: {
        select: {
          id: true, catalogItemId: true, nameSnapshot: true, categorySnapshot: true, sizeSnapshot: true,
          trackingMode: true, requestedQty: true, fulfilledQty: true, canceledQty: true,
          priority: true, status: true, notes: true, version: true,
        },
      },
    },
  });
  if (!need) return null;
  const [leagueRole, teamAdmin] = await Promise.all([
    getUserLeagueRole(userId, leagueId),
    isTeamAdmin(userId, need.teamId),
  ]);
  if (leagueRole !== "LEAGUE_ADMIN" && !teamAdmin) {
    throw new Error("Unauthorized: team admin access is required.");
  }
  return serializeNeed(need, needCapabilities(need, leagueRole === "LEAGUE_ADMIN", teamAdmin));
}

export async function getTeamGearNeeds(leagueId: string, teamId: string): Promise<GearNeedDto[]> {
  const context = await getGearNeedsContext(leagueId);
  if (!context || !context.teamIds.includes(teamId)) return [];
  return context.needs.filter((need) => need.teamId === teamId);
}
