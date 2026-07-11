import { Skeleton, Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function PracticePlannerLoading() {
  return (
    <PageContainer>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Skeleton variant="text" width={240} sx={{ fontSize: "2.125rem" }} />
        <Skeleton variant="rounded" width={150} height={44} />
      </Stack>
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={104} />
        <Skeleton variant="rounded" height={104} />
        <Skeleton variant="rounded" height={104} />
      </Stack>
    </PageContainer>
  );
}
