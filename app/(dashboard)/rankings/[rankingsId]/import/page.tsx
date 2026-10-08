import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import { HostedRankingsScreen } from "@/components/features/rankings/HostedRankingsScreen";

export const metadata: Metadata = { title: "Import Rankings | OpenLeague" };

// The shared rankings screen for one of the user's own records (ADR-0025).
// The screen loads the record through its store, scoped to the owner.
export default async function Page({ params }: { params: Promise<{ rankingsId: string }> }) {
  const { rankingsId } = await params;
  return (
    <PageContainer>
      <HostedRankingsScreen id={rankingsId} view={{ name: "import" }} />
    </PageContainer>
  );
}
