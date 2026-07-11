import { Card, CardContent, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { LeagueMessagesView } from "@/components/features/communication/LeagueMessagesView";
import { getLeagueMessagesData } from "@/lib/actions/league-context";

interface LeagueMessagesPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueMessagesPage({ params }: LeagueMessagesPageProps) {
  const { leagueId } = await params;

  const data = await getLeagueMessagesData(leagueId);
  if (!data) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        title="League Messages"
        subtitle="Send targeted messages and announcements to league members, divisions, or specific teams."
      />

      {!data.canSendMessages && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              You can view messages but cannot send them. Only league and team administrators can send messages.
            </Typography>
          </CardContent>
        </Card>
      )}

      <LeagueMessagesView
        leagueData={data.leagueData}
        canSendMessages={data.canSendMessages}
      />
    </PageContainer>
  );
}
