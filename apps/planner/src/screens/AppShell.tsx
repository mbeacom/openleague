/**
 * The static planner's chrome: a League Blue bar, the storage banners, a
 * playbook-grid canvas and the privacy footer.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Alert, AppBar, Box, Button, Container, Link, Stack, Toolbar, Typography } from "@mui/material";
import { HOSTED_URL, PRIVACY_NOTE } from "../config";
import { staticRoutes } from "../routes";
import type { StaleSignal } from "../store/open-store";

export const NOT_SAVING_MESSAGE =
    "This browser isn't letting the planner save. Your work will be lost when you close this tab. Download plan files to keep it.";
export const STALE_TAB_MESSAGE = "The planner was updated in another tab. Reload to continue.";

export function AppShell({ durable, stale, children }: { durable: boolean; stale: StaleSignal; children: ReactNode }) {
    const isStale = useSyncExternalStore(stale.subscribe, stale.isStale, () => false);
    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
            <AppBar
                position="sticky"
                elevation={0}
                sx={{ borderBottom: "4px solid", borderImage: "linear-gradient(90deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%) 1" }}
            >
                <Toolbar sx={{ gap: 1, flexWrap: "wrap", py: { xs: 1, sm: 0 } }}>
                    <Typography
                        component="a"
                        href={staticRoutes.list()}
                        variant="h6"
                        sx={{ fontWeight: 800, letterSpacing: "-0.02em", color: "inherit", flexGrow: 1 }}
                    >
                        OpenLeague Planner
                    </Typography>
                    <Button color="inherit" href={staticRoutes.list()}>
                        Practices
                    </Button>
                    <Button color="inherit" href={staticRoutes.library()}>
                        Drill library
                    </Button>
                    <Button color="inherit" href={staticRoutes.importPlan()}>
                        Import
                    </Button>
                </Toolbar>
            </AppBar>
            {!durable && (
                <Alert severity="warning" square>
                    {NOT_SAVING_MESSAGE}
                </Alert>
            )}
            {isStale && (
                <Alert
                    severity="info"
                    square
                    action={
                        <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                            Reload
                        </Button>
                    }
                >
                    {STALE_TAB_MESSAGE}
                </Alert>
            )}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    backgroundImage:
                        "linear-gradient(rgba(13, 71, 161, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(13, 71, 161, 0.04) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                }}
            >
                <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
                    {children}
                </Container>
            </Box>
            <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", py: 2 }}>
                <Container maxWidth="lg">
                    <Stack spacing={0.5}>
                        <Typography variant="body2" color="text.secondary">
                            {PRIVACY_NOTE}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Team sharing, RSVPs and venue booking live in{" "}
                            <Link href={HOSTED_URL} underline="always">
                                OpenLeague
                            </Link>
                            .
                        </Typography>
                    </Stack>
                </Container>
            </Box>
        </Box>
    );
}
