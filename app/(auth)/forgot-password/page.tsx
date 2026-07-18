"use client";

import { useState } from "react";
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
import { requestPasswordReset } from "@/lib/actions/account-lifecycle";
import { forgotPasswordSchema } from "@/lib/utils/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError("");
    setGeneralError("");

    const validation = forgotPasswordSchema.safeParse({ email });
    if (!validation.success) {
      setFieldError(validation.error.issues[0]?.message ?? "Invalid email address");
      return;
    }

    setIsLoading(true);
    try {
      const result = await requestPasswordReset(validation.data);
      if (result.success) {
        setSuccessMessage(result.data.message);
      } else {
        setGeneralError(result.error);
      }
    } catch (error) {
      console.error("Password reset request error:", error);
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
              Forgot Password
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, fontWeight: 500, textAlign: "center" }}>
              Enter your email and we&apos;ll send you a link to reset your password
            </Typography>

            {successMessage && (
              <Alert
                severity="success"
                sx={{ width: "100%", mb: 3, borderRadius: 2, border: "2px solid", borderColor: "success.light" }}
              >
                {successMessage}
              </Alert>
            )}

            {generalError && (
              <Alert
                severity="error"
                sx={{ width: "100%", mb: 3, borderRadius: 2, border: "2px solid", borderColor: "error.light" }}
              >
                {generalError}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldError("");
                }}
                error={!!fieldError}
                helperText={fieldError}
                inputProps={{ inputMode: "email" }}
                disabled={!!successMessage}
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
                disabled={isLoading || !email || !!successMessage}
              >
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Remembered your password?{" "}
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
