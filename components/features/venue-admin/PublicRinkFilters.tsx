import Link from "next/link";
import { Button, Card, CardContent, Stack, Typography } from "@mui/material";

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
              <Button key={level.id} component={Link} href={`${basePath}?level=${level.id}`} variant="outlined" size="small">
                {level.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
