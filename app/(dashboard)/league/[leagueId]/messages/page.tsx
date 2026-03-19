import { Box, Typography, Card, CardContent } from "@mui/material";
import { notFound } from "next/navigation";
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
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          League Messages
        </Typography>
      </Box>

      <Typography variant="body1" color="text.secondary" mb={3}>
        Send targeted messages and announcements to league members, divisions, or specific teams.
      </Typography>

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
    </Box>
  );
}
