import { Box, Container, Skeleton, Stack } from "@mui/material";

export default function DashboardLoading() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Skeleton variant="text" width={240} sx={{ fontSize: "2rem", mb: 3 }} />
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={120} />
        </Stack>
      </Box>
    </Container>
  );
}
