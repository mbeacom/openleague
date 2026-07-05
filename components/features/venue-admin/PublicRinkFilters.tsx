import { Card, CardContent, Stack, Typography } from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";

interface PublicRinkFilterOption {
  id: string;
  label: string;
}

export function PublicRinkFilters({ skillLevels, basePath }: { skillLevels: PublicRinkFilterOption[]; basePath: string }) {
  if (skillLevels.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Filter by level</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {skillLevels.map((level) => (
              <LinkButton key={level.id} href={`${basePath}?level=${level.id}`} variant="outlined" size="small">
                {level.label}
              </LinkButton>
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
