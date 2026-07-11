import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";
import { getPracticeSessionDetail } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Practice Session | OpenLeague",
  description: "View practice session details",
};

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function PracticeSessionDetailPage({ params }: PageProps) {
  const { sessionId } = await params;

  const data = await getPracticeSessionDetail(sessionId);

  if (data === null) {
    // Could be not found or no access — check if it truly doesn't exist or is inaccessible
    // getPracticeSessionDetail returns null for both; redirect non-members, notFound for missing
    notFound();
  }

  return (
    <PageContainer>
      <SessionDetailView session={data.session} isAdmin={data.isAdmin} />
    </PageContainer>
  );
}
