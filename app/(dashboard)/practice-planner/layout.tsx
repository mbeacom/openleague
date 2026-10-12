import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { HostedPlannerProvider } from "@/components/providers/HostedPlannerProvider";
import { PLANNER_INSET_VARS } from "@/components/features/practice-planner/planner-layout";

/**
 * Planner components read their store and platform from context (ADR-0020).
 * The insets are the dashboard chrome the planner's sticky parts must clear:
 * below md, the sticky top app bar (Toolbar: 56px, 64px from sm) and the fixed
 * bottom navigation (56px); from md, neither shows (DashboardShell).
 */
export default function PracticePlannerLayout({ children }: { children: ReactNode }) {
    return (
        <Box
            sx={{
                [PLANNER_INSET_VARS.top]: { xs: "56px", sm: "64px", md: "0px" },
                [PLANNER_INSET_VARS.bottom]: { xs: "56px", md: "0px" },
            }}
        >
            <HostedPlannerProvider>{children}</HostedPlannerProvider>
        </Box>
    );
}
