import { Container, Box } from "@mui/material";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";
import { getPracticePlannerListData } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Practice Planner | OpenLeague",
  description: "Plan and organize hockey practice sessions",
};

export default async function PracticePlannerPage() {
  const data = await getPracticePlannerListData();

  if (!data) {
    redirect("/dashboard");
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PracticePlannerList
          sessions={data.sessions}
          isAdmin={data.isAdmin}
          teamName={data.teamName}
        />
      </Box>
    </Container>
  );
}
