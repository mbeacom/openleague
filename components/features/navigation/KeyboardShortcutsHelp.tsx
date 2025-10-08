"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Chip,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  Keyboard as KeyboardIcon,
} from '@mui/icons-material';
import { useLeague } from '@/components/providers/LeagueProvider';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
    leagueOnly?: boolean;
  }>;
}

const KeyboardShortcutsHelp = React.memo(function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const { isLeagueMode } = useLeague();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Open help dialog with ? key
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target as HTMLElement;
        // Don't trigger when typing in inputs
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Navigation',
      shortcuts: [
        { keys: ['g', 'd'], description: 'Go to Dashboard' },
        { keys: ['g', 't'], description: isLeagueMode ? 'Go to Teams' : 'Go to Roster' },
        { keys: ['g', 's'], description: isLeagueMode ? 'Go to Schedule' : 'Go to Calendar' },
        { keys: ['g', 'r'], description: 'Go to Roster' },
        { keys: ['g', 'm'], description: isLeagueMode ? 'Go to Messages' : 'Go to Events' },
      ],
    },
    {
      title: 'Actions',
      shortcuts: [
        { keys: ['n', 't'], description: 'New Team', leagueOnly: true },
        { keys: ['n', 'g'], description: 'New Game', leagueOnly: true },
        { keys: ['n', 'm'], description: 'New Message', leagueOnly: true },
        { keys: ['/'], description: 'Focus Search' },
      ].filter(s => !s.leagueOnly || isLeagueMode),
    },
    {
      title: 'Help',
      shortcuts: [
        { keys: ['?'], description: 'Show Keyboard Shortcuts' },
      ],
    },
  ];

  return (
    <>
      {/* Help Icon Button - Fixed position */}
      <IconButton
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          bottom: { xs: 96, md: 24 }, // Above mobile nav
          right: { xs: 16, md: 24 },
          bgcolor: 'background.paper',
          boxShadow: 2,
          '&:hover': {
            bgcolor: 'action.hover',
          },
          zIndex: 999, // Below mobile nav
        }}
        aria-label="keyboard shortcuts"
      >
        <KeyboardIcon />
      </IconButton>

      {/* Shortcuts Dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <KeyboardIcon />
              <Typography variant="h6" component="span">
                Keyboard Shortcuts
              </Typography>
            </Box>
            <IconButton
              onClick={() => setOpen(false)}
              size="small"
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {shortcutGroups.map((group, groupIndex) => (
            <Box key={group.title} sx={{ mb: 3 }}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1, fontWeight: 600 }}
              >
                {group.title}
              </Typography>
              {group.shortcuts.map((shortcut, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1,
                    borderBottom: index < group.shortcuts.length - 1 ? 1 : 0,
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2">
                    {shortcut.description}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {shortcut.keys.map((key, keyIndex) => (
                      <React.Fragment key={keyIndex}>
                        <Chip
                          label={key.toUpperCase()}
                          size="small"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            minWidth: 32,
                            height: 28,
                          }}
                        />
                        {keyIndex < shortcut.keys.length - 1 && (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mx: 0.5, lineHeight: '28px' }}
                          >
                            then
                          </Typography>
                        )}
                      </React.Fragment>
                    ))}
                  </Box>
                </Box>
              ))}
              {groupIndex < shortcutGroups.length - 1 && <Divider sx={{ mt: 2 }} />}
            </Box>
          ))}
          <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              💡 Tip: Keyboard shortcuts work when not typing in an input field. Press{' '}
              <Chip label="?" size="small" sx={{ mx: 0.5, height: 20, fontSize: '0.7rem' }} />{' '}
              anytime to view this help.
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default KeyboardShortcutsHelp;
