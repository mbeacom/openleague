import { Box, Card, CardContent, Chip, Skeleton, Stack, Typography } from "@mui/material";
import { MailOutline as MailOutlineIcon } from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { LinkMuiLink } from "@/components/ui/NextLinkComposites";
import { getRecentMessages } from "@/lib/data/dashboard";

/**
 * Teasers for the viewer's most recently received league messages, each
 * linking to the sending league's messages page. Async RSC — mount only for
 * viewers with league memberships; wrap in
 * <Suspense fallback={<RecentMessagesWidgetSkeleton />}>.
 */
export default async function RecentMessagesWidget({ userId }: { userId: string }) {
  const messages = await getRecentMessages(userId);

  return (
    <Box component="section">
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
        Recent Messages
      </Typography>

      {messages.length === 0 ? (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
          <MailOutlineIcon fontSize="small" />
          <Typography variant="body2">League announcements will appear here.</Typography>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          {messages.map((message) => (
            <Card key={message.id} variant="outlined">
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack spacing={0.5}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <LinkMuiLink
                      href={`/league/${message.leagueId}/messages`}
                      variant="subtitle2"
                      color="inherit"
                      underline="hover"
                      sx={{ fontWeight: 600 }}
                    >
                      {message.subject}
                    </LinkMuiLink>
                    <Chip size="small" label={message.leagueName} />
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{ color: "text.secondary" }}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Typography variant="caption">{message.senderName}</Typography>
                    <Typography variant="caption">
                      {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
                    </Typography>
                  </Stack>
                  {message.snippet ? (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {message.snippet}
                    </Typography>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export function RecentMessagesWidgetSkeleton() {
  return (
    <Box component="section">
      <Skeleton variant="text" width={200} sx={{ fontSize: "1.5rem", mb: 2 }} />
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={88} />
        <Skeleton variant="rounded" height={88} />
      </Stack>
    </Box>
  );
}
