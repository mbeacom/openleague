import { PageHeader } from "@/components/ui/PageHeader";
import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";
import { LOCAL_TEAM_ID } from "../config";

export function LibraryScreen() {
    return (
        <>
            <PageHeader title="Drill library" subtitle="Your drills, plus starter drills to copy and change." />
            <PlayLibrary teamId={LOCAL_TEAM_ID} mode="manage" />
        </>
    );
}
