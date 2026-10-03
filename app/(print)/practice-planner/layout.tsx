import type { ReactNode } from "react";
import { HostedPlannerProvider } from "@/components/providers/HostedPlannerProvider";

/** The bench sheet is outside the dashboard route group, so it needs its own provider (ADR-0020). */
export default function PracticePlannerPrintLayout({ children }: { children: ReactNode }) {
    return <HostedPlannerProvider>{children}</HostedPlannerProvider>;
}
