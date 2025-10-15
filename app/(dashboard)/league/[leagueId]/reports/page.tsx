import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, verifyLeagueAdmin } from "@/lib/actions/league";
import LeagueReportsView from "@/components/features/dashboard/LeagueReportsView";

interface LeagueReportsPageProps {
    params: {
        leagueId: string;
    };
}

export default async function LeagueReportsPage({ params }: LeagueReportsPageProps) {
    const userId = await requireUserId();
    const { leagueId } = params;

    // Verify user has access to this league
    const hasAccess = await hasLeagueAccess(userId, leagueId);
    if (!hasAccess) {
        notFound();
    }

    // Check if user is league admin
    const isAdmin = await verifyLeagueAdmin(leagueId, userId);

    return <LeagueReportsView leagueId={leagueId} isAdmin={isAdmin} />;
}
