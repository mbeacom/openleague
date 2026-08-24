import { notFound, redirect } from "next/navigation";
import { Chip, Container, Stack, Typography } from "@mui/material";

import { LinkButton } from "@/components/ui/NextLinkComposites";
import { getPublicContentItem } from "@/lib/actions/public-content";
import { formatDateTime } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

/** One public announcement or news item. */
export default async function PublicNewsItemPage({
  params,
}: {
  params: Promise<{ slug: string; contentSlug: string }>;
}) {
  const { slug, contentSlug } = await params;
  const result = await getPublicContentItem(slug, contentSlug);
  if (!result) notFound();

  const { item, association } = result;
  if (association.slug !== slug) {
    redirect(`/associations/${association.slug}/news/${contentSlug}`);
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
      <Stack spacing={3}>
        <LinkButton
          href={`/associations/${association.slug}`}
          variant="text"
          sx={{ alignSelf: "flex-start", minHeight: 44 }}
        >
          ← {association.name}
        </LinkButton>

        <div>
          <Typography variant="h3" component="h1">
            {item.title}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            {item.publishAt ? (
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(item.publishAt)}
              </Typography>
            ) : null}
            {item.team ? <Chip size="small" label={item.team.name} /> : null}
          </Stack>
        </div>

        {/* Rendered as text, not HTML: the body is stored exactly as authored
            and React escapes it here, so a post can never inject markup. */}
        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
          {item.body}
        </Typography>
      </Stack>
    </Container>
  );
}
