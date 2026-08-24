"use client";

import { useState, useTransition } from "react";
import {
  Alert, Box, Button, Card, Chip, MenuItem, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";

import {
  archivePublicContent,
  createPublicContent,
  updatePublicContent,
} from "@/lib/actions/public-content";

export interface ContentEditorProps {
  leagueId: string;
  canPublishAssociationWide: boolean;
  teams: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    visibility: string;
    publishAt: Date | null;
    archivedAt: Date | null;
    team: { name: string } | null;
  }>;
}

const STATUS_COLOR = {
  DRAFT: "default", SCHEDULED: "warning", PUBLISHED: "success", ARCHIVED: "default",
} as const;

export function ContentEditor({
  leagueId,
  canPublishAssociationWide,
  teams,
  items,
}: ContentEditorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    summary: "",
    body: "",
    teamId: canPublishAssociationWide ? "" : (teams[0]?.id ?? ""),
    publishAt: "",
    visibility: "PUBLIC" as "PUBLIC" | "MEMBERS_ONLY",
  });

  function run(action: () => Promise<{ success: boolean; error?: string }>, message: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) setNotice(message);
      else setError(result.error ?? "That change could not be saved.");
    });
  }

  return (
    <Stack spacing={3}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}

      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          New post
        </Typography>
        <Stack spacing={2}>
          <TextField label="Title" value={form.title} fullWidth
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label="Address" value={form.slug} fullWidth
            helperText="Lowercase letters, numbers, and hyphens."
            onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <TextField label="Summary" value={form.summary} fullWidth
            onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          <TextField label="Body" value={form.body} multiline minRows={4} fullWidth
            onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select label="Team (optional)" value={form.teamId} fullWidth
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              {canPublishAssociationWide ? (
                <MenuItem value="">Whole association</MenuItem>
              ) : null}
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>{team.name}</MenuItem>
              ))}
            </TextField>
            <TextField select label="Visibility" value={form.visibility} fullWidth
              onChange={(e) =>
                setForm({ ...form, visibility: e.target.value as "PUBLIC" | "MEMBERS_ONLY" })}>
              <MenuItem value="PUBLIC">Public</MenuItem>
              <MenuItem value="MEMBERS_ONLY">Members only</MenuItem>
            </TextField>
          </Stack>
          <TextField
            label="Publish at" type="datetime-local" value={form.publishAt} fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Leave empty to publish now. A future time schedules it."
            onChange={(e) => setForm({ ...form, publishAt: e.target.value })}
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              disabled={
                pending
                || !form.title.trim()
                || !form.slug
                || !form.body.trim()
                || (!canPublishAssociationWide && !form.teamId)
              }
              sx={{ minHeight: 44 }}
              onClick={() =>
                run(() => createPublicContent({
                  leagueId,
                  slug: form.slug,
                  title: form.title,
                  summary: form.summary || undefined,
                  body: form.body,
                  visibility: form.visibility,
                  status: "DRAFT",
                  ...(form.teamId ? { teamId: form.teamId } : {}),
                  ...(form.publishAt ? { publishAt: new Date(form.publishAt) } : {}),
                }), "Draft saved.")
              }
            >
              Save draft
            </Button>
            <Button
              variant="contained"
              disabled={
                pending
                || !form.title.trim()
                || !form.slug
                || !form.body.trim()
                || (!canPublishAssociationWide && !form.teamId)
              }
              sx={{ minHeight: 44 }}
              onClick={() =>
                run(() => createPublicContent({
                  leagueId,
                  slug: form.slug,
                  title: form.title,
                  summary: form.summary || undefined,
                  body: form.body,
                  visibility: form.visibility,
                  status: "PUBLISHED",
                  ...(form.teamId ? { teamId: form.teamId } : {}),
                  ...(form.publishAt ? { publishAt: new Date(form.publishAt) } : {}),
                }), form.publishAt ? "Post scheduled." : "Post published.")
              }
            >
              {form.publishAt ? "Schedule" : "Publish"}
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Posts
        </Typography>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Nothing posted yet.</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Publishes</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{item.team?.name ?? "Association"}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <Chip size="small" label={item.status}
                          color={STATUS_COLOR[item.status as keyof typeof STATUS_COLOR] ?? "default"} />
                        {item.visibility === "MEMBERS_ONLY" ? (
                          <Chip size="small" variant="outlined" label="Members" />
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {item.publishAt ? new Date(item.publishAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {item.status === "DRAFT" ? (
                          <Button
                            size="small"
                            disabled={pending}
                            sx={{ minHeight: 44 }}
                            onClick={() =>
                              run(
                                () => updatePublicContent({
                                  itemId: item.id,
                                  status: "PUBLISHED",
                                }),
                                "Post published.",
                              )}
                          >
                            Publish
                          </Button>
                        ) : null}
                        {item.status === "SCHEDULED" ? (
                          <Button
                            size="small"
                            disabled={pending}
                            sx={{ minHeight: 44 }}
                            onClick={() =>
                              run(
                                () => updatePublicContent({
                                  itemId: item.id,
                                  status: "DRAFT",
                                }),
                                "Post moved to draft.",
                              )}
                          >
                            Move to draft
                          </Button>
                        ) : null}
                        {item.status !== "ARCHIVED" ? (
                          <Button
                            size="small"
                            color="error"
                            disabled={pending}
                            sx={{ minHeight: 44 }}
                            onClick={() =>
                              run(() => archivePublicContent(item.id), "Post archived.")}
                          >
                            Archive
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>
    </Stack>
  );
}

export default ContentEditor;
