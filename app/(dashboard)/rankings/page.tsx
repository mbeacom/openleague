import type { Metadata } from "next";
import { Alert } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";
import { RankingsListView } from "@/components/features/rankings/RankingsListView";
import { listRankingsRecords } from "@/lib/actions/rankings";

export const metadata: Metadata = {
  title: "Rankings | OpenLeague",
  description: "Your private placement rankings, computed from public league results",
};

// Hosted rankings (ADR-0025): the signed-in user's own documents. The
// (dashboard) layout requires sign-in; the action scopes every read to them.
export default async function RankingsPage() {
  const result = await listRankingsRecords();
  return (
    <PageContainer>
      {result.success ? <RankingsListView records={result.data} /> : <Alert severity="error">{result.error}</Alert>}
    </PageContainer>
  );
}
