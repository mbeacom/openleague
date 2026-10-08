import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { HostedRankingsScreen } from "@/components/features/rankings/HostedRankingsScreen";
import { RANKINGS_SETUP_SECTIONS, type RankingsSetupSection } from "@/apps/planner/src/routes";

export const metadata: Metadata = { title: "Rankings Setup | OpenLeague" };

const isSection = (value: string): value is RankingsSetupSection => (RANKINGS_SETUP_SECTIONS as readonly string[]).includes(value);

// Setup opened at one section, e.g. "League pages" from Update results.
// The screen loads the record through its store, scoped to the owner (ADR-0025).
export default async function Page({ params }: { params: Promise<{ rankingsId: string; section: string }> }) {
  const { rankingsId, section } = await params;
  if (!isSection(section)) notFound();
  return (
    <PageContainer>
      <HostedRankingsScreen id={rankingsId} view={{ name: "setup", section }} />
    </PageContainer>
  );
}
