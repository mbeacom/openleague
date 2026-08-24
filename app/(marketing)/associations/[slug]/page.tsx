import { notFound, redirect } from "next/navigation";
import { Container } from "@mui/material";

import PublicAssociationProfile from "@/components/features/association-profile/PublicAssociationProfile";
import { getPublicAssociationProfile } from "@/lib/actions/association-profile";

export const dynamic = "force-dynamic";

/**
 * Public association home (feature 007 / User Story 4).
 *
 * Reads only through the allowlist selectors in lib/utils/public-associations.ts,
 * so no roster, contact, payment, gear-inventory, or outbox field can reach this
 * page by accident.
 */
export default async function PublicAssociationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const association = await getPublicAssociationProfile(slug);

  if (!association) notFound();

  // One canonical URL per association: a retired slug redirects rather than
  // serving the page at a stale address, so shared links stay valid without
  // splitting search-engine and analytics identity across two paths.
  if (association.canonicalSlug !== slug) {
    redirect(`/associations/${association.canonicalSlug}`);
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
      <PublicAssociationProfile association={association} />
    </Container>
  );
}
