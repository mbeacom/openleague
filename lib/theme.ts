import { createTheme, responsiveFontSizes } from '@mui/material/styles';

// OpenLeague MVP Theme
// Primary: Deep Blue (#1976D2 - Material Blue 700)
// Secondary: Vibrant Green (#43A047 - Material Green 600)
// WCAG AA contrast compliant

// Create base theme with custom color palette
const baseTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976D2',
      light: '#42A5F5',
      dark: '#1565C0',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#43A047',
      light: '#66BB6A',
      dark: '#2E7D32',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#D32F2F',
      light: '#EF5350',
      dark: '#C62828',
    },
    warning: {
      main: '#F57C00',
      light: '#FF9800',
      dark: '#E65100',
    },
    success: {
      main: '#388E3C',
      light: '#4CAF50',
      dark: '#2E7D32',
    },
    background: {
      default: '#F5F5F5',
      paper: '#FFFFFF',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.60)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
  },
  typography: {
    fontFamily: 'var(--font-roboto), Roboto, "Helvetica Neue", Arial, sans-serif',
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
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          // Ensure adequate touch targets on mobile (48px meets WCAG 2.1 AA)
          '& .MuiInputBase-root': {
            minHeight: 48,
          },
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#FFFFFF',
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
    MuiSelect: {
      styleOverrides: {
        select: {
          // Ensure adequate touch targets on mobile (48px meets WCAG 2.1 AA)
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          // Ensure adequate touch targets on mobile (48px meets WCAG 2.1 AA)
          minHeight: 48,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          // Updated from 44px to 48px to match TextField touch targets
          minHeight: 48,
          minWidth: 48,
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          // Updated from 44px to 48px to match other touch targets
          minHeight: 48,
          minWidth: 48,
        },
      },
    },
  },
});

// Apply responsive font sizing
const theme = responsiveFontSizes(baseTheme);

export default theme;
