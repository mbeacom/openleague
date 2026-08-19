import { notFound } from "next/navigation";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import ContentEditor from "@/components/features/association-profile/ContentEditor";
import { requireUserId } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";
import { listAssociationContent } from "@/lib/actions/public-content";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** News and announcements. Gated on the content capability, not league admin. */
export default async function AssociationContentPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const userId = await requireUserId();

  if (
    !(await hasCapability({
      userId,
      leagueId,
      capability: Capability.MANAGE_PUBLIC_CONTENT,
    }))
  ) {
    notFound();
  }

  const [content, teams] = await Promise.all([
    listAssociationContent(leagueId),
    prisma.team.findMany({
      where: { leagueId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!content.success) notFound();

  return (
    <PageContainer maxWidth="lg">
      <PageHeader
        title="News"
        subtitle="Announcements for your public page and team pages."
      />
      <ContentEditor leagueId={leagueId} teams={teams} items={content.data} />
    </PageContainer>
  );
}
