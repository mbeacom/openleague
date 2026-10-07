import { Typography } from "@mui/material";
import type { LocalPlannerStore } from "../../store/types";

export function RankingsTeamScreen(_props: { store: LocalPlannerStore; number: string }) {
    return (
        <Typography component="h1" variant="h5">
            Team
        </Typography>
    );
}
