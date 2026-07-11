import { notFound } from "next/navigation";
import { Divider } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import RosterList from "@/components/features/roster/RosterList";
import InvitationManager from "@/components/features/roster/InvitationManager";
import { getTeamRosterDataById } from "@/lib/actions/team-context";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

interface TeamRosterPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamRosterPage({ params }: TeamRosterPageProps) {
  const { teamId } = await params;
  const data = await getTeamRosterDataById(teamId);

  if (!data) {
    notFound();
  }

  return (
    <PageContainer>
      <LinkButton
        href={`/team/${teamId}`}
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 3 }}
      >
        Back to team
      </LinkButton>

      <PageHeader
        title={`${data.teamName} roster`}
        subtitle={data.isAdmin ? "Manage players, invitations, and team official IDs." : "View players and team officials."}
      />

      {data.isAdmin && (
        <>
          <InvitationManager invitations={data.invitations} teamId={data.teamId} />
          <Divider sx={{ my: 4 }} />
        </>
      )}

      <RosterList
        players={data.players}
        teamMembers={data.teamMembers}
        teamId={data.teamId}
        isAdmin={data.isAdmin}
      />
    </PageContainer>
  );
}
