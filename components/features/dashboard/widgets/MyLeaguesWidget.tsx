import { Box, Skeleton, Typography } from "@mui/material";
import LeagueOverviewCard from "@/components/features/dashboard/LeagueOverviewCard";
import { getViewerMemberships } from "@/lib/data/dashboard";

/**
 * Role-aware league cards for every league the viewer belongs to. Renders
 * nothing when the viewer has no league memberships. Async RSC — shares the
 * cache()-deduped memberships fetch; wrap in
 * <Suspense fallback={<MyLeaguesWidgetSkeleton />}>.
 */
export default async function MyLeaguesWidget({ userId }: { userId: string }) {
  const { leagues } = await getViewerMemberships(userId);
  if (leagues.length === 0) return null;

  return (
    <Box component="section">
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
        My Leagues
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
          },
          gap: 2,
        }}
      >
        {leagues.map((membership) => (
          <LeagueOverviewCard
            key={membership.league.id}
            league={membership.league}
            userRole={membership.role}
          />
        ))}
      </Box>
    </Box>
  );
}

export function MyLeaguesWidgetSkeleton() {
  return (
    <Box component="section">
      <Skeleton variant="text" width={160} sx={{ fontSize: "1.5rem", mb: 2 }} />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
          },
          gap: 2,
        }}
      >
        <Skeleton variant="rounded" height={200} />
        <Skeleton variant="rounded" height={200} />
      </Box>
    </Box>
  );
}
