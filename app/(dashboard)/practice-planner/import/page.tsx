import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlanImportView } from "@/components/features/practice-planner/PlanImportView";
import { getPlanImportTeams } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Import Practice Plan | OpenLeague",
  description: "Import a practice plan file or link",
};

// The (dashboard) layout requires sign-in. A user with no eligible team still
// gets the page (with an explanation) so an opened plan isn't silently dropped.
export default async function ImportPracticePlanPage() {
  const teams = await getPlanImportTeams();

  return (
    <PageContainer>
      <PlanImportView teams={teams} />
    </PageContainer>
  );
}
