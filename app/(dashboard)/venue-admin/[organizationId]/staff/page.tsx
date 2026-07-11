import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db/prisma";
import { getUserVenueStaffRole, requireUserId } from "@/lib/auth/session";
import { StaffManager, type StaffMemberSummary } from "./StaffManager";

interface VenueStaffPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function VenueStaffPage({ params }: VenueStaffPageProps) {
  const { organizationId } = await params;
  const userId = await requireUserId();

  const organization = await prisma.venueOrganization.findFirst({
    where: { id: organizationId, status: { in: ["DRAFT", "ACTIVE"] } },
    select: {
      id: true,
      name: true,
      staff: {
        where: { status: { in: ["ACTIVE", "INVITED"] } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          status: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true } },
          invitedBy: { select: { name: true, email: true } },
          venue: { select: { name: true } },
        },
      },
    },
  });

  if (!organization) {
    notFound();
  }

  // Readable by any current or invited staff member. Invited users need this
  // page to accept, so the ACTIVE-only role helpers can't gate reads here.
  const isViewerListed = organization.staff.some((member) => member.user.id === userId);
  if (!isViewerListed) {
    notFound();
  }

  // Management capabilities still come from the viewer's highest ACTIVE role.
  const viewerRole = await getUserVenueStaffRole(userId, organizationId);
  const canManage = viewerRole === "OWNER" || viewerRole === "MANAGER";
  const isOwner = viewerRole === "OWNER";

  const staff: StaffMemberSummary[] = organization.staff.map((member) => ({
    id: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    status: member.status as "ACTIVE" | "INVITED",
    joinedAt: member.joinedAt?.toISOString() ?? null,
    invitedByName: member.invitedBy?.name ?? member.invitedBy?.email ?? null,
    venueName: member.venue?.name ?? null,
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Staff"
        subtitle={`Manage who can administer ${organization.name}.`}
      />
      <StaffManager
        organizationId={organization.id}
        staff={staff}
        viewerUserId={userId}
        canManage={canManage}
        isOwner={isOwner}
      />
    </PageContainer>
  );
}
