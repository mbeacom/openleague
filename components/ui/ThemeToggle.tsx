'use client';

import { useState } from 'react';
import { useColorScheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';

type Mode = 'light' | 'dark' | 'system';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === 'light') return <LightModeIcon fontSize="small" />;
  if (mode === 'dark') return <DarkModeIcon fontSize="small" />;
  return <SettingsBrightnessIcon fontSize="small" />;
}

/**
 * Light/dark/system color-scheme toggle. Compact icon button opening a menu;
 * preference persists via MUI's localStorage mechanism (mui-mode key).
 */
export default function ThemeToggle() {
  const { mode, setMode } = useColorScheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // mode is undefined during SSR/first render (before hydration resolves the
  // stored preference); render the neutral "system" icon so markup matches.
  const currentMode: Mode = mode ?? 'system';

  const handleSelect = (value: Mode) => {
    setMode(value);
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="Color theme">
        <IconButton
          size="small"
          color="inherit"
          aria-label="Change color theme"
          aria-haspopup="menu"
          aria-controls={open ? 'theme-toggle-menu' : undefined}
          aria-expanded={open ? 'true' : undefined}
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <ModeIcon mode={currentMode} />
        </IconButton>
      </Tooltip>
      <Menu
        id="theme-toggle-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {MODE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={currentMode === option.value}
            onClick={() => handleSelect(option.value)}
          >
            <ListItemIcon>
              <ModeIcon mode={option.value} />
            </ListItemIcon>
            <ListItemText>{option.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
