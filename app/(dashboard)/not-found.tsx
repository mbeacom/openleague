import SearchOffIcon from "@mui/icons-material/SearchOff";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { LinkButton } from "@/components/ui/NextLinkComposites";

export default function DashboardNotFound() {
  return (
    <PageContainer maxWidth="md">
      <EmptyState
        icon={<SearchOffIcon />}
        title="Page not found"
        description="The page you are looking for does not exist or may have been moved."
        action={
          <LinkButton href="/dashboard" variant="contained" sx={{ minHeight: 44 }}>
            Back to dashboard
          </LinkButton>
        }
      />
    </PageContainer>
  );
}
