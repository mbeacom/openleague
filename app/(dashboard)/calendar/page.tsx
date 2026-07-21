import { CalendarMonth as CalendarMonthIcon } from "@mui/icons-material";
import CalendarView from "@/components/features/calendar/CalendarView";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUserId } from "@/lib/auth/session";
import { getUserCalendarItems } from "@/lib/data/calendar";
import { getViewerMemberships } from "@/lib/data/dashboard";
import { deriveCalendarScopes, type CalendarScopeOption } from "@/types/events";

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

const KIND_ORDER: Record<CalendarScopeOption["kind"], number> = {
  team: 0,
  league: 1,
  venue: 2,
};

/**
 * Chips should list scopes present in the feed OR the viewer's memberships, so
 * a team with a quiet month still gets its (toggleable) overlay chip.
 */
function mergeScopes(
  feedScopes: CalendarScopeOption[],
  memberships: Awaited<ReturnType<typeof getViewerMemberships>>
): CalendarScopeOption[] {
  const merged = new Map<string, CalendarScopeOption>();
  for (const scope of feedScopes) merged.set(`${scope.kind}:${scope.id}`, scope);
  for (const { team } of memberships.teams) {
    const key = `team:${team.id}`;
    if (!merged.has(key)) merged.set(key, { kind: "team", id: team.id, name: team.name });
  }
  for (const { league } of memberships.leagues) {
    const key = `league:${league.id}`;
    if (!merged.has(key)) merged.set(key, { kind: "league", id: league.id, name: league.name });
  }
  return [...merged.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name)
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const month = resolveMonth(params.month);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1 - WINDOW_BUFFER_DAYS));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1 + WINDOW_BUFFER_DAYS));

  const userId = await requireUserId();
  // getViewerMemberships is request-cached, so the feed's internal call shares it.
  const [items, memberships] = await Promise.all([
    getUserCalendarItems({ from, to }),
    getViewerMemberships(userId),
  ]);

  const scopes = mergeScopes(deriveCalendarScopes(items), memberships);
  const isTeamAdmin = memberships.teams.some((membership) => membership.role === "ADMIN");

  if (scopes.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Calendar" />
        <EmptyState
          icon={<CalendarMonthIcon />}
          title="No team yet"
          description="You are not a member of any team yet. Join or create a team to see its schedule here."
          action={
            <LinkButton href="/dashboard" variant="contained">
              Go to dashboard
            </LinkButton>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Calendar"
        subtitle="Games, practices, signups, and venue schedules across your memberships"
        actions={
          isTeamAdmin ? (
            <LinkButton href="/events/new" variant="contained">
              New Event
            </LinkButton>
          ) : undefined
        }
      />
      <CalendarView items={items} scopes={scopes} initialMonth={month} />
    </PageContainer>
  );
}
