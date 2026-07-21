import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { Security as SecurityIcon } from "@mui/icons-material";
import { prisma } from "@/lib/db/prisma";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkChip } from "@/components/ui/NextLinkComposites";
import { isPlatformAdmin, requireUserId } from "@/lib/auth/session";
import { AuditLogViewer } from "@/components/features/admin/AuditLogViewer";

interface AdminAuditPageProps {
  searchParams: Promise<{ leagueId?: string }>;
}

/**
 * Platform-admin audit log browser. Audit logs are league-scoped and the
 * underlying action requires LEAGUE_ADMIN of the selected league, so this
 * page lists the viewer's admin leagues and mounts the viewer for one.
 */
export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const [userId, { leagueId: requestedLeagueId }] = await Promise.all([
    requireUserId(),
    searchParams,
  ]);

  const isAdmin = await isPlatformAdmin(userId);
  if (!isAdmin) {
    notFound();
  }

  // getAuditLogsAction enforces LEAGUE_ADMIN per league, so only offer
  // leagues where this platform admin also holds that role.
  const adminLeagues = await prisma.leagueUser.findMany({
    where: { userId, role: "LEAGUE_ADMIN", league: { isActive: true } },
    select: { league: { select: { id: true, name: true } } },
    orderBy: { league: { name: "asc" } },
  });

  const leagues = adminLeagues.map((entry) => entry.league);
  const selectedLeague =
    leagues.find((league) => league.id === requestedLeagueId) ?? leagues[0];

  return (
    <PageContainer>
      <PageHeader
        title="Audit Logs"
        subtitle="Administrative actions and security events, per league."
      />
      {!selectedLeague ? (
        <EmptyState
          icon={<SecurityIcon />}
          title="No league audit logs available"
          description="Audit logs are league-scoped. Join a league as a league admin to review its audit trail."
        />
      ) : (
        <>
          {leagues.length > 1 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
              {leagues.map((league) => (
                <LinkChip
                  key={league.id}
                  href={`/admin/audit?leagueId=${league.id}`}
                  label={league.name}
                  clickable
                  color={league.id === selectedLeague.id ? "primary" : "default"}
                  variant={league.id === selectedLeague.id ? "filled" : "outlined"}
                />
              ))}
            </Box>
          )}
          <AuditLogViewer
            key={selectedLeague.id}
            leagueId={selectedLeague.id}
            currentUserRole="LEAGUE_ADMIN"
          />
        </>
      )}
    </PageContainer>
  );
}
