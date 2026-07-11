import { Skeleton, Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function RosterLoading() {
  return (
    <PageContainer>
      <Skeleton variant="text" width={180} sx={{ fontSize: "2.125rem", mb: 3 }} />
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={96} />
        <Skeleton variant="rounded" height={96} />
        <Skeleton variant="rounded" height={96} />
      </Stack>
    </PageContainer>
  );
}
