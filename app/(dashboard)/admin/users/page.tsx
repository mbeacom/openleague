import { Suspense } from "react";
import {
  Container,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import UserApprovalList from "@/components/features/admin/UserApprovalList";

/**
 * Check if user is a system admin (LEAGUE_ADMIN in any league)
 */
async function isSystemAdmin(userId: string): Promise<boolean> {
  const adminCount = await prisma.leagueUser.count({
    where: {
      userId,
      role: "LEAGUE_ADMIN",
    },
  });

  return adminCount > 0;
}

/**
 * Get all users with their approval status
 */
async function getUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      approved: true,
      createdAt: true,
      _count: {
        select: {
          teamMembers: true,
          leagueUsers: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return users;
}

async function UserManagementContent() {
  const session = await requireAuth();

  if (!session.user?.id) {
    redirect("/login");
  }

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

  const users = await getUsers();

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
