"use client";

import React, { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Typography,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  KeyboardArrowDown as ArrowDownIcon,
  Sports as SportsIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useLeague } from '@/components/providers/LeagueProvider';

interface LeagueContextSwitcherProps {
  variant?: 'button' | 'compact';
}

const LeagueContextSwitcher = React.memo(function LeagueContextSwitcher({
  variant = 'button'
}: LeagueContextSwitcherProps) {
  const { currentLeague, leagues, switchLeague, isLeagueMode } = useLeague();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // Don't show if not in league mode or only one league
  if (!isLeagueMode || leagues.length <= 1) {
    return null;
  }

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLeagueSelect = (leagueId: string) => {
    switchLeague(leagueId);
    handleClose();
  };

  if (variant === 'compact') {
    return (
      <Box>
        <Button
          onClick={handleClick}
          endIcon={<ArrowDownIcon />}
          size="small"
          sx={{
            textTransform: 'none',
            color: 'text.primary',
            minWidth: 'auto',
          }}
        >
          <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
            {currentLeague?.name}
          </Typography>
        </Button>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          {leagues.map((league) => (
            <MenuItem
              key={league.id}
              onClick={() => handleLeagueSelect(league.id)}
              selected={league.id === currentLeague?.id}
            >
              <ListItemIcon>
                {league.id === currentLeague?.id ? (
                  <CheckIcon fontSize="small" />
                ) : (
                  <SportsIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={league.name}
                secondary={league.sport}
              />
            </MenuItem>
          ))}
        </Menu>
      </Box>
    );
  }

  return (
    <Box>
      <Button
        onClick={handleClick}
        endIcon={<ArrowDownIcon />}
        variant="outlined"
        sx={{
          textTransform: 'none',
          justifyContent: 'space-between',
          minWidth: 200,
        }}
      >
        <Box sx={{ textAlign: 'left' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {currentLeague?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {currentLeague?.sport}
          </Typography>
        </Box>
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ mt: 1 }}
      >
        {leagues.map((league) => (
          <MenuItem
            key={league.id}
            onClick={() => handleLeagueSelect(league.id)}
            selected={league.id === currentLeague?.id}
          >
            <ListItemIcon>
              {league.id === currentLeague?.id ? (
                <CheckIcon fontSize="small" />
              ) : (
                <SportsIcon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={league.name}
              secondary={league.sport}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
});

export default LeagueContextSwitcher;