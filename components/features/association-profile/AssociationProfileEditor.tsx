"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import {
  setAssociationProfilePublished,
  updateAssociationProfile,
  updateAssociationSlug,
  updateTeamPublicProfile,
} from "@/lib/actions/association-profile";
import { VenueBrandingEditor } from "@/components/features/venue-admin/VenueBrandingEditor";

export interface AssociationProfileEditorProps {
  leagueId: string;
  profile: {
    name: string;
    slug: string | null;
    profileStatus: string;
    publicDescription: string | null;
    logoUrl: string | null;
    brandPrimaryColor: string | null;
    brandSecondaryColor: string | null;
    publicEmail: string | null;
    publicPhone: string | null;
  };
  teams: Array<{
    id: string;
    name: string;
    slug: string | null;
    profileStatus: string;
    publicDescription: string | null;
    logoUrl: string | null;
  }>;
}

export function AssociationProfileEditor({
  leagueId,
  profile,
  teams,
}: AssociationProfileEditorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [fields, setFields] = useState({
    publicDescription: profile.publicDescription ?? "",
    logoUrl: profile.logoUrl ?? "",
    publicEmail: profile.publicEmail ?? "",
    publicPhone: profile.publicPhone ?? "",
    brandPrimaryColor: profile.brandPrimaryColor ?? "",
    brandSecondaryColor: profile.brandSecondaryColor ?? "",
  });
  const [slug, setSlug] = useState(profile.slug ?? "");
  const [teamFields, setTeamFields] = useState<
    Record<string, { slug: string; publicDescription: string; logoUrl: string }>
  >(
    Object.fromEntries(
      teams.map((team) => [
        team.id,
        {
          slug: team.slug ?? "",
          publicDescription: team.publicDescription ?? "",
          logoUrl: team.logoUrl ?? "",
        },
      ]),
    ),
  );

  const published = profile.profileStatus === "PUBLISHED";

  function run(
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) setNotice(successMessage);
      else setError(result.error ?? "That change could not be saved.");
    });
  }

  return (
    <Stack spacing={3}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}

      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6" component="h2">
              Public page
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {published && profile.slug
                ? `Live at /associations/${profile.slug}`
                : "Not published — only you can see this."}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={profile.profileStatus}
              color={published ? "success" : "default"}
            />
            <Button
              variant={published ? "outlined" : "contained"}
              disabled={pending}
              sx={{ minHeight: 44 }}
              onClick={() =>
                run(
                  () =>
                    setAssociationProfilePublished({ leagueId, publish: !published }),
                  published ? "Page unpublished." : "Page published.",
                )
              }
            >
              {published ? "Unpublish" : "Publish"}
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Public address
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
          <TextField
            label="Address"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            helperText="Lowercase letters, numbers, and hyphens. Old addresses keep working."
            fullWidth
          />
          <Button
            variant="outlined"
            disabled={pending || !slug || slug === profile.slug}
            sx={{ minHeight: 44 }}
            onClick={() =>
              run(
                () => updateAssociationSlug({ leagueId, slug }),
                "Address updated. The previous one now redirects here.",
              )
            }
          >
            Save address
          </Button>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Details
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Description"
            value={fields.publicDescription}
            onChange={(e) => setFields({ ...fields, publicDescription: e.target.value })}
            multiline
            minRows={3}
            fullWidth
          />
          <VenueBrandingEditor
            logoUrl={fields.logoUrl}
            brandPrimaryColor={fields.brandPrimaryColor}
            brandSecondaryColor={fields.brandSecondaryColor}
            disabled={pending}
            onChange={(field, value) => setFields({ ...fields, [field]: value })}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Public email"
              value={fields.publicEmail}
              onChange={(e) => setFields({ ...fields, publicEmail: e.target.value })}
              helperText="Shown publicly — not your admin contact address."
              fullWidth
            />
            <TextField
              label="Public phone"
              value={fields.publicPhone}
              onChange={(e) => setFields({ ...fields, publicPhone: e.target.value })}
              fullWidth
            />
          </Stack>
          <Box>
            <Button
              variant="contained"
              disabled={pending}
              sx={{ minHeight: 44 }}
              onClick={() =>
                run(
                  () =>
                    updateAssociationProfile({
                      leagueId,
                      publicDescription: fields.publicDescription || null,
                      logoUrl: fields.logoUrl || null,
                      brandPrimaryColor: fields.brandPrimaryColor || null,
                      brandSecondaryColor: fields.brandSecondaryColor || null,
                      publicEmail: fields.publicEmail || null,
                      publicPhone: fields.publicPhone || null,
                    }),
                  "Details saved.",
                )
              }
            >
              Save details
            </Button>
          </Box>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Team pages
        </Typography>
        <Divider sx={{ mb: 1 }} />
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                <TableCell>Address</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Logo URL</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {teams.map((team) => {
                const teamPublished = team.profileStatus === "PUBLISHED";
                const values = teamFields[team.id] ?? {
                  slug: "",
                  publicDescription: "",
                  logoUrl: "",
                };
                return (
                  <TableRow key={team.id}>
                    <TableCell>{team.name}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={values.slug}
                        slotProps={{
                          htmlInput: { "aria-label": `${team.name} public address` },
                        }}
                        onChange={(e) =>
                          setTeamFields({
                            ...teamFields,
                            [team.id]: { ...values, slug: e.target.value },
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={values.publicDescription}
                        multiline
                        minRows={2}
                        slotProps={{
                          htmlInput: { "aria-label": `${team.name} public description` },
                        }}
                        onChange={(e) =>
                          setTeamFields({
                            ...teamFields,
                            [team.id]: {
                              ...values,
                              publicDescription: e.target.value,
                            },
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={values.logoUrl}
                        slotProps={{
                          htmlInput: { "aria-label": `${team.name} logo URL` },
                        }}
                        onChange={(e) =>
                          setTeamFields({
                            ...teamFields,
                            [team.id]: { ...values, logoUrl: e.target.value },
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={team.profileStatus}
                        color={teamPublished ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          disabled={pending}
                          sx={{ minHeight: 44 }}
                          onClick={() =>
                            run(
                              () =>
                                updateTeamPublicProfile({
                                  leagueId,
                                  teamId: team.id,
                                  ...(values.slug ? { slug: values.slug } : {}),
                                  publicDescription: values.publicDescription || null,
                                  logoUrl: values.logoUrl || null,
                                }),
                              "Team page saved.",
                            )
                          }
                        >
                          Save
                        </Button>
                        <Button
                          size="small"
                          variant={teamPublished ? "outlined" : "contained"}
                          disabled={pending || !values.slug}
                          sx={{ minHeight: 44 }}
                          onClick={() =>
                            run(
                              () =>
                                updateTeamPublicProfile({
                                  leagueId,
                                  teamId: team.id,
                                  slug: values.slug,
                                  publicDescription: values.publicDescription || null,
                                  logoUrl: values.logoUrl || null,
                                  publish: !teamPublished,
                                }),
                              teamPublished ? "Team unpublished." : "Team published.",
                            )
                          }
                        >
                          {teamPublished ? "Unpublish" : "Publish"}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Card>
    </Stack>
  );
}

export default AssociationProfileEditor;
