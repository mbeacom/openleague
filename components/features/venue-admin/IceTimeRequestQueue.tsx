import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface RequestSummary {
  id: string;
  contactName: string;
  contactEmail: string;
  status: string;
  requestedStartAt: Date | string;
  requestedEndAt: Date | string;
}

export function IceTimeRequestQueue({ requests }: { requests: RequestSummary[] }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Request queue</Typography>
      {requests.length === 0 ? (
        <Typography color="text.secondary">No ice time requests yet.</Typography>
      ) : (
        requests.map((request) => (
          <Card key={request.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h6">{request.contactName}</Typography>
                  <Chip label={request.status} size="small" />
                </Stack>
                <Typography>{request.contactEmail}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(request.requestedStartAt).toLocaleString()} - {new Date(request.requestedEndAt).toLocaleString()}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
