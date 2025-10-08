import React from "react";
import { Box, Card, CardContent, Typography, Button, Alert } from "@mui/material";
import { CheckCircle as CheckCircleIcon, Error as ErrorIcon } from "@mui/icons-material";
import { handleUnsubscribe } from "@/lib/actions/notifications";
import Link from "next/link";

interface UnsubscribePageProps {
  searchParams: {
    token?: string;
  };
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const { token } = searchParams;

  if (!token) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="background.default"
        p={2}
      >
        <Card sx={{ maxWidth: 500, width: "100%" }}>
          <CardContent sx={{ textAlign: "center", p: 4 }}>
            <ErrorIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Invalid Unsubscribe Link
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              The unsubscribe link you clicked is invalid or incomplete. Please check your email
              and try clicking the link again.
            </Typography>
            <Button
              component={Link}
              href="/"
              variant="contained"
              sx={{ mt: 2 }}
            >
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Process the unsubscribe request
  const result = await handleUnsubscribe({ token });

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="background.default"
      p={2}
    >
      <Card sx={{ maxWidth: 500, width: "100%" }}>
        <CardContent sx={{ textAlign: "center", p: 4 }}>
          {result.success ? (
            <>
              <CheckCircleIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Successfully Unsubscribed
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                You have been unsubscribed from email notifications
                {result.data.leagueName && ` for ${result.data.leagueName}`}.
              </Typography>
              <Alert severity="info" sx={{ mt: 2, mb: 3, textAlign: "left" }}>
                <Typography variant="body2">
                  <strong>What this means:</strong>
                  <br />
                  • You will no longer receive email notifications
                  <br />
                  • You can still access your account and use the platform
                  <br />
                  • You can re-enable notifications in your account settings
                </Typography>
              </Alert>
              <Box display="flex" gap={2} justifyContent="center">
                <Button
                  component={Link}
                  href="/login"
                  variant="contained"
                >
                  Sign In to Account
                </Button>
                <Button
                  component={Link}
                  href="/"
                  variant="outlined"
                >
                  Go to Homepage
                </Button>
              </Box>
            </>
          ) : (
            <>
              <ErrorIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Unsubscribe Failed
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                {result.error || "The unsubscribe link is invalid or has expired."}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                If you continue to receive unwanted emails, please contact support or sign in to
                your account to manage your notification preferences.
              </Typography>
              <Box display="flex" gap={2} justifyContent="center">
                <Button
                  component={Link}
                  href="/login"
                  variant="contained"
                >
                  Sign In to Account
                </Button>
                <Button
                  component={Link}
                  href="/"
                  variant="outlined"
                >
                  Go to Homepage
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}