"use client";

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { addTeamToLeague } from '@/lib/actions/league';

interface CreateLeagueTeamFormProps {
  leagueId: string;
  divisions: Array<{
    id: string;
    name: string;
    ageGroup: string | null;
    skillLevel: string | null;
  }>;
  preselectedDivisionId?: string;
}

export default function CreateLeagueTeamForm({
  leagueId,
  divisions,
  preselectedDivisionId
}: CreateLeagueTeamFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    sport: '',
    season: '',
    divisionId: preselectedDivisionId || '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Team name is required');
      return;
    }

    if (!formData.sport.trim()) {
      setError('Sport is required');
      return;
    }

    if (!formData.season.trim()) {
      setError('Season is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await addTeamToLeague({
        leagueId,
        name: formData.name.trim(),
        sport: formData.sport.trim(),
        season: formData.season.trim(),
        divisionId: formData.divisionId || undefined,
      });

      if (result.success) {
        // Redirect to teams page
        router.push(`/league/${leagueId}/teams`);
      } else {
        setError(result.error);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Create New Team
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        Add a new team to your league
      </Typography>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {error && (
                <Alert severity="error">
                  {error}
                </Alert>
              )}

              <TextField
                label="Team Name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                required
                fullWidth
                placeholder="e.g., Lightning Bolts"
                disabled={loading}
              />

              <TextField
                label="Sport"
                value={formData.sport}
                onChange={(e) => handleInputChange('sport', e.target.value)}
                required
                fullWidth
                placeholder="e.g., Hockey, Soccer, Basketball"
                disabled={loading}
              />

              <TextField
                label="Season"
                value={formData.season}
                onChange={(e) => handleInputChange('season', e.target.value)}
                required
                fullWidth
                placeholder="e.g., Fall 2024, 2024-2025"
                disabled={loading}
              />

              {divisions.length > 0 && (
                <FormControl fullWidth>
                  <InputLabel>Division (Optional)</InputLabel>
                  <Select
                    value={formData.divisionId}
                    onChange={(e) => handleInputChange('divisionId', e.target.value)}
                    label="Division (Optional)"
                    disabled={loading}
                  >
                    <MenuItem value="">
                      <em>No Division</em>
                    </MenuItem>
                    {divisions.map((division) => (
                      <MenuItem key={division.id} value={division.id}>
                        <Box>
                          <Typography variant="body2">
                            {division.name}
                          </Typography>
                          {(division.ageGroup || division.skillLevel) && (
                            <Typography variant="caption" color="text.secondary">
                              {[division.ageGroup, division.skillLevel].filter(Boolean).join(' • ')}
                            </Typography>
                          )}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : null}
                >
                  {loading ? 'Creating...' : 'Create Team'}
                </Button>
              </Box>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}