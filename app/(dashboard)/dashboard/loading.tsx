import { Box, Container, Skeleton } from "@mui/material";

export default function DashboardLoading() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Skeleton variant="text" width={240} sx={{ fontSize: "2rem", mb: 3 }} />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
            gap: 3,
          }}
        >
          <Skeleton variant="rounded" height={220} />
          <Skeleton variant="rounded" height={220} />
          <Skeleton variant="rounded" height={220} />
        </Box>
        <Skeleton variant="text" width={220} sx={{ fontSize: "1.5rem", mt: 4, mb: 2 }} />
        <Skeleton variant="rounded" height={64} sx={{ mb: 1.5 }} />
        <Skeleton variant="rounded" height={64} />
      </Box>
    </Container>
  );
}
