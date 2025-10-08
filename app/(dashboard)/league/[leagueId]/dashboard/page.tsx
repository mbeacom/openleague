import { requireAuth, requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueWithStats } from "@/lib/actions/league";
import LeagueDashboard from "@/components/features/dashboard/LeagueDashboard";

interface LeagueDashboardPageProps {
  params: {
    leagueId: string;
  };
}

export default async function LeagueDashboardPage({ params }: LeagueDashboardPageProps) {
  await requireAuth();
  const userId = await requireUserId();

  // Verify user has access to this league
  const hasAccess = await hasLeagueAccess(userId, params.leagueId);
  if (!hasAccess) {
    notFound();
  }

  // Get league data with statistics
  const leagueData = await getLeagueWithStats(params.leagueId);
  if (!leagueData) {
    notFound();
  }

  return <LeagueDashboard league={leagueData} />;
}