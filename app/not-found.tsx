import type { Metadata } from "next";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import { Box, Stack } from "@mui/material";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { LinkButton } from "@/components/ui/NextLinkComposites";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function RootNotFound() {
  return (
    <PageContainer maxWidth="md">
      <Box
        sx={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <EmptyState
          icon={<SearchOffIcon />}
          title="Page not found"
          description="The page you are looking for does not exist or may have been moved. Check the address, or head back to familiar ice."
          action={
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <LinkButton href="/" variant="contained" sx={{ minHeight: 44 }}>
                Go to home
              </LinkButton>
              <LinkButton href="/dashboard" variant="outlined" sx={{ minHeight: 44 }}>
                Open dashboard
              </LinkButton>
            </Stack>
          }
        />
      </Box>
    </PageContainer>
  );
}
