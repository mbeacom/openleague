import { Card, Chip, Divider, Stack, Typography } from "@mui/material";

export type PublicGearWishlistData = {
  associationName: string;
  title: string;
  description: string | null;
  items: Array<{
    id: string;
    name: string;
    category: string | null;
    size: string | null;
    description: string | null;
    targetQty: number;
    pledgedQty: number;
    receivedQty: number;
  }>;
};

export function PublicGearWishlist({ data }: { data: PublicGearWishlistData }) {
  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="overline" color="primary.main">{data.associationName}</Typography>
        <Typography variant="h3">{data.title}</Typography>
        {data.description && <Typography color="text.secondary">{data.description}</Typography>}
      </Stack>
      <Typography color="text.secondary">
        Donations are in-kind pledges. They do not reserve or purchase inventory; the association will coordinate receipt directly.
      </Typography>
      <Stack spacing={2}>
        {data.items.map((item) => (
          <Card key={item.id} variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                <Typography variant="h6">{item.name}</Typography>
                <Chip label={`${item.receivedQty} received`} color="success" size="small" />
              </Stack>
              {(item.category || item.size) && (
                <Typography variant="body2" color="text.secondary">
                  {[item.category, item.size].filter(Boolean).join(" - ")}
                </Typography>
              )}
              {item.description && <Typography variant="body2">{item.description}</Typography>}
              <Divider />
              <Typography variant="body2" color="text.secondary">
                Target: {item.targetQty} · Promised: {item.pledgedQty} · Received: {item.receivedQty}
              </Typography>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
