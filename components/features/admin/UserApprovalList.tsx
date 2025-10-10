"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Stack,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { CheckCircle, Block } from "@mui/icons-material";
import { approveUser, rejectUser } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";
import type { Prisma } from "@prisma/client";

// Type-safe user type derived from Prisma query
type User = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    name: true;
    approved: true;
    createdAt: true;
    _count: {
      select: {
        teamMembers: true;
        leagueUsers: true;
      };
    };
  };
}>;

interface UserApprovalListProps {
  users: User[];
}

/**
 * Format date in a consistent, accessible way
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export default function UserApprovalList({ users }: UserApprovalListProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [userToReject, setUserToReject] = useState<User | null>(null);

  // Memoize filtered arrays for performance
  const pendingUsers = useMemo(() => users.filter((u) => !u.approved), [users]);
  const approvedUsers = useMemo(() => users.filter((u) => u.approved), [users]);

  const handleApprove = async (userId: string) => {
    setLoading(userId);
    setError(null);
    setSuccess(null);

    try {
      const result = await approveUser(userId);

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("User approved successfully!");
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handleRejectClick = (user: User) => {
    setUserToReject(user);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!userToReject) return;

    setLoading(userToReject.id);
    setError(null);
    setSuccess(null);
    setRejectDialogOpen(false);

    try {
      const result = await rejectUser(userToReject.id);

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("User rejected and account deleted");
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(null);
      setUserToReject(null);
    }
  };

  const handleRejectCancel = () => {
    setRejectDialogOpen(false);
    setUserToReject(null);
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Pending Approvals Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Pending Approvals ({pendingUsers.length})
        </Typography>

        {pendingUsers.length === 0 ? (
          <Alert severity="info">No pending user approvals</Alert>
        ) : (
          <Stack spacing={2}>
            {pendingUsers.map((user) => (
              <Card key={user.id}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6">{user.name || "No name provided"}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {user.email}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Signed up: {formatDate(user.createdAt)}
                      </Typography>
                    </Box>
                    <Box>
                      <Chip
                        label="Pending"
                        color="warning"
                        size="small"
                        sx={{ mr: 2 }}
                      />
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircle />}
                        onClick={() => handleApprove(user.id)}
                        disabled={loading === user.id}
                        sx={{ mr: 1 }}
                      >
                        {loading === user.id ? "Approving..." : "Approve"}
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Block />}
                        onClick={() => handleRejectClick(user)}
                        disabled={loading === user.id}
                      >
                        Reject
                      </Button>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      {/* Approved Users Section */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Approved Users ({approvedUsers.length})
        </Typography>

        {approvedUsers.length === 0 ? (
          <Alert severity="info">No approved users yet</Alert>
        ) : (
          <Stack spacing={2}>
            {approvedUsers.map((user) => (
              <Card key={user.id}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6">{user.name || "No name provided"}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {user.email}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Teams: {user._count.teamMembers} | Leagues: {user._count.leagueUsers}
                      </Typography>
                    </Box>
                    <Chip
                      label="Approved"
                      color="success"
                      size="small"
                      icon={<CheckCircle />}
                    />
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onClose={handleRejectCancel}>
        <DialogTitle>Reject User Account</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to reject and delete the account for{" "}
            <strong>{userToReject?.email}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRejectCancel}>Cancel</Button>
          <Button onClick={handleRejectConfirm} color="error" variant="contained">
            Reject & Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
