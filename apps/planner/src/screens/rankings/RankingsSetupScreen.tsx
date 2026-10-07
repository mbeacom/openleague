import { Typography } from "@mui/material";
import type { LocalPlannerStore } from "../../store/types";

export function RankingsSetupScreen(_props: { store: LocalPlannerStore }) {
    return (
        <Typography component="h1" variant="h5">
            Rankings setup
        </Typography>
    );
}
