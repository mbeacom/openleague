import { Box, Skeleton } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function VenuesLoading() {
  return (
    <PageContainer>
      <Skeleton variant="text" width={180} sx={{ fontSize: "2.125rem" }} />
      <Skeleton variant="text" width={320} sx={{ mb: 3 }} />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
          gap: 2,
        }}
      >
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={160} />
      </Box>
    </PageContainer>
  );
}
