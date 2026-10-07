import { Typography } from "@mui/material";
import type { LocalPlannerStore } from "../../store/types";

export function RankingsWhatIfScreen(_props: { store: LocalPlannerStore }) {
    return (
        <Typography component="h1" variant="h5">
            What-if
        </Typography>
    );
}
