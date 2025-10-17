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
            minHeight: 44, // Touch-friendly height
            px: 1.5,
          }}
        >
          <Typography variant="body2" noWrap sx={{ maxWidth: { xs: 100, sm: 120 }, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
            {currentLeague?.name}
          </Typography>
        </Button>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          sx={{
            '& .MuiMenuItem-root': {
              minHeight: 56, // Touch-friendly menu items
              px: 2,
            }
          }}
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
                primaryTypographyProps={{
                  sx: { fontSize: { xs: '0.875rem', sm: '1rem' } }
                }}
                secondaryTypographyProps={{
                  sx: { fontSize: { xs: '0.75rem', sm: '0.875rem' } }
                }}
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
          minWidth: { xs: 180, sm: 200 },
          minHeight: 48, // Touch-friendly height
        }}
      >
        <Box sx={{ textAlign: 'left' }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: { xs: '0.875rem', sm: '0.875rem' }
            }}
          >
            {currentLeague?.name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
          >
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
        sx={{
          mt: 1,
          '& .MuiMenuItem-root': {
            minHeight: 56, // Touch-friendly menu items
            px: 2,
          }
        }}
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
              primaryTypographyProps={{
                sx: { fontSize: { xs: '0.875rem', sm: '1rem' } }
              }}
              secondaryTypographyProps={{
                sx: { fontSize: { xs: '0.75rem', sm: '0.875rem' } }
              }}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
});

export default LeagueContextSwitcher;