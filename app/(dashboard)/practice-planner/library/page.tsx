import { Alert } from "@mui/material";
import { redirect } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";
import { getPlayLibraryContext } from "@/lib/actions/practice-session-queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play Library | OpenLeague",
  description: "Browse and manage your saved plays",
};

export default async function PlayLibraryPage() {
  const context = await getPlayLibraryContext();

  if (!context) {
    redirect("/dashboard");
  }

  if (!context.isAdmin) {
    return (
      <PageContainer>
        <Alert severity="warning">
          Only team admins can access the play library.
        </Alert>
        <LinkButton
          href="/practice-planner"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Back to Practice Planner
        </LinkButton>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Play Library"
        breadcrumbs={
          <LinkButton
            href="/practice-planner"
            startIcon={<ArrowBackIcon />}
            size="small"
          >
            Back
          </LinkButton>
        }
      />
      <PlayLibrary teamId={context.teamId} mode="manage" />
    </PageContainer>
  );
}
