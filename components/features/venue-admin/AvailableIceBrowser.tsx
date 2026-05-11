import { Button, Card, CardContent, Stack, Typography } from "@mui/material";

interface AvailableIceBlock {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

export function AvailableIceBrowser({ blocks }: { blocks: AvailableIceBlock[] }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Available ice</Typography>
      {blocks.length === 0 ? (
        <Typography color="text.secondary">No available ice is currently published.</Typography>
      ) : (
        blocks.map((block) => (
          <Card key={block.id}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="h6">{block.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(block.startsAt).toLocaleString()} - {new Date(block.endsAt).toLocaleString()}
                </Typography>
                <Button href={`#request-${block.id}`} variant="outlined">
                  Request this ice
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
