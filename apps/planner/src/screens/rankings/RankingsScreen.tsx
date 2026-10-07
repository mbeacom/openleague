import { Typography } from "@mui/material";
import type { LocalPlannerStore } from "../../store/types";

export function RankingsScreen(_props: { store: LocalPlannerStore }) {
    return (
        <Typography component="h1" variant="h5">
            Rankings
        </Typography>
    );
}
