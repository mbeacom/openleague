import { Alert } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { getUserTeamContext } from "@/lib/actions/team-context";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import type { SportValue } from "@/lib/utils/validation";
import TeamSettingsForm from "./TeamSettingsForm";

/**
 * Team settings for single-team mode. Any team member can reach this page;
 * only admins can save changes (enforced client-side for UX and server-side
 * by the updateTeam action for security).
 */
export default async function TeamSettingsPage() {
  const context = await getUserTeamContext();

  if (!context) {
    return (
      <PageContainer maxWidth="md">
        <PageHeader
          title="Team Settings"
          subtitle="Manage your team's profile."
        />
        <Alert severity="info">
          You are not part of a team yet. Create or join a team to manage its
          settings.
        </Alert>
      </PageContainer>
    );
  }

  const team = await prisma.team.findFirst({
    where: { id: context.teamId, isActive: true },
    select: {
      id: true,
      name: true,
      sport: true,
      season: true,
    },
  });

  if (!team) {
    return (
      <PageContainer maxWidth="md">
        <PageHeader
          title="Team Settings"
          subtitle="Manage your team's profile."
        />
        <Alert severity="info">
          We couldn&apos;t find an active team for your account.
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="md">
      <PageHeader
        title="Team Settings"
        subtitle={`Update ${team.name}'s name, sport, and season.`}
      />
      {!context.isAdmin && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Only team admins can change these settings.
        </Alert>
      )}
      <TeamSettingsForm
        team={{ ...team, sport: team.sport as SportValue }}
        canEdit={context.isAdmin}
      />
    </PageContainer>
  );
}
