import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import { LeagueFetchView } from "@/components/features/league-fetch/LeagueFetchView";
import { leagueFetchAllowedHosts, staticPlannerBaseUrl } from "@/lib/league-fetch/config";

export const metadata: Metadata = {
  title: "Fetch Schedule | OpenLeague",
  description: "Fetch a league schedule page for the rankings planner",
};

// The fetch has a 60 s default deadline (LEAGUE_FETCH_TIMEOUT_MS, at most 90 s);
// this page-level setting also governs the server action it invokes. Leave
// headroom for parsing and the response.
export const maxDuration = 120;

// "Fetch it for me" (ADR-0024). The (dashboard) layout requires sign-in, and
// its redirect to /login keeps the #src= fragment, which the login page
// stashes. Lives beside the plan import page: both are the hosted companions
// of the static planner.
export default function FetchSchedulePage() {
  return (
    <PageContainer>
      <LeagueFetchView allowedHosts={leagueFetchAllowedHosts()} plannerUrl={staticPlannerBaseUrl()} />
    </PageContainer>
  );
}
