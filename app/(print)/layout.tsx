import type { ReactNode } from "react";
import LightThemeScope from "@/components/ui/LightThemeScope";
import { requireAuth } from "@/lib/auth/session";
import "./print.css";

/**
 * Print surfaces (practice planner 3b bench sheet). No dashboard chrome, and
 * pinned to the light scheme, so paper gets black on white whatever the
 * viewer's theme. requireAuth is defense in depth: each page's own query also
 * redirects to login.
 */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireAuth();
  return (
    <LightThemeScope component="main" sx={{ minHeight: "100vh", bgcolor: "#fff", color: "#000" }}>
      {children}
    </LightThemeScope>
  );
}
