import { notFound } from "next/navigation";
import { Box, Divider, Stack, Typography } from "@mui/material";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";
import { listAssociationResponsibilityGrants } from "@/lib/actions/association-roles";
import { getVolunteerBoard } from "@/lib/actions/volunteers";
import RoleGrantManager from "@/components/features/workforce/RoleGrantManager";
import VolunteerBoard from "@/components/features/workforce/VolunteerBoard";
import { UserPermissionManager } from "@/components/features/admin/UserPermissionManager";
import { TeamPermissionManager } from "@/components/features/admin/TeamPermissionManager";

export const dynamic = "force-dynamic";

/**
 * Workforce: who may do what, and who is staffing the season.
 *
 * Two audiences share this route. Administrators get the delegation surface and
 * the existing membership/role managers; a volunteer with no organizing
 * capability gets only their own shifts. The page never 404s for the second
 * group — having volunteer work is reason enough to be here.
 */
export default async function WorkforcePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const userId = await requireUserId();

  const [canAdminister, volunteerBoard] = await Promise.all([
    hasCapability({ userId, leagueId, capability: Capability.ADMINISTER_ASSOCIATION }),
    getVolunteerBoard(leagueId),
  ]);

  if (!volunteerBoard.success) {
    notFound();
  }

  const { isOrganizer, needs } = volunteerBoard.data;

  // Nothing to administer and no shifts of their own: this route has no
  // content for them, and its existence is not worth advertising.
  if (!canAdminister && !isOrganizer && needs.length === 0) {
    notFound();
  }

  const [grantsResult, teams, membership] = await Promise.all([
    canAdminister
      ? listAssociationResponsibilityGrants(leagueId)
      : Promise.resolve(null),
    canAdminister
      ? prisma.team.findMany({
          where: { leagueId, isActive: true },
          select: { id: true, name: true, sport: true, season: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.leagueUser.findFirst({
      where: { userId, leagueId },
      select: { role: true },
    }),
  ]);

  const divisions = canAdminister
    ? await prisma.division.findMany({
        where: { leagueId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const currentUserRole = (membership?.role ?? "MEMBER") as
    | "LEAGUE_ADMIN"
    | "TEAM_ADMIN"
    | "MEMBER";

  return (
    <PageContainer maxWidth="lg">
      <PageHeader
        title="Workforce"
        subtitle={
          canAdminister
            ? "Delegate bounded responsibilities and staff the season with volunteers."
            : "Your volunteer shifts."
        }
      />

      <Stack spacing={4}>
        {canAdminister && grantsResult?.success ? (
          <RoleGrantManager
            leagueId={leagueId}
            grants={grantsResult.data}
            divisions={divisions}
            teams={teams.map((team) => ({ id: team.id, name: team.name }))}
          />
        ) : null}

        <Box>
          <Typography variant="h5" component="h2" gutterBottom>
            {isOrganizer ? "Volunteers" : "My shifts"}
          </Typography>
          <VolunteerBoard needs={needs} isOrganizer={isOrganizer} currentUserId={userId} />
        </Box>

        {canAdminister ? (
          <>
            <Divider />
            {/*
              Mounted rather than reimplemented: league membership roles and
              team admin membership already have working managers, and a second
              set would be one more place for the two to disagree about who
              holds what.
            */}
            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                League membership
              </Typography>
              <UserPermissionManager
                leagueId={leagueId}
                currentUserId={userId}
                currentUserRole={currentUserRole}
              />
            </Box>

            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                Team membership
              </Typography>
              <TeamPermissionManager
                leagueId={leagueId}
                teams={teams}
                currentUserId={userId}
                currentUserRole={currentUserRole}
              />
            </Box>
          </>
        ) : null}
      </Stack>
    </PageContainer>
  );
}
