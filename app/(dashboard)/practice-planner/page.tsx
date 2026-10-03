import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";
import { getPlanImportTeams, getPracticePlannerListData } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Practice Planner | OpenLeague",
  description: "Plan and organize hockey practice sessions",
};

export default async function PracticePlannerPage() {
  const [data, importTeams] = await Promise.all([
    getPracticePlannerListData(),
    getPlanImportTeams(),
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
      />
    </PageContainer>
  );
}
