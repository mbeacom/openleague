import { Skeleton, Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function CalendarLoading() {
  return (
    <PageContainer>
      <Skeleton variant="text" width={200} sx={{ fontSize: "2.125rem" }} />
      <Skeleton variant="text" width={240} sx={{ mb: 3 }} />
      <Skeleton variant="text" width={200} sx={{ fontSize: "1.5rem", mb: 2 }} />
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={112} />
        <Skeleton variant="rounded" height={112} />
        <Skeleton variant="rounded" height={112} />
      </Stack>
    </PageContainer>
  );
}
