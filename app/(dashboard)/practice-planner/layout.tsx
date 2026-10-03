import type { ReactNode } from "react";
import { HostedPlannerProvider } from "@/components/providers/HostedPlannerProvider";

/** Planner components read their store and platform from context (ADR-0020). */
export default function PracticePlannerLayout({ children }: { children: ReactNode }) {
    return <HostedPlannerProvider>{children}</HostedPlannerProvider>;
}
