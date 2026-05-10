import { notFound } from "next/navigation";
import { Container, Stack } from "@mui/material";
import { PublicRinkProfile } from "@/components/features/venue-admin/PublicRinkProfile";
import { getPublicRinkProfile } from "@/lib/actions/venue-organizations";

interface PublicRinkPageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicRinkPage({ params }: PublicRinkPageProps) {
  const { slug } = await params;
  const venue = await getPublicRinkProfile(slug);

  if (!venue) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: { xs: 8, md: 10 } }}>
        <PublicRinkProfile venue={venue} />
      </Stack>
    </Container>
  );
}
