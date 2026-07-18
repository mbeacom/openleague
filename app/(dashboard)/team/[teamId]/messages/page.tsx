import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon, Forum as ForumIcon } from "@mui/icons-material";
import { getTeamOverviewData } from "@/lib/actions/team-context";
import { getTeamMessages } from "@/lib/actions/communication";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import TeamMessageComposer from "@/components/features/communication/TeamMessageComposer";

export const metadata: Metadata = {
  title: "Team Messages",
};

interface TeamMessagesPageProps {
  params: Promise<{ teamId: string }>;
}

function formatSentAt(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function TeamMessagesPage({ params }: TeamMessagesPageProps) {
  const { teamId } = await params;
  const team = await getTeamOverviewData(teamId);

  if (!team) {
    notFound();
  }

  const messagesResult = await getTeamMessages({ teamId, page: 1, limit: 20 });
  const messages = messagesResult.success ? messagesResult.data.messages : [];

  return (
    <PageContainer>
      <LinkButton href={`/team/${team.id}`} startIcon={<ArrowBackIcon />} sx={{ mb: 3 }}>
        Back to team
      </LinkButton>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
        <ForumIcon color="primary" />
        <Typography variant="h4" component="h1" fontWeight={800}>
          {team.name} messages
        </Typography>
      </Stack>

      {team.isAdmin ? (
        <Box sx={{ mb: 4 }}>
          <TeamMessageComposer teamId={team.id} memberCount={team.stats.members} />
        </Box>
      ) : null}

      <Typography variant="h5" component="h2" fontWeight={700} sx={{ mb: 2 }}>
        Message history
      </Typography>

      {messages.length === 0 ? (
        <EmptyState
          icon={<ForumIcon />}
          title="No messages yet"
          description={
            team.isAdmin
              ? "Send your team their first announcement using the box above."
              : "This team hasn't sent any messages yet."
          }
        />
      ) : (
        <Stack spacing={1.5}>
          {messages.map((message) => (
            <Card key={message.id} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {message.subject}
                  </Typography>
                  {message.priority === "URGENT" ? (
                    <Chip size="small" color="error" label="Urgent" />
                  ) : message.priority === "HIGH" ? (
                    <Chip size="small" color="warning" label="High" />
                  ) : null}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {message.sender.name ?? message.sender.email} · {formatSentAt(message.createdAt)} ·{" "}
                  {message.recipientCount} recipient{message.recipientCount === 1 ? "" : "s"}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
                  {message.content}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </PageContainer>
  );
}
