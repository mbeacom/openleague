import { Typography } from "@mui/material";
import type { LocalPlannerStore } from "../../store/types";

export function RankingsImportScreen(_props: { store: LocalPlannerStore }) {
    return (
        <Typography component="h1" variant="h5">
            Import rankings
        </Typography>
    );
}
