/** The drill book print surface: no chrome, pinned light, with the hosted print stylesheet. */
import LightThemeScope from "@/components/ui/LightThemeScope";
import { DrillBook } from "@/components/features/practice-planner/print/DrillBook";
import "@/app/(print)/print.css";
import { LOCAL_TEAM_ID } from "../config";

export function DrillBookScreen() {
    return (
        <LightThemeScope component="main" className="bench-print-root" sx={{ minHeight: "100vh", bgcolor: "#fff", color: "#000" }}>
            <DrillBook teamId={LOCAL_TEAM_ID} />
        </LightThemeScope>
    );
}
