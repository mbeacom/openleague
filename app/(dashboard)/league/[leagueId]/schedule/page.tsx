import { Add, Download } from "@mui/icons-material";
import { Button } from "@mui/material";
import { notFound } from "next/navigation";
import CalendarView from "@/components/features/calendar/CalendarView";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { canUserCreateLeagueGames, requireUserId } from "@/lib/auth/session";
import { getUserCalendarItems } from "@/lib/data/calendar";
import { prisma } from "@/lib/db/prisma";
import { formatSport } from "@/lib/utils/validation";
import { deriveCalendarScopes } from "@/types/events";

const MONTH_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The month grid shows up to 6 leading/trailing adjacent-month days; ±7 days
 * covers those plus any viewer-timezone skew around the UTC month anchors.
 */
const WINDOW_BUFFER_DAYS = 7;

/** Validated "YYYY-MM" from the searchParam, else the current month. */
function resolveMonth(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (value && MONTH_PARAM_RE.test(value)) {
    const year = Number(value.slice(0, 4));
    if (year >= 1970 && year <= 2100) return value;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface LeagueSchedulePageProps {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LeagueSchedulePage({
  params,
  searchParams,
}: LeagueSchedulePageProps) {
  const [{ leagueId }, search] = await Promise.all([params, searchParams]);

  const userId = await requireUserId();
  const leagueUser = await prisma.leagueUser.findFirst({
    where: { userId, leagueId, league: { isActive: true } },
    include: { league: { select: { name: true, sport: true } } },
  });
  if (!leagueUser) {
    notFound();
  }

  const month = resolveMonth(search.month);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1 - WINDOW_BUFFER_DAYS));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1 + WINDOW_BUFFER_DAYS));

  const [canCreateGames, allItems] = await Promise.all([
    canUserCreateLeagueGames(userId, leagueId, leagueUser.role),
    getUserCalendarItems({ from, to }),
  ]);

  // League-locked view: only items carrying this league's scope (league events,
  // league-hosted signups). Team/venue chips within the league still filter.
  const items = allItems.filter((item) => item.scope.leagueId === leagueId);
  const scopes = deriveCalendarScopes(items);

  return (
    <PageContainer>
      <PageHeader
        title="League Schedule"
        subtitle={`${leagueUser.league.name} • ${formatSport(leagueUser.league.sport)}`}
        actions={
          <>
            {/* Plain anchor (not next/link): the target is a file-download route handler. */}
            <Button
              component="a"
              href={`/api/leagues/${leagueId}/schedule.ics`}
              download
              variant="outlined"
              startIcon={<Download />}
            >
              Export
            </Button>
            {canCreateGames ? (
              <LinkButton
                href={`/league/${leagueId}/schedule/new-game`}
                variant="contained"
                startIcon={<Add />}
              >
                Schedule Game
              </LinkButton>
            ) : null}
          </>
        }
      />

      <CalendarView items={items} scopes={scopes} initialMonth={month} locked={{ leagueId }} />
    </PageContainer>
  );
}
