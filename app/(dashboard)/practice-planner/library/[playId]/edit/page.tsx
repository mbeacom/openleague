import { Alert } from "@mui/material";
import { notFound, redirect } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { getPlayLibraryContext } from "@/lib/actions/practice-session-queries";
import { getPlayById } from "@/lib/actions/plays";
import { PLAY_DATA_UNREADABLE_CODE } from "@/lib/utils/play-data";
import { PlayEditorWrapper } from "../../PlayEditorWrapper";
import type { SavedPlay } from "@/types/practice-planner";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Play | OpenLeague",
  description: "Edit a play in your library",
};

interface PageProps {
  params: Promise<{ playId: string }>;
}

export default async function EditPlayPage({ params }: PageProps) {
  const { playId } = await params;
  const context = await getPlayLibraryContext();

  if (!context) {
    redirect("/dashboard");
  }

  if (!context.isAdmin) {
    return (
      <PageContainer>
        <Alert severity="warning">
          Only team admins can edit plays.
        </Alert>
        <LinkButton
          href="/practice-planner/library"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Back to Play Library
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
        <Alert severity="error">
          {result.error} Editing is disabled so the stored drawing isn&apos;t overwritten.
        </Alert>
        <LinkButton href="/practice-planner/library" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Back to Play Library
        </LinkButton>
      </PageContainer>
    );
  }

  const play: SavedPlay = {
    id: result.data.id,
    name: result.data.name,
    description: result.data.description ?? "",
    thumbnail: result.data.thumbnail ?? "",
    playData: result.data.playData,
    isTemplate: result.data.isTemplate,
    focus: result.data.focus,
    goalies: result.data.goalies,
    ageGroups: result.data.ageGroups,
    createdAt: result.data.createdAt,
    updatedAt: result.data.updatedAt,
  };

  return (
    <PageContainer>
      <PlayEditorWrapper teamId={context.teamId} play={play} />
    </PageContainer>
  );
}
