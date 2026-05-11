import type { ReactNode } from "react";
import { Card, CardContent, Grid, Stack, Typography } from "@mui/material";

interface PublicRinkContentProps {
  posts: Array<{ id: string; title: string; excerpt?: string | null; slug: string }>;
  lessons: Array<{ id: string; title: string; lessonType: string }>;
  events: Array<{ id: string; title: string; startsAt: Date | string }>;
}

export function PublicRinkContent({ posts, lessons, events }: PublicRinkContentProps) {
  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <ContentSection title="Lessons" empty="No lessons are published yet.">
          {lessons.map((lesson) => (
            <Typography key={lesson.id}>{lesson.title} ({lesson.lessonType})</Typography>
          ))}
        </ContentSection>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <ContentSection title="Events" empty="No events are published yet.">
          {events.map((event) => (
            <Typography key={event.id}>{event.title} - {new Date(event.startsAt).toLocaleDateString()}</Typography>
          ))}
        </ContentSection>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <ContentSection title="Posts" empty="No posts are published yet.">
          {posts.map((post) => (
            <Stack key={post.id} spacing={1}>
              <Typography>{post.title}</Typography>
              {post.excerpt ? <Typography variant="body2">{post.excerpt}</Typography> : null}
            </Stack>
          ))}
        </ContentSection>
      </Grid>
    </Grid>
  );
}

function ContentSection({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h5">{title}</Typography>
          {children.length > 0 ? children : <Typography color="text.secondary">{empty}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}
