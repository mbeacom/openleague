"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import {
  changePassword,
  deleteAccount,
  requestEmailChange,
  updateProfile,
} from "@/lib/actions/account";

interface AccountSettingsProps {
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  adminTeamCount: number;
}

interface SectionState {
  loading: boolean;
  error: string;
  success: string;
}

const idleSection: SectionState = { loading: false, error: "", success: "" };

export default function AccountSettings({
  email,
  name,
  emailVerified,
  createdAt,
  adminTeamCount,
}: AccountSettingsProps) {
  const router = useRouter();

  const [profileName, setProfileName] = useState(name ?? "");
  const [profileState, setProfileState] = useState<SectionState>(idleSection);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordState, setPasswordState] = useState<SectionState>(idleSection);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailState, setEmailState] = useState<SectionState>(idleSection);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteState, setDeleteState] = useState<SectionState>(idleSection);

  const handleProfileSave = async () => {
    setProfileState({ ...idleSection, loading: true });
    const result = await updateProfile({ name: profileName || undefined });
    if (result.success) {
      setProfileState({ ...idleSection, success: "Profile updated" });
      router.refresh();
    } else {
      setProfileState({ ...idleSection, error: result.error });
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmNewPassword) {
      setPasswordState({ ...idleSection, error: "New passwords do not match" });
      return;
    }
    setPasswordState({ ...idleSection, loading: true });
    const result = await changePassword({ currentPassword, newPassword });
    if (result.success) {
      setPasswordState({ ...idleSection, success: result.data.message });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } else {
      setPasswordState({ ...idleSection, error: result.error });
    }
  };

  const handleEmailChange = async () => {
    setEmailState({ ...idleSection, loading: true });
    const result = await requestEmailChange({ newEmail, password: emailPassword });
    if (result.success) {
      setEmailState({ ...idleSection, success: result.data.message });
      setNewEmail("");
      setEmailPassword("");
    } else {
      setEmailState({ ...idleSection, error: result.error });
    }
  };

  const handleDelete = async () => {
    setDeleteState({ ...idleSection, loading: true });
    const result = await deleteAccount({ password: deletePassword });
    if (result.success) {
      await signOut({ callbackUrl: "/" });
    } else {
      setDeleteState({ ...idleSection, error: result.error });
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 800, mb: 0.5 }}>
        Account Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Member since {new Date(createdAt).toLocaleDateString()}
      </Typography>

      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Profile
            </Typography>
            {profileState.error && <Alert severity="error" sx={{ mb: 2 }}>{profileState.error}</Alert>}
            {profileState.success && <Alert severity="success" sx={{ mb: 2 }}>{profileState.success}</Alert>}
            <Stack spacing={2}>
              <TextField
                label="Name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                fullWidth
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleProfileSave}
                  disabled={profileState.loading || profileName === (name ?? "")}
                >
                  {profileState.loading ? "Saving..." : "Save Profile"}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Email
              </Typography>
              <Chip
                size="small"
                color={emailVerified ? "success" : "warning"}
                label={emailVerified ? "Verified" : "Unverified"}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Current address: <strong>{email}</strong>. Changing it sends a confirmation
              link to the new address; nothing changes until you click it.
            </Typography>
            {emailState.error && <Alert severity="error" sx={{ mb: 2 }}>{emailState.error}</Alert>}
            {emailState.success && <Alert severity="success" sx={{ mb: 2 }}>{emailState.success}</Alert>}
            <Stack spacing={2}>
              <TextField
                label="New email address"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                fullWidth
                autoComplete="email"
              />
              <TextField
                label="Current password"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                fullWidth
                autoComplete="current-password"
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleEmailChange}
                  disabled={emailState.loading || !newEmail || !emailPassword}
                >
                  {emailState.loading ? "Sending..." : "Change Email"}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Password
            </Typography>
            {passwordState.error && <Alert severity="error" sx={{ mb: 2 }}>{passwordState.error}</Alert>}
            {passwordState.success && <Alert severity="success" sx={{ mb: 2 }}>{passwordState.success}</Alert>}
            <Stack spacing={2}>
              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                fullWidth
                autoComplete="current-password"
              />
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                fullWidth
                autoComplete="new-password"
                helperText="At least 8 characters"
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                fullWidth
                autoComplete="new-password"
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handlePasswordChange}
                  disabled={
                    passwordState.loading || !currentPassword || !newPassword || !confirmNewPassword
                  }
                >
                  {passwordState.loading ? "Updating..." : "Change Password"}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Your Data
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Download a copy of your personal data — profile, team memberships, roster
              links, RSVPs, and registrations — as JSON.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              component="a"
              href="/api/account/export"
              download
            >
              Export My Data
            </Button>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderColor: "error.main" }}>
          <CardContent>
            <Typography variant="h6" color="error" sx={{ fontWeight: 700, mb: 1 }}>
              Danger Zone
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Deleting your account permanently removes your profile, memberships, RSVPs,
              and registrations. This cannot be undone.
              {adminTeamCount > 0 && (
                <>
                  {" "}
                  You are an admin of {adminTeamCount} team{adminTeamCount === 1 ? "" : "s"} —
                  consider transferring admin rights first, or those teams may be left without
                  an administrator.
                </>
              )}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverIcon />}
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={deleteDialogOpen} onClose={() => !deleteState.loading && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This permanently deletes your account and cannot be undone. Enter your
            password to confirm.
          </DialogContentText>
          {deleteState.error && <Alert severity="error" sx={{ mb: 2 }}>{deleteState.error}</Alert>}
          <TextField
            label="Password"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            fullWidth
            autoFocus
            autoComplete="current-password"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleteState.loading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteState.loading || !deletePassword}
          >
            {deleteState.loading ? "Deleting..." : "Permanently Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
