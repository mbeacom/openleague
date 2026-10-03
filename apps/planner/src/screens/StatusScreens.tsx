import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { staticRoutes } from "../routes";

export const DRILL_NOT_ON_DEVICE_MESSAGE = "This drill isn't on this device.";

export function LoadingScreen() {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }} role="status" aria-label="Loading">
            <CircularProgress />
        </Box>
    );
}

export function MissingScreen({
    message,
    backHref = staticRoutes.list(),
    backLabel = "Back to practices",
}: {
    message: string;
    backHref?: string;
    backLabel?: string;
}) {
    return (
        <Stack spacing={2} alignItems="flex-start">
            <Alert severity="info" sx={{ alignSelf: "stretch" }}>
                {message}
            </Alert>
            <Button href={backHref} startIcon={<ArrowBackIcon />}>
                {backLabel}
            </Button>
        </Stack>
    );
}

export function NotFoundScreen() {
    return <MissingScreen message="This page doesn't exist." />;
}
