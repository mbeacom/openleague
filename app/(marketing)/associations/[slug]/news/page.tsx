import { notFound, redirect } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { LinkButton, LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { resolvePublicAssociation } from "@/lib/actions/association-profile";
import { listPublicAssociationContentPage } from "@/lib/actions/public-content";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function PublicAssociationNewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { slug } = await params;
  const rawPage = (await searchParams).page;
  const parsedPage = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const association = await resolvePublicAssociation(slug);
  if (!association) notFound();
  if (association.canonicalSlug !== slug) {
    redirect(
      `/associations/${association.canonicalSlug}/news${page > 1 ? `?page=${page}` : ""}`,
    );
  }

  const result = await listPublicAssociationContentPage(
    association.id,
    page,
    PAGE_SIZE,
  );
  if (page > result.totalPages) notFound();

  const base = `/associations/${association.canonicalSlug}`;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
      <Stack spacing={3}>
        <div>
          <Typography variant="h3" component="h1">
            News
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Public announcements from the association and its teams.
          </Typography>
        </div>

        <LinkButton href={base} variant="outlined" sx={{ alignSelf: "flex-start" }}>
          Back to association
        </LinkButton>

        {result.items.length === 0 ? (
          <Typography color="text.secondary">No public announcements yet.</Typography>
        ) : (
          <Stack spacing={2}>
            {result.items.map((item) => (
              <Card key={item.id} variant="outlined">
                <LinkCardActionArea href={`${base}/news/${item.slug}`}>
                  <CardContent>
                    <Typography variant="h6" component="h2">
                      {item.title}
                    </Typography>
                    {item.summary ? (
                      <Typography variant="body2" color="text.secondary">
                        {item.summary}
                      </Typography>
                    ) : null}
                  </CardContent>
                </LinkCardActionArea>
              </Card>
            ))}
          </Stack>
        )}

        {result.totalPages > 1 ? (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ sm: "center" }}
          >
            <Stack direction="row" spacing={1}>
              {page > 1 ? (
                <LinkButton href={`${base}/news?page=${page - 1}`} variant="outlined">
                  Previous
                </LinkButton>
              ) : null}
              {page < result.totalPages ? (
                <LinkButton href={`${base}/news?page=${page + 1}`} variant="outlined">
                  Next
                </LinkButton>
              ) : null}
            </Stack>
            <Box
              component="form"
              method="get"
              action={`${base}/news`}
              sx={{ display: "flex", gap: 1, alignItems: "center" }}
            >
              <TextField
                name="page"
                label="Page"
                type="number"
                defaultValue={page}
                size="small"
                slotProps={{ htmlInput: { min: 1, max: result.totalPages } }}
                sx={{ width: 110 }}
              />
              <Button type="submit" variant="outlined">
                Go
              </Button>
              <Typography variant="body2" color="text.secondary">
                of {result.totalPages}
              </Typography>
            </Box>
          </Stack>
        ) : null}
      </Stack>
    </Container>
  );
}
