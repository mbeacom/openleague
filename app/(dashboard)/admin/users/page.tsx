import { Suspense } from "react";
import { Typography, Box, CircularProgress } from "@mui/material";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { isAnyLeagueAdmin, requireUserId } from "@/lib/auth/session";
import { getAllUsers } from "@/lib/actions/admin";
import UserApprovalList from "@/components/features/admin/UserApprovalList";

async function UserManagementContent() {
  const userId = await requireUserId();

  // Check if user is an admin (LEAGUE_ADMIN of any league)
  const isAdmin = await isAnyLeagueAdmin(userId);

  if (!isAdmin) {
    return (
      <PageContainer>
        <PageHeader title="Access Denied" />
        <Typography variant="body1">
          You do not have permission to access this page. Only system administrators can manage user approvals.
        </Typography>
      </PageContainer>
    );
  }

  const result = await getAllUsers();

  if (result.error || !result.data) {
    return (
      <PageContainer>
        <PageHeader title="Error" />
        <Typography variant="body1">
          {result.error || "Failed to load users"}
        </Typography>
      </PageContainer>
    );
  }

  const users = result.data;

  return (
    <PageContainer>
      <PageHeader title="User Management" subtitle="Approve or reject user accounts" />
      <UserApprovalList users={users} />
    </PageContainer>
  );
}

export default function UserManagementPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
            <CircularProgress />
          </Box>
        </PageContainer>
      }
    >
      <UserManagementContent />
    </Suspense>
  );
}
