import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueStatisticsData } from "@/lib/actions/league";
import LeagueStatisticsDashboard from "@/components/features/dashboard/LeagueStatisticsDashboard";
import { Box, Alert } from "@mui/material";

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
            <Box sx={{ p: 3 }}>
                <Alert severity="error">
                    {result.error}
                </Alert>
            </Box>
        );
    }

    return <LeagueStatisticsDashboard statistics={result.data} />;
}
