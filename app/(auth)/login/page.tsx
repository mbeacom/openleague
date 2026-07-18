"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Alert,
  Link as MuiLink,
  CircularProgress,
  Paper,
} from "@mui/material";
import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { loginSchema, pickField } from "@/lib/utils/validation";
import { AUTH_MESSAGES, AUTH_ERROR_CODES } from "@/lib/config/constants";
import { resendVerificationEmail } from "@/lib/actions/account-lifecycle";
import { trackAuth } from "@/lib/analytics/umami";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const message = searchParams.get("message");
  const verified = searchParams.get("verified");
  const urlError = searchParams.get("error");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Set info message based on query parameters
  useEffect(() => {
    if (message === AUTH_MESSAGES.SIGNUP_CHECK_EMAIL) {
      setInfoMessage(AUTH_MESSAGES.CHECK_EMAIL_MESSAGE);
    } else if (message === AUTH_MESSAGES.SIGNUP_READY) {
      setInfoMessage(AUTH_MESSAGES.SIGNUP_READY_MESSAGE);
    } else if (message === AUTH_MESSAGES.PASSWORD_RESET_SUCCESS) {
      setInfoMessage(AUTH_MESSAGES.PASSWORD_RESET_SUCCESS_MESSAGE);
    } else if (verified === "1") {
      setInfoMessage(AUTH_MESSAGES.EMAIL_VERIFIED_MESSAGE);
    }
    if (urlError === "verification_invalid") {
      setGeneralError(AUTH_MESSAGES.VERIFICATION_INVALID_MESSAGE);
      setShowResend(true);
    }
  }, [message, verified, urlError]);

  const handleResendVerification = async () => {
    if (!formData.email) {
      setErrors((prev) => ({ ...prev, email: "Enter your email above first" }));
      return;
    }
    setIsResending(true);
    try {
      const result = await resendVerificationEmail({ email: formData.email });
      setGeneralError("");
      setShowResend(false);
      setInfoMessage(
        result.success ? result.data.message : "Unable to resend right now. Please try again later."
      );
    } catch (error) {
      console.error("Resend verification error:", error);
      setInfoMessage("Unable to resend right now. Please try again later.");
    } finally {
      setIsResending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Validate individual field on blur
    if (name === 'email' || name === 'password') {
      const fieldSchema = pickField(loginSchema, name);
      const validationResult = fieldSchema.safeParse({ [name]: value });

      if (validationResult.success) {
        // Clear error if validation passes
        if (errors[name]) {
          setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[name];
            return newErrors;
          });
        }
      } else {
        // Set error if validation fails
        const fieldError = validationResult.error.issues[0]?.message;
        if (fieldError) {
          setErrors((prev) => ({ ...prev, [name]: fieldError }));
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    setGeneralError("");

    // Validate with Zod schema
    const validationResult = loginSchema.safeParse(formData);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
      });
      setErrors(fieldErrors);
      setIsLoading(false);
      return;
    }

    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        // Auth.js v5 may pass the custom code via result.code or embed it in result.error
        const errorCode = result.code || result.error;

        if (errorCode?.includes(AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED)) {
          setGeneralError(AUTH_MESSAGES.EMAIL_NOT_VERIFIED);
          setShowResend(true);
        } else if (errorCode?.includes(AUTH_ERROR_CODES.ACCOUNT_NOT_APPROVED)) {
          setGeneralError(AUTH_MESSAGES.ACCOUNT_NOT_APPROVED);
        } else if (errorCode?.includes(AUTH_ERROR_CODES.INVALID_CREDENTIALS)) {
          setGeneralError("Invalid email or password");
        } else {
          setGeneralError("Unable to sign in. Please try again.");
        }
        return;
      }

      // Track successful login
      trackAuth('login');

      // Redirect to callback URL or dashboard
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      console.error("Login error:", error);
      setGeneralError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
            boxShadow: '0 8px 32px rgba(13, 71, 161, 0.12)',
            border: '2px solid',
            borderColor: 'rgba(13, 71, 161, 0.08)',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFB 100%)',
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Box sx={{ mb: 3 }}>
              <Logo width={100} height={100} priority href={null} />
            </Box>
            <Typography
              component="h1"
              variant="h3"
              sx={{
                fontWeight: 800,
                mb: 1,
                color: 'primary.main',
                letterSpacing: '-0.02em',
              }}
            >
              Welcome Back
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 4, fontWeight: 500 }}
            >
              Log in to your OpenLeague account
            </Typography>

            {infoMessage && (
              <Alert
                severity="info"
                sx={{
                  width: "100%",
                  mb: 3,
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: 'info.light',
                }}
              >
                {infoMessage}
              </Alert>
            )}

            {generalError && (
              <Alert
                severity="error"
                sx={{
                  width: "100%",
                  mb: 3,
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: 'error.light',
                }}
              >
                {generalError}
                {showResend && (
                  <Box sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      onClick={handleResendVerification}
                      disabled={isResending}
                    >
                      {isResending ? "Sending..." : "Resend verification email"}
                    </Button>
                  </Box>
                )}
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
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={!!errors.email}
                helperText={errors.email}
                type="email"
                inputProps={{
                  inputMode: 'email',
                }}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                error={!!errors.password}
                helperText={errors.password}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 4,
                  mb: 3,
                  py: 1.75,
                  fontSize: '1rem',
                  fontWeight: 700,
                  bgcolor: 'primary.main',
                  boxShadow: '0 4px 16px rgba(13, 71, 161, 0.25)',
                  '&:hover': {
                    boxShadow: '0 6px 24px rgba(13, 71, 161, 0.35)',
                    transform: 'translateY(-2px)',
                  },
                  '&:disabled': {
                    bgcolor: 'action.disabledBackground',
                  },
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                disabled={isLoading || !formData.email || !formData.password || Object.keys(errors).some(key => errors[key])}
              >
                {isLoading ? "Logging in..." : "Log In"}
              </Button>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <MuiLink
                    component={Link}
                    href="/forgot-password"
                    underline="hover"
                    sx={{
                      color: 'primary.main',
                      fontWeight: 600,
                      '&:hover': {
                        color: 'primary.dark',
                      },
                    }}
                  >
                    Forgot your password?
                  </MuiLink>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Don&apos;t have an account?{" "}
                  <MuiLink
                    component={Link}
                    href="/signup"
                    underline="hover"
                    sx={{
                      color: 'primary.main',
                      fontWeight: 600,
                      '&:hover': {
                        color: 'primary.dark',
                      },
                    }}
                  >
                    Sign up free
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress size={60} />
        </Box>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
