import { Skeleton, Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function SeasonsLoading() {
  return (
    <PageContainer maxWidth="md">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Skeleton variant="text" width={160} sx={{ fontSize: "2.125rem" }} />
        <Stack direction="row" spacing={1}>
          <Skeleton variant="rounded" width={132} height={44} />
          <Skeleton variant="rounded" width={132} height={44} />
        </Stack>
      </Stack>
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={88} />
        <Skeleton variant="rounded" height={88} />
        <Skeleton variant="rounded" height={88} />
      </Stack>
    </PageContainer>
  );
}
