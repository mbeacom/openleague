import { Divider } from "@mui/material";
import { redirect } from "next/navigation";
import RosterList from "@/components/features/roster/RosterList";
import InvitationManager from "@/components/features/roster/InvitationManager";
import { getRosterData } from "@/lib/actions/team-context";
import { getTeamOfficials } from "@/lib/actions/team-officials";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function RosterPage() {
  const data = await getRosterData();

  if (!data) {
    redirect("/");
  }

  const officialsResult = await getTeamOfficials(data.teamId);
  const officials = officialsResult.success ? officialsResult.data : [];

  return (
    <PageContainer>
      <PageHeader title="Roster" />

      {data.isAdmin && (
        <>
          <InvitationManager invitations={data.invitations} teamId={data.teamId} />
          <Divider sx={{ my: 4 }} />
        </>
      )}

      <RosterList
        players={data.players}
        officials={officials}
        teamId={data.teamId}
        isAdmin={data.isAdmin}
      />
    </PageContainer>
  );
}
