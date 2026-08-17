import { Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { formatDateTimeInZone } from "@/lib/utils/date";

interface AvailableIceBlock {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  surfaceName?: string | null;
  occupancy?: Array<{ startsAt: Date | string; endsAt: Date | string }>;
  remainingSlices?: Array<{ startsAt: Date | string; endsAt: Date | string }>;
}

function formatRange(
  startsAt: Date | string,
  endsAt: Date | string,
  timeZone: string,
): string {
  return `${formatDateTimeInZone(startsAt, timeZone)} – ${formatDateTimeInZone(
    endsAt,
    timeZone,
  )}`;
}

export function AvailableIceBrowser({
  blocks,
  timeZone,
  mode,
}: {
  blocks: AvailableIceBlock[];
  timeZone: string;
  mode: "public" | "staff";
}) {
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
                  {formatRange(block.startsAt, block.endsAt, timeZone)}
                </Typography>
                {block.surfaceName && <Typography variant="body2">{block.surfaceName}</Typography>}
                {mode === "staff" ? (
                  <Typography variant="body2" color="text.secondary">
                    Occupancy: {block.occupancy?.length
                      ? block.occupancy
                          .map((slice) =>
                            formatRange(slice.startsAt, slice.endsAt, timeZone),
                          )
                          .join(", ")
                      : "None"}
                  </Typography>
                ) : null}
                <Typography variant="body2" color="text.secondary">
                  Remaining: {block.remainingSlices?.length
                    ? block.remainingSlices
                        .map((slice) =>
                          formatRange(slice.startsAt, slice.endsAt, timeZone),
                        )
                        .join(", ")
                    : "No remaining slices"}
                </Typography>
                {mode === "public"
                  ? block.remainingSlices?.map((slice, index) => (
                      <Button
                        key={`${new Date(slice.startsAt).toISOString()}-${new Date(slice.endsAt).toISOString()}`}
                        href={`#request-${block.id}-${index}`}
                        variant="outlined"
                        sx={{ minHeight: 44, alignSelf: "flex-start" }}
                      >
                        Request this ice
                      </Button>
                    ))
                  : null}
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
