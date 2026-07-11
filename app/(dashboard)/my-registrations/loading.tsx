import { Skeleton, Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function MyRegistrationsLoading() {
  return (
    <PageContainer maxWidth="md">
      <Skeleton variant="text" width={240} sx={{ fontSize: "2.125rem", mb: 3 }} />
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={120} />
      </Stack>
    </PageContainer>
  );
}
