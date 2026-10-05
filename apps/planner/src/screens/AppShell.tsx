/**
 * The static planner's chrome: a League Blue bar, the storage banners, a
 * playbook-grid canvas and the privacy footer.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Alert, AppBar, Box, Button, Container, Link, Stack, Toolbar, Typography } from "@mui/material";
import { HOSTED_URL, PRIVACY_NOTE } from "../config";
import { staticRoutes, type NavSection } from "../routes";
import type { StaleSignal } from "../store/open-store";

export const NOT_SAVING_MESSAGE =
    "This browser isn't letting the planner save. Your work will be lost when you close this tab. Download plan files to keep it.";
export const STALE_TAB_MESSAGE = "The planner was updated in another tab. Reload to continue.";

const NAV_ITEMS: ReadonlyArray<{ section: NavSection; label: string; href: string }> = [
    { section: "practices", label: "Practices", href: staticRoutes.list() },
    { section: "library", label: "Drill library", href: staticRoutes.library() },
    { section: "import", label: "Import", href: staticRoutes.importPlan() },
];

export function AppShell({
    durable,
    stale,
    section = null,
    teamControl,
    children,
}: {
    durable: boolean;
    stale: StaleSignal;
    /** The current route's section, marked aria-current in the nav. */
    section?: NavSection | null;
    /** The "Your team" button, beside the title. */
    teamControl?: ReactNode;
    children: ReactNode;
}) {
    const isStale = useSyncExternalStore(stale.subscribe, stale.isStale, () => false);
    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
            <AppBar
                position="sticky"
                elevation={0}
                sx={{ borderBottom: "4px solid", borderImage: "linear-gradient(90deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%) 1" }}
            >
                {/* Phones: the title, then the nav as one compact row of equal buttons; wider screens: one row. */}
                <Toolbar sx={{ flexWrap: { xs: "wrap", sm: "nowrap" }, columnGap: 1, px: { xs: 1.5, sm: 2 }, py: { xs: 0.5, sm: 0 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", columnGap: 1, flexGrow: 1, flexBasis: { xs: "100%", sm: "auto" }, minWidth: 0 }}>
                        <Typography
                            component="a"
                            href={staticRoutes.list()}
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                                letterSpacing: "-0.02em",
                                color: "inherit",
                                flexGrow: 1,
                                fontSize: { xs: "1.0625rem", sm: "1.25rem" },
                                lineHeight: { xs: "36px", sm: "inherit" },
                            }}
                        >
                            OpenLeague Planner
                        </Typography>
                        {teamControl}
                    </Box>
                    <Box component="nav" aria-label="Planner" sx={{ display: "flex", gap: 0.5, width: { xs: "100%", sm: "auto" } }}>
                        {NAV_ITEMS.map((item) => {
                            const active = item.section === section;
                            return (
                                <Button
                                    key={item.section}
                                    color="inherit"
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    sx={{
                                        flex: { xs: 1, sm: "none" },
                                        minHeight: 44,
                                        px: { xs: 1, sm: 1.5 },
                                        whiteSpace: "nowrap",
                                        bgcolor: active ? "rgba(255, 255, 255, 0.16)" : undefined,
                                    }}
                                >
                                    {item.label}
                                </Button>
                            );
                        })}
                    </Box>
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
