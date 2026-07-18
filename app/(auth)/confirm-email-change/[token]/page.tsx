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
  Typography,
} from "@mui/material";
import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { confirmEmailChange } from "@/lib/actions/account-lifecycle";
import { AUTH_MESSAGES } from "@/lib/config/constants";

export default function ConfirmEmailChangePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await confirmEmailChange(token);
      if (result.success) {
        router.push(`/login?message=${AUTH_MESSAGES.EMAIL_CHANGED}`);
        return;
      }
      setError(result.error);
    } catch (err) {
      console.error("Email change confirmation error:", err);
      setError("Something went wrong. Please try again.");
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
              Confirm Email Change
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, fontWeight: 500, textAlign: "center" }}>
              Confirm this as the new email address for your account. You&apos;ll need to log in
              again afterward.
            </Typography>

            {error && (
              <Alert
                severity="error"
                sx={{ width: "100%", mb: 3, borderRadius: 2, border: "2px solid", borderColor: "error.light" }}
              >
                {error}
              </Alert>
            )}

            <Button
              onClick={handleConfirm}
              fullWidth
              variant="contained"
              sx={{
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
              disabled={isLoading}
            >
              {isLoading ? "Confirming..." : "Confirm Email Change"}
            </Button>

            <Box sx={{ textAlign: "center", mt: 3 }}>
              <Typography variant="body2" color="text.secondary">
                <MuiLink
                  component={Link}
                  href="/login"
                  underline="hover"
                  sx={{ color: "primary.main", fontWeight: 600, "&:hover": { color: "primary.dark" } }}
                >
                  Back to log in
                </MuiLink>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
