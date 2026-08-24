import { notFound } from "next/navigation";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import ContentEditor from "@/components/features/association-profile/ContentEditor";
import { listAssociationContent } from "@/lib/actions/public-content";

export const dynamic = "force-dynamic";

/** News and announcements. Gated on the content capability, not league admin. */
export default async function AssociationContentPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const content = await listAssociationContent(leagueId);

  if (!content.success) notFound();

  return (
    <PageContainer maxWidth="lg">
      <PageHeader
        title="News"
        subtitle="Announcements for your public page and team pages."
      />
      <ContentEditor
        leagueId={leagueId}
        teams={content.data.teams}
        items={content.data.items}
        canPublishAssociationWide={content.data.canPublishAssociationWide}
      />
    </PageContainer>
  );
}
