"use client";

import { useState, Suspense } from "react";
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
} from "@mui/material";
import Link from "next/link";
import { signup } from "@/lib/actions/auth";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get invitation parameters from URL
  const invitationEmail = searchParams.get("email");
  const invitationToken = searchParams.get("invitationToken");
  const teamName = searchParams.get("teamName");

  const [formData, setFormData] = useState({
    email: invitationEmail || "",
    password: "",
    name: "",
    invitationToken: invitationToken || undefined,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    setGeneralError("");

    try {
      // Call signup Server Action
      const result = await signup(formData);

      if (result.error) {
        if (result.details) {
          // Validation errors
          const fieldErrors: Record<string, string> = {};
          result.details.forEach((err) => {
            if (err.path && err.path.length > 0) {
              fieldErrors[String(err.path[0])] = err.message;
            }
          });
          setErrors(fieldErrors);
        } else {
          setGeneralError(result.error);
        }
        return;
      }

      // Signup successful, now sign in
      const signInResult = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (signInResult?.error) {
        setGeneralError("Account created but login failed. Please try logging in.");
        return;
      }

      // Redirect to dashboard
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Signup error:", error);
      setGeneralError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography component="h1" variant="h4" gutterBottom>
          Create Account
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {teamName
            ? `Join ${teamName} on openleague`
            : "Sign up to start managing your team"}
        </Typography>

        {generalError && (
          <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
            {generalError}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
          <TextField
            margin="normal"
            fullWidth
            id="name"
            label="Name (optional)"
            name="name"
            autoComplete="name"
            value={formData.name}
            onChange={handleChange}
            error={!!errors.name}
            helperText={errors.name}
          />
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
            error={!!errors.email}
            helperText={errors.email}
            type="email"
            disabled={!!invitationEmail}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            error={!!errors.password}
            helperText={errors.password || "Minimum 8 characters"}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={isLoading}
          >
            {isLoading ? "Creating Account..." : "Sign Up"}
          </Button>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2">
              Already have an account?{" "}
              <MuiLink component={Link} href="/login" underline="hover">
                Log in
              </MuiLink>
            </Typography>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<Container maxWidth="sm"><Box sx={{ mt: 8, textAlign: "center" }}>Loading...</Box></Container>}>
      <SignupForm />
    </Suspense>
  );
}
