import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BenchSheet } from "@/components/features/practice-planner/print/BenchSheet";
import { getPracticeSessionDetail } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Bench Sheet | OpenLeague",
  description: "Printable practice session bench sheet",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * The same gate as the session detail page: the query redirects an
 * unauthenticated visitor to login (requireUserId), and returns null for a
 * non-member or for a member viewing an unshared session, which is a 404 here.
 * There is no public or shareable link (ADR-0011).
 */
export default async function BenchSheetPage({ params }: PageProps) {
  const { sessionId } = await params;

  const data = await getPracticeSessionDetail(sessionId);
  if (data === null) notFound();

  return <BenchSheet session={data.session} />;
}
