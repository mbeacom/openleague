import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface VenueRelationshipSummary {
  id: string;
  relationshipType: string;
  targetType: string;
  targetName?: string | null;
  status: string;
  team?: { name: string } | null;
  league?: { name: string } | null;
}

export function VenueRelationshipManager({ relationships }: { relationships: VenueRelationshipSummary[] }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Venue relationships</Typography>
      {relationships.length === 0 ? (
        <Typography color="text.secondary">No preferred or home venue relationships yet.</Typography>
      ) : (
        relationships.map((relationship) => {
          const label = relationship.team?.name ?? relationship.league?.name ?? relationship.targetName ?? relationship.targetType;
          return (
            <Card key={relationship.id}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h6">{label}</Typography>
                  <Chip size="small" label={relationship.relationshipType} />
                  <Chip size="small" label={relationship.status} variant="outlined" />
                </Stack>
              </CardContent>
            </Card>
          );
        })
      )}
    </Stack>
  );
}
