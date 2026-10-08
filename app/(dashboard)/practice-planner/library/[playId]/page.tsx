import { Alert } from "@mui/material";
import { notFound, redirect } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { DrillDetailView } from "@/components/features/practice-planner/DrillDetailView";
import { getPlayLibraryContext } from "@/lib/actions/practice-session-queries";
import { getPlayById } from "@/lib/actions/plays";
import { PLAY_DATA_UNREADABLE_CODE } from "@/lib/utils/play-data";
import { countPlayUsage } from "./play-usage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Drill Details | OpenLeague",
  description: "A drill from your play library",
};

interface PageProps {
  params: Promise<{ playId: string }>;
}

/** The library's own rule: team admins only (the library and edit pages gate the same way). */
export default async function DrillDetailPage({ params }: PageProps) {
  const { playId } = await params;
  const context = await getPlayLibraryContext();

  if (!context) {
    redirect("/dashboard");
  }

  if (!context.isAdmin) {
    return (
      <PageContainer>
        <Alert severity="warning">Only team admins can access the play library.</Alert>
        <LinkButton href="/practice-planner" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Back to Practice Planner
        </LinkButton>
      </PageContainer>
    );
  }

  const result = await getPlayById({ id: playId, teamId: context.teamId });

  if (!result.success) {
    const details = result.details as { code?: string } | undefined;
    if (details?.code !== PLAY_DATA_UNREADABLE_CODE) notFound();
    return (
      <PageContainer>
        <Alert severity="error">{result.error}</Alert>
        <LinkButton href="/practice-planner/library" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Back to Play Library
        </LinkButton>
      </PageContainer>
    );
  }

  // Only after getPlayById accepted the id for this team.
  const usageCount = await countPlayUsage(result.data.id, context.teamId);

  return (
    <PageContainer>
      <DrillDetailView play={result.data} teamId={context.teamId} canEdit={context.isAdmin} usageCount={usageCount} />
    </PageContainer>
  );
}
