import { Suspense } from "react";
import {
  Container,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";
import { isSystemAdmin, requireAuth } from "@/lib/auth/session";
import { getAllUsers } from "@/lib/actions/admin";
import UserApprovalList from "@/components/features/admin/UserApprovalList";

async function UserManagementContent() {
  const session = await requireAuth();

  // Check if user is system admin
  const isAdmin = await isSystemAdmin(session.user.id);

  if (!isAdmin) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Access Denied
        </Typography>
        <Typography variant="body1">
          You do not have permission to access this page. Only system administrators can manage user approvals.
        </Typography>
      </Container>
    );
  }

  const result = await getAllUsers();

  if (result.error || !result.data) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Error
        </Typography>
        <Typography variant="body1">
          {result.error || "Failed to load users"}
        </Typography>
      </Container>
    );
  }

  const users = result.data;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        User Management
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Approve or reject user accounts
      </Typography>

      <UserApprovalList users={users} />
    </Container>
  );
}

export default function UserManagementPage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
            <CircularProgress />
          </Box>
        </Container>
      }
    >
      <UserManagementContent />
    </Suspense>
  );
}
