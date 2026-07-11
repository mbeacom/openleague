import { Box, Skeleton, Stack } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";

export default function CalendarLoading() {
  return (
    <PageContainer>
      <Skeleton variant="text" width={200} sx={{ fontSize: "2.125rem" }} />
      <Skeleton variant="text" width={320} sx={{ mb: 3 }} />

      {/* Month navigation + view toggle */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Skeleton variant="circular" width={32} height={32} />
        <Skeleton variant="circular" width={32} height={32} />
        <Skeleton variant="rounded" width={72} height={30} />
        <Skeleton variant="text" width={140} sx={{ fontSize: "1.25rem", ml: 1 }} />
      </Stack>

      {/* Overlay chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Skeleton variant="rounded" width={96} height={24} sx={{ borderRadius: 12 }} />
        <Skeleton variant="rounded" width={112} height={24} sx={{ borderRadius: 12 }} />
        <Skeleton variant="rounded" width={88} height={24} sx={{ borderRadius: 12 }} />
      </Stack>

      {/* Month grid (md+) */}
      <Box
        sx={{
          display: { xs: "none", md: "grid" },
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 0.5,
        }}
      >
        {Array.from({ length: 35 }, (_, index) => (
          <Skeleton key={index} variant="rounded" height={104} />
        ))}
      </Box>

      {/* Agenda list (mobile) */}
      <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} variant="rounded" height={64} />
        ))}
      </Stack>
    </PageContainer>
  );
}
