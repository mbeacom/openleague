import { notFound } from "next/navigation";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import AssociationProfileEditor from "@/components/features/association-profile/AssociationProfileEditor";
import { requireUserId } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** Manage the public association and team pages. */
export default async function PublicProfileSettingsPage({
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
      capability: Capability.ADMINISTER_ASSOCIATION,
    }))
  ) {
    notFound();
  }

  const [profile, teams] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        name: true,
        slug: true,
        profileStatus: true,
        publicDescription: true,
        logoUrl: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        publicEmail: true,
        publicPhone: true,
      },
    }),
    prisma.team.findMany({
      where: { leagueId, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        profileStatus: true,
        publicDescription: true,
        logoUrl: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!profile) notFound();

  return (
    <PageContainer maxWidth="lg">
      <PageHeader
        title="Public page"
        subtitle="What families, opponents, and venue partners see when they look you up."
      />
      <AssociationProfileEditor leagueId={leagueId} profile={profile} teams={teams} />
    </PageContainer>
  );
}
