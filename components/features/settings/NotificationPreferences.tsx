"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Typography,
  FormControlLabel,
  FormGroup,
  Switch,
  Divider,
  Alert,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Notifications as NotificationsIcon,
  Email as EmailIcon,
  Schedule as ScheduleIcon,
  PriorityHigh as PriorityIcon,
} from "@mui/icons-material";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  getAllNotificationPreferences,
} from "@/lib/actions/notifications";
import type { NotificationPreferences } from "@/lib/services/notification";

interface NotificationPreferencesProps {
  leagueId?: string;
  leagueName?: string;
}

export const NotificationPreferencesComponent: React.FC<NotificationPreferencesProps> = ({
  leagueId,
  leagueName,
}) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [allPreferences, setAllPreferences] = useState<{
    global: NotificationPreferences;
    leagues: Array<{
      leagueId: string;
      leagueName: string;
      preferences: NotificationPreferences;
    }>;
  } | null>(null);

  const loadPreferences = useCallback(async () => {
    try {
      if (leagueId) {
        // Load specific league preferences
        const result = await getNotificationPreferences(leagueId);
        if (result.success) {
          setPreferences(result.data);
        } else {
          setError(result.error);
        }
      } else {
        // Load all preferences
        const result = await getAllNotificationPreferences();
        if (result.success) {
          setAllPreferences(result.data);
          setPreferences(result.data.global);
        } else {
          setError(result.error);
        }
      }
    } catch {
      setError("Failed to load notification preferences");
    }
  }, [leagueId]);

  useEffect(() => {
    loadPreferences();
  }, [leagueId, loadPreferences]);

  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;

    const updatedPreferences = {
      ...preferences,
      [key]: value,
    };

    setPreferences(updatedPreferences);

    // Auto-save the change
    startTransition(async () => {
      try {
        const result = await updateNotificationPreferences({
          leagueId,
          preferences: { [key]: value },
        });

        if (result.success) {
          setSuccess("Preferences updated successfully");
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(result.error);
          // Revert the change on error
          setPreferences(preferences);
        }
      } catch {
        setError("Failed to update preferences");
        setPreferences(preferences);
      }
    });
  };

  const renderPreferenceSection = (
    title: string,
    description: string,
    prefs: NotificationPreferences,
    leagueContext?: { leagueId: string; leagueName: string }
  ) => (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <NotificationsIcon color="primary" />
            <Typography variant="h6">{title}</Typography>
            {leagueContext && (
              <Chip label={leagueContext.leagueName} size="small" variant="outlined" />
            )}
          </Box>
        }
        subheader={description}
      />
      <CardContent>
        <FormGroup>
          {/* Email Delivery */}
          <Box mb={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.emailEnabled}
                  onChange={(e) => handlePreferenceChange("emailEnabled", e.target.checked)}
                  disabled={isPending}
                />
              }
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <EmailIcon fontSize="small" />
                  <Typography>Email Notifications</Typography>
                </Box>
              }
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
              Receive email notifications for league activities
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Notification Types */}
          <Typography variant="subtitle2" gutterBottom>
            Notification Types
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={prefs.leagueMessages}
                onChange={(e) => handlePreferenceChange("leagueMessages", e.target.checked)}
                disabled={isPending || !prefs.emailEnabled}
              />
            }
            label="League Messages"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
            Targeted messages from league administrators
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={prefs.leagueAnnouncements}
                onChange={(e) => handlePreferenceChange("leagueAnnouncements", e.target.checked)}
                disabled={isPending || !prefs.emailEnabled}
              />
            }
            label="League Announcements"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
            Important league-wide announcements
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={prefs.eventNotifications}
                onChange={(e) => handlePreferenceChange("eventNotifications", e.target.checked)}
                disabled={isPending || !prefs.emailEnabled}
              />
            }
            label="Event Notifications"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
            New events, schedule changes, and cancellations
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={prefs.rsvpReminders}
                onChange={(e) => handlePreferenceChange("rsvpReminders", e.target.checked)}
                disabled={isPending || !prefs.emailEnabled}
              />
            }
            label="RSVP Reminders"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
            Reminders to RSVP for upcoming events
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={prefs.teamInvitations}
                onChange={(e) => handlePreferenceChange("teamInvitations", e.target.checked)}
                disabled={isPending || !prefs.emailEnabled}
              />
            }
            label="Team Invitations"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
            Invitations to join teams
          </Typography>

          <Divider sx={{ my: 2 }} />

          {/* Delivery Preferences */}
          <Typography variant="subtitle2" gutterBottom>
            Delivery Preferences
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={prefs.urgentOnly}
                onChange={(e) => handlePreferenceChange("urgentOnly", e.target.checked)}
                disabled={isPending || !prefs.emailEnabled}
              />
            }
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <PriorityIcon fontSize="small" />
                <Typography>Urgent Only</Typography>
              </Box>
            }
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
            Only receive high priority and urgent notifications
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={prefs.batchDelivery}
                onChange={(e) => handlePreferenceChange("batchDelivery", e.target.checked)}
                disabled={isPending || !prefs.emailEnabled || prefs.urgentOnly}
              />
            }
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <ScheduleIcon fontSize="small" />
                <Typography>Batch Delivery</Typography>
              </Box>
            }
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
            Group non-urgent notifications into daily digest emails
          </Typography>
        </FormGroup>
      </CardContent>
    </Card>
  );

  if (!preferences) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <Typography>Loading notification preferences...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {leagueId ? (
        // Single league preferences
        renderPreferenceSection(
          "Notification Preferences",
          `Manage your notification preferences for ${leagueName || "this league"}`,
          preferences
        )
      ) : (
        // All preferences with accordions
        <Box>
          {/* Global Preferences */}
          {renderPreferenceSection(
            "Global Notification Preferences",
            "Default notification preferences that apply across all leagues",
            preferences
          )}

          {/* League-specific Preferences */}
          {allPreferences?.leagues && allPreferences.leagues.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mt: 3, mb: 2 }}>
                League-Specific Preferences
              </Typography>
              {allPreferences.leagues.map((league) => (
                <Accordion key={league.leagueId}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <NotificationsIcon color="primary" />
                      <Typography>{league.leagueName}</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {renderPreferenceSection(
                      `${league.leagueName} Preferences`,
                      "These preferences override your global settings for this league",
                      league.preferences,
                      { leagueId: league.leagueId, leagueName: league.leagueName }
                    )}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};