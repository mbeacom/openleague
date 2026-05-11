import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface ContentPostSummary {
  id: string;
  title: string;
  status: string;
}

export function VenueContentManager({ posts }: { posts: ContentPostSummary[] }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Venue content</Typography>
      {posts.length === 0 ? (
        <Typography color="text.secondary">No venue posts yet.</Typography>
      ) : (
        posts.map((post) => (
          <Card key={post.id}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6">{post.title}</Typography>
                <Chip label={post.status} size="small" />
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
