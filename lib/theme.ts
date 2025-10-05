'use client';

import { createTheme } from '@mui/material/styles';

// OpenLeague MVP Theme
// Primary: Deep Blue (#1976D2 - Material Blue 700)
// Secondary: Vibrant Green (#43A047 - Material Green 600)
// WCAG AA contrast compliant

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976D2', // Deep Blue
      light: '#42A5F5',
      dark: '#1565C0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#43A047', // Vibrant Green
      light: '#66BB6A',
      dark: '#388E3C',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
    },
  },
  typography: {
    fontFamily: 'var(--font-roboto), Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#ffffff',
            '& fieldset': {
              borderColor: 'rgba(0, 0, 0, 0.23)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(0, 0, 0, 0.87)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#1976D2',
            },
          },
          '& .MuiInputLabel-root': {
            color: 'rgba(0, 0, 0, 0.6)',
          },
          '& .MuiInputBase-input': {
            color: 'rgba(0, 0, 0, 0.87)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          minHeight: 44, // Minimum touch target
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
});
