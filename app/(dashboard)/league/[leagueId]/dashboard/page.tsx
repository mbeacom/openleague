import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueWithStats } from "@/lib/actions/league";
import LeagueDashboard from "@/components/features/dashboard/LeagueDashboard";

interface LeagueDashboardPageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

export default async function LeagueDashboardPage({ params }: LeagueDashboardPageProps) {
  const [userId, { leagueId }] = await Promise.all([
    requireUserId(),
    params,
  ]);

  // Verify user has access to this league
  const hasAccess = await hasLeagueAccess(userId, leagueId);
  if (!hasAccess) {
    notFound();
  }

  // Get league data with statistics
  const leagueData = await getLeagueWithStats(leagueId);
  if (!leagueData) {
    notFound();
  }

  return <LeagueDashboard league={leagueData} />;
}