"use client";

import { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Alert,
  CircularProgress,
  Chip,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
} from "@mui/icons-material";
import {
  createDivision,
  updateDivision,
  deleteDivision
} from "@/lib/actions/league";
import {
  createDivisionSchema,
  updateDivisionSchema,
  type CreateDivisionInput,
  type UpdateDivisionInput
} from "@/lib/utils/validation";
import { useKeyboardShortcuts, useDialogKeyboard } from "@/lib/hooks/useKeyboardShortcuts";

interface Division {
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
  _count?: {
    teams: number;
  };
}

interface DivisionManagerProps {
  divisions: Division[];
  leagueId: string;
  canManage: boolean;
}

type DialogMode = 'create' | 'edit' | 'delete' | null;

export default function DivisionManager({
  divisions,
  leagueId,
  canManage
}: DivisionManagerProps) {
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    ageGroup: "",
    skillLevel: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, division: Division) => {
    setAnchorEl(event.currentTarget);
    setSelectedDivision(division);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedDivision(null);
  };

  const handleDialogOpen = (mode: DialogMode, division?: Division) => {
    setDialogMode(mode);
    if (mode === 'edit' && division) {
      setSelectedDivision(division);
      setFormData({
        name: division.name,
        ageGroup: division.ageGroup || "",
        skillLevel: division.skillLevel || "",
      });
    } else if (mode === 'create') {
      setFormData({
        name: "",
        ageGroup: "",
        skillLevel: "",
      });
    } else if (mode === 'delete' && division) {
      setSelectedDivision(division);
    }
    setError(null);
    setFieldErrors({});
    handleMenuClose();
  };

  const handleDialogClose = () => {
    setDialogMode(null);
    setSelectedDivision(null);
    setFormData({
      name: "",
      ageGroup: "",
      skillLevel: "",
    });
    setError(null);
    setFieldErrors({});
  };

  // Keyboard shortcuts for division management
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'n',
        ctrl: true,
        handler: () => canManage && handleDialogOpen('create'),
        description: 'Create new division (Ctrl+N)',
        enabled: canManage && !dialogMode,
      },
    ],
    enabled: true,
    preventDefault: true,
  });

  // Dialog keyboard navigation
  useDialogKeyboard({
    isOpen: dialogMode === 'create' || dialogMode === 'edit',
    onClose: handleDialogClose,
    closeOnEscape: true,
    confirmOnEnter: false, // Prevent accidental form submission
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      if (dialogMode === 'create') {
        const input: CreateDivisionInput = {
          leagueId,
          name: formData.name,
          ageGroup: formData.ageGroup || undefined,
          skillLevel: formData.skillLevel || undefined,
        };

        const validation = createDivisionSchema.safeParse(input);
        if (!validation.success) {
          const errors: Record<string, string> = {};
          validation.error.issues.forEach((issue) => {
            const field = issue.path[0] as string;
            if (field && !errors[field]) {
              errors[field] = issue.message;
            }
          });
          setFieldErrors(errors);
          setError("Please fix the errors below.");
          return;
        }

        const result = await createDivision(input);
        if (result.success) {
          handleDialogClose();
        } else {
          setError(result.error);
        }
      } else if (dialogMode === 'edit' && selectedDivision) {
        const input: UpdateDivisionInput = {
          id: selectedDivision.id,
          leagueId,
          name: formData.name,
          ageGroup: formData.ageGroup || undefined,
          skillLevel: formData.skillLevel || undefined,
        };

        const validation = updateDivisionSchema.safeParse(input);
        if (!validation.success) {
          const errors: Record<string, string> = {};
          validation.error.issues.forEach((issue) => {
            const field = issue.path[0] as string;
            if (field && !errors[field]) {
              errors[field] = issue.message;
            }
          });
          setFieldErrors(errors);
          setError("Please fix the errors below.");
          return;
        }

        const result = await updateDivision(input);
        if (result.success) {
          handleDialogClose();
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      console.error("Error managing division:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDivision) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await deleteDivision({
        id: selectedDivision.id,
        leagueId,
      });

      if (result.success) {
        handleDialogClose();
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("Error deleting division:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          Divisions
        </Typography>
        {canManage && (
          <Tooltip title="Create new division (Ctrl+N)" arrow>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleDialogOpen('create')}
            >
              Add Division
            </Button>
          </Tooltip>
        )}
      </Box>

      {divisions.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" textAlign="center">
              No divisions created yet.
              {canManage && " Click 'Add Division' to create your first division."}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {divisions.map((division) => (
            <Card key={division.id}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Box flex={1}>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {division.name}
                    </Typography>
                    <Box display="flex" gap={1} mb={1} flexWrap="wrap">
                      {division.ageGroup && (
                        <Chip label={`Age: ${division.ageGroup}`} size="small" variant="outlined" />
                      )}
                      {division.skillLevel && (
                        <Chip label={`Level: ${division.skillLevel}`} size="small" variant="outlined" />
                      )}
                    </Box>
                    {division._count && (
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <PeopleIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {division._count.teams} teams
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  {canManage && (
                    <IconButton
                      onClick={(e) => handleMenuOpen(e, division)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Division management menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleDialogOpen('edit', selectedDivision!)}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Division</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleDialogOpen('delete', selectedDivision!)}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete Division</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create/Edit Division Dialog */}
      <Dialog
        open={dialogMode === 'create' || dialogMode === 'edit'}
        onClose={handleDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleSubmit}>
          <DialogTitle>
            {dialogMode === 'create' ? 'Create Division' : 'Edit Division'}
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
              Press Escape to cancel
            </Typography>
          </DialogTitle>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              label="Division Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              fullWidth
              margin="normal"
              disabled={isSubmitting}
              placeholder="e.g., U10, Adult Recreational, Competitive"
              error={!!fieldErrors.name}
              helperText={fieldErrors.name}
            />

            <TextField
              label="Age Group (Optional)"
              name="ageGroup"
              value={formData.ageGroup}
              onChange={handleChange}
              fullWidth
              margin="normal"
              disabled={isSubmitting}
              placeholder="e.g., U8, U10, U12, Adult"
              error={!!fieldErrors.ageGroup}
              helperText={fieldErrors.ageGroup}
            />

            <TextField
              label="Skill Level (Optional)"
              name="skillLevel"
              value={formData.skillLevel}
              onChange={handleChange}
              fullWidth
              margin="normal"
              disabled={isSubmitting}
              placeholder="e.g., Recreational, Competitive, Elite"
              error={!!fieldErrors.skillLevel}
              helperText={fieldErrors.skillLevel}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDialogClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || !formData.name}
            >
              {isSubmitting ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  {dialogMode === 'create' ? 'Creating...' : 'Updating...'}
                </>
              ) : (
                dialogMode === 'create' ? 'Create Division' : 'Update Division'
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Division Dialog */}
      <Dialog
        open={dialogMode === 'delete'}
        onClose={handleDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Division</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Typography>
            Are you sure you want to delete the division &ldquo;{selectedDivision?.name}&rdquo;?
          </Typography>

          {selectedDivision?._count?.teams && selectedDivision._count.teams > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This division has {selectedDivision._count.teams} team(s).
              Deleting it will remove the teams from this division, but the teams will remain in the league.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Deleting...
              </>
            ) : (
              'Delete Division'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}