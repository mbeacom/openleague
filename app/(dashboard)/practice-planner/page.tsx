import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";
import { getPlanImportTeams, getPracticePlannerListData } from "@/lib/actions/practice-session-queries";
import { listPlannerFavorites } from "@/lib/actions/planner-favorites";

export const metadata: Metadata = {
  title: "Practice Planner | OpenLeague",
  description: "Plan and organize hockey practice sessions",
};

export default async function PracticePlannerPage() {
  const [data, importTeams, favorites] = await Promise.all([
    getPracticePlannerListData(),
    getPlanImportTeams(),
    listPlannerFavorites({ kind: "PRACTICE" }),
  ]);

  if (!data) {
    redirect("/dashboard");
  }

  return (
    <PageContainer>
      <PracticePlannerList
        sessions={data.sessions}
        teamId={data.teamId}
        isAdmin={data.isAdmin}
        canImport={importTeams.length > 0}
        teamName={data.teamName}
        // Read here so starred practices are first on the first paint; on failure the list loads them itself.
        favoriteSessionIds={favorites.success ? favorites.data : undefined}
      />
    </PageContainer>
  );
}
