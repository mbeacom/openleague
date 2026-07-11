import { Box, Container, Alert } from "@mui/material";
import { notFound, redirect } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { getPlayLibraryContext } from "@/lib/actions/practice-session-queries";
import { getPlayById } from "@/lib/actions/plays";
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
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
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
        </Box>
      </Container>
    );
  }

  const result = await getPlayById({ id: playId, teamId: context.teamId });

  if (!result.success) {
    notFound();
  }

  const play: SavedPlay = {
    id: result.data.id,
    name: result.data.name,
    description: result.data.description ?? "",
    thumbnail: result.data.thumbnail ?? "",
    playData: result.data.playData,
    isTemplate: result.data.isTemplate,
    createdAt: result.data.createdAt,
    updatedAt: result.data.updatedAt,
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PlayEditorWrapper teamId={context.teamId} play={play} />
      </Box>
    </Container>
  );
}
