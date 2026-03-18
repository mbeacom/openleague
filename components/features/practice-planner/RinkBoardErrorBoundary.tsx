"use client";

import React from "react";
import { Box, Typography, Button, Alert } from "@mui/material";
import { Refresh as RefreshIcon, SportsHockey as HockeyIcon } from "@mui/icons-material";

interface RinkBoardErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface RinkBoardErrorBoundaryProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
}

export class RinkBoardErrorBoundary extends React.Component<
  RinkBoardErrorBoundaryProps,
  RinkBoardErrorBoundaryState
> {
  constructor(props: RinkBoardErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): RinkBoardErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("RinkBoard rendering error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            width: this.props.width || "100%",
            height: this.props.height || 400,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "grey.50",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            gap: 2,
            p: 3,
          }}
        >
          <HockeyIcon sx={{ fontSize: 48, color: "grey.400" }} />
          <Alert severity="warning" sx={{ maxWidth: 400 }}>
            <Typography variant="body2">
              The rink board failed to render. This may be caused by invalid
              play data or a browser compatibility issue.
            </Typography>
          </Alert>
          <Button
            variant="outlined"
            size="small"
            onClick={this.handleRetry}
            startIcon={<RefreshIcon />}
          >
            Try Again
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
