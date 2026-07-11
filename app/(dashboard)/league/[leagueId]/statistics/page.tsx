import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueStatisticsData } from "@/lib/actions/league";
import LeagueStatisticsDashboard from "@/components/features/dashboard/LeagueStatisticsDashboard";
import { Alert } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

interface LeagueStatisticsPageProps {
    params: Promise<{
        leagueId: string;
    }>;
}

export default async function LeagueStatisticsPage({ params }: LeagueStatisticsPageProps) {
    const userId = await requireUserId();
    const { leagueId } = await params;

    // Verify user has access to this league
    const hasAccess = await hasLeagueAccess(userId, leagueId);
    if (!hasAccess) {
        notFound();
    }

    // Get league statistics
    const result = await getLeagueStatisticsData(leagueId);

    if (!result.success) {
        return (
            <PageContainer>
                <Alert severity="error">
                    {result.error}
                </Alert>
            </PageContainer>
        );
    }

    return <LeagueStatisticsDashboard statistics={result.data} />;
}
