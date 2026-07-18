"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Container,
  Link as MuiLink,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { resetPassword } from "@/lib/actions/account-lifecycle";
import { resetPasswordSchema } from "@/lib/utils/validation";
import { AUTH_MESSAGES } from "@/lib/config/constants";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [generalError, setGeneralError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError("");

    const validation = resetPasswordSchema.safeParse({ token, password });
    if (!validation.success) {
      setFieldErrors({ password: validation.error.issues[0]?.message ?? "Invalid password" });
      return;
    }
    if (password !== confirmPassword) {
      setFieldErrors({ confirm: "Passwords do not match" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await resetPassword(validation.data);
      if (result.success) {
        router.push(`/login?message=${AUTH_MESSAGES.PASSWORD_RESET_SUCCESS}`);
        return;
      }
      setGeneralError(result.error);
    } catch (error) {
      console.error("Password reset error:", error);
      setGeneralError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `
          linear-gradient(135deg, rgba(13, 71, 161, 0.02) 0%, rgba(25, 118, 210, 0.04) 50%, rgba(248, 250, 251, 1) 100%),
          repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(13, 71, 161, 0.01) 35px, rgba(13, 71, 161, 0.01) 70px)
        `,
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: 3,
            boxShadow: "0 8px 32px rgba(13, 71, 161, 0.12)",
            border: "2px solid",
            borderColor: "rgba(13, 71, 161, 0.08)",
            background: "linear-gradient(135deg, #FFFFFF 0%, #F8FAFB 100%)",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Box sx={{ mb: 3 }}>
              <Logo width={100} height={100} priority href={null} />
            </Box>
            <Typography
              component="h1"
              variant="h3"
              sx={{ fontWeight: 800, mb: 1, color: "primary.main", letterSpacing: "-0.02em" }}
            >
              Reset Password
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, fontWeight: 500 }}>
              Choose a new password for your account
            </Typography>

            {generalError && (
              <Alert
                severity="error"
                sx={{ width: "100%", mb: 3, borderRadius: 2, border: "2px solid", borderColor: "error.light" }}
              >
                {generalError}{" "}
                <MuiLink
                  component={Link}
                  href="/forgot-password"
                  underline="hover"
                  sx={{ fontWeight: 600 }}
                >
                  Request a new link
                </MuiLink>
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="New Password"
                type="password"
                id="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
                error={!!fieldErrors.password}
                helperText={fieldErrors.password ?? "At least 8 characters"}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm New Password"
                type="password"
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                }}
                error={!!fieldErrors.confirm}
                helperText={fieldErrors.confirm}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 4,
                  mb: 3,
                  py: 1.75,
                  fontSize: "1rem",
                  fontWeight: 700,
                  bgcolor: "primary.main",
                  boxShadow: "0 4px 16px rgba(13, 71, 161, 0.25)",
                  "&:hover": {
                    boxShadow: "0 6px 24px rgba(13, 71, 161, 0.35)",
                    transform: "translateY(-2px)",
                  },
                  "&:disabled": { bgcolor: "action.disabledBackground" },
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                disabled={isLoading || !password || !confirmPassword}
              >
                {isLoading ? "Updating..." : "Update Password"}
              </Button>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Back to{" "}
                  <MuiLink
                    component={Link}
                    href="/login"
                    underline="hover"
                    sx={{ color: "primary.main", fontWeight: 600, "&:hover": { color: "primary.dark" } }}
                  >
                    Log in
                  </MuiLink>
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
