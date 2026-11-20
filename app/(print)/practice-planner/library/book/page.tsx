import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrillBook } from "@/components/features/practice-planner/print/DrillBook";
import { getPlayLibraryContext } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Drill Book | OpenLeague",
  description: "Printable book of your library's drills",
  robots: { index: false, follow: false },
};

/**
 * The same gate as the play library: team admins only. The library
 * context redirects an unauthenticated visitor to login, and a member who
 * isn't an admin gets a 404 here. Every drill the book loads goes through
 * the same server actions, which check the team again.
 */
export default async function DrillBookPage() {
  const context = await getPlayLibraryContext();
  if (!context?.isAdmin) notFound();

  return <DrillBook teamId={context.teamId} />;
}
