import { Skeleton, Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function VenueAdminLoading() {
  return (
    <PageContainer>
      <Skeleton variant="text" width={260} sx={{ fontSize: "2.125rem" }} />
      <Skeleton variant="text" width={320} sx={{ mb: 3 }} />
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={140} />
      </Stack>
    </PageContainer>
  );
}
