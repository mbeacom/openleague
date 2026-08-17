"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Stack } from "@mui/material";
import { archiveGearWishlist, rotateGearWishlistShareToken, setGearWishlistStatus } from "@/lib/actions/gear-wishlist";

export function GearWishlistAdminActions({
  leagueId,
  shareToken,
  status,
  version,
}: {
  leagueId: string;
  shareToken: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: "publish" | "rotate" | "archive") {
    setPending(true);
    const input = { leagueId, expectedVersion: version };
    const result = action === "publish"
      ? await setGearWishlistStatus({ ...input, status: "PUBLISHED" })
      : action === "rotate"
        ? await rotateGearWishlistShareToken(input)
        : await archiveGearWishlist(input);
    setPending(false);
    setMessage(result.success ? "Wishlist updated. Refresh to see its current version." : result.error);
  }

  if (status === "ARCHIVED") return null;
  return (
    <Stack spacing={1}>
      {message && <Alert severity={message.startsWith("Wishlist updated") ? "success" : "error"}>{message}</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {status === "DRAFT" && <Button variant="contained" disabled={pending} onClick={() => run("publish")} sx={{ minHeight: 44 }}>Publish</Button>}
        {status === "PUBLISHED" && (
          <Button component={Link} href={`/gear-wishlist/${shareToken}`} target="_blank" variant="outlined" sx={{ minHeight: 44 }}>
            Open public wishlist
          </Button>
        )}
        <Button disabled={pending} onClick={() => run("rotate")} sx={{ minHeight: 44 }}>Rotate link</Button>
        <Button color="inherit" disabled={pending} onClick={() => run("archive")} sx={{ minHeight: 44 }}>Archive</Button>
      </Stack>
    </Stack>
  );
}
