import { createTheme, responsiveFontSizes } from '@mui/material/styles';
import type { PaletteOptions } from '@mui/material/styles';
import type { CSSProperties } from 'react';

// OpenLeague "Digital Playbook" Theme
// Inspired by athletic aesthetics and the OpenLeague brand
// Typography: Cabinet Grotesk (distinctive geometric sans) + JetBrains Mono (data)
// Colors: "Team Colors" from the logo - League Blue, Action Blue, Fresh Ice
// Light + dark color schemes via MUI CSS theme variables (no SSR flash; toggled
// through the data-mui-color-scheme attribute set by InitColorSchemeScript).

// Custom typography style type for marketing variants
type TypographyStyleOptions = CSSProperties & {
  '@media (max-width:600px)'?: CSSProperties;
};

// Extend MUI theme interface for marketing colors
declare module '@mui/material/styles' {
  // Opt in to CSS theme variables typing (theme.vars, theme.colorSchemes, ...)
  interface CssThemeVariables {
    enabled: true;
  }

  interface Palette {
    marketing: {
      primary: string;
      secondary: string;
      accent: string;
      gradient: string;
      hero: string;
    };
  }

  interface PaletteOptions {
    marketing?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      gradient?: string;
      hero?: string;
    };
  }

  interface TypographyVariants {
    heroTitle: TypographyStyleOptions;
    heroSubtitle: TypographyStyleOptions;
    sectionTitle: TypographyStyleOptions;
    featureTitle: TypographyStyleOptions;
    marketingBody: TypographyStyleOptions;
  }

  interface TypographyVariantsOptions {
    heroTitle?: TypographyStyleOptions;
    heroSubtitle?: TypographyStyleOptions;
    sectionTitle?: TypographyStyleOptions;
    featureTitle?: TypographyStyleOptions;
    marketingBody?: TypographyStyleOptions;
  }
}

// Update the Typography's variant prop options
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    heroTitle: true;
    heroSubtitle: true;
    sectionTitle: true;
    featureTitle: true;
    marketingBody: true;
  }
}

// Update the Button's variant prop options
declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    marketing: true;
    marketingSecondary: true;
  }
}

// Update the Paper's variant prop options (Card extends Paper)
declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    marketing: true;
  }
}

// Update the Card's variant prop options
declare module '@mui/material/Card' {
  interface CardPropsVariantOverrides {
    marketing: true;
  }
}

// Matches what theme.applyStyles('dark', ...) emits for our colorSchemeSelector.
// Used inside static styleOverrides objects (kept static so theme tests can
// assert on the light values directly).
const DARK_SCHEME = '*:where([data-mui-color-scheme="dark"]) &';

// Light scheme: the original Digital Playbook palette
const lightPalette: PaletteOptions = {
  primary: {
    main: '#0D47A1', // League Blue - deep, trustworthy
    light: '#1976D2', // Action Blue
    dark: '#01579B',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#1976D2', // Action Blue - bright, energetic
    light: '#42A5F5',
    dark: '#1565C0',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#C62828', // Penalty Box Red
    light: '#EF5350',
    dark: '#B71C1C',
  },
  warning: {
    main: '#F57C00',
    light: '#FF9800',
    dark: '#E65100',
  },
  success: {
    main: '#2E7D32', // Scoreboard Green
    light: '#4CAF50',
    dark: '#1B5E20',
  },
  background: {
    default: '#F8FAFB', // Fresh Ice - clean, crisp
    paper: '#FFFFFF',
  },
  text: {
    primary: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.60)',
    disabled: 'rgba(0, 0, 0, 0.38)',
  },
  // Marketing-specific colors
  marketing: {
    primary: '#0D47A1', // League Blue
    secondary: '#1976D2', // Action Blue
    accent: '#2E7D32', // Scoreboard Green
    gradient: 'linear-gradient(135deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%)',
    hero: '#F8FAFB', // Fresh Ice
  },
};

// Dark scheme: "Night Rink" - deep blue-gray surfaces (not pure black) that
// suit League Blue, with the blues lightened for WCAG AA contrast on dark
// backgrounds. Scoreboard Green / Penalty Box Red semantics preserved.
const darkPalette: PaletteOptions = {
  primary: {
    main: '#64B5F6', // League Blue, lightened for contrast on dark surfaces
    light: '#90CAF9',
    dark: '#42A5F5',
    contrastText: '#0A1929',
  },
  secondary: {
    main: '#42A5F5', // Action Blue, lightened
    light: '#64B5F6',
    dark: '#1E88E5',
    contrastText: '#0A1929',
  },
  error: {
    main: '#EF5350', // Penalty Box Red, lightened
    light: '#E57373',
    dark: '#C62828',
  },
  warning: {
    main: '#FFA726',
    light: '#FFB74D',
    dark: '#F57C00',
  },
  success: {
    main: '#66BB6A', // Scoreboard Green, lightened
    light: '#81C784',
    dark: '#388E3C',
  },
  background: {
    default: '#0A1929', // Night Rink - deep blue-gray
    paper: '#102A43',
  },
  divider: 'rgba(144, 202, 249, 0.16)',
  text: {
    primary: 'rgba(236, 242, 248, 0.92)',
    secondary: 'rgba(214, 226, 238, 0.64)',
    disabled: 'rgba(214, 226, 238, 0.38)',
  },
  marketing: {
    primary: '#64B5F6',
    secondary: '#42A5F5',
    accent: '#66BB6A',
    gradient: 'linear-gradient(135deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%)',
    hero: '#0A1929',
  },
};

// Create base theme with Digital Playbook color schemes + CSS variables
const baseTheme = createTheme({
  cssVariables: {
    // Emits [data-mui-color-scheme="light|dark"] selectors; must match the
    // attribute set by InitColorSchemeScript (its default) in ThemeProvider.
    colorSchemeSelector: 'data-mui-color-scheme',
  },
  colorSchemes: {
    light: { palette: lightPalette },
    dark: { palette: darkPalette },
  },
  typography: {
    // Cabinet Grotesk for headlines and UI (loaded via globals.css from Fontshare)
    fontFamily: "'Cabinet Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    // Marketing-specific typography variants with extreme weight contrasts
    heroTitle: {
      fontSize: '4.5rem', // Large jump (3x+ from body)
      fontWeight: 900, // Extreme weight
      lineHeight: 1,
      letterSpacing: '-0.03em',
      '@media (max-width:600px)': {
        fontSize: '2.75rem',
      },
    },
    heroSubtitle: {
      fontSize: '1.375rem',
      fontWeight: 300, // Light weight (contrast with hero)
      lineHeight: 1.5,
      color: 'rgba(0, 0, 0, 0.70)',
      '@media (max-width:600px)': {
        fontSize: '1.125rem',
      },
    },
    sectionTitle: {
      fontSize: '3rem', // Bold size jumps
      fontWeight: 800,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
      '@media (max-width:600px)': {
        fontSize: '2.25rem',
      },
    },
    featureTitle: {
      fontSize: '1.75rem',
      fontWeight: 700,
      lineHeight: 1.2,
      '@media (max-width:600px)': {
        fontSize: '1.5rem',
      },
    },
    marketingBody: {
      fontSize: '1.125rem',
      fontWeight: 400,
      lineHeight: 1.6,
      '@media (max-width:600px)': {
        fontSize: '1rem',
      },
    },
    h1: {
      fontWeight: 800,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 700,
    },
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
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
  spacing: 8, // Base spacing unit (8px)
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiTextField: {
      styleOverrides: {
        root: ({ theme }) => ({
          // Ensure adequate touch targets on mobile (48px meets WCAG 2.1 AA)
          '& .MuiInputBase-root': {
            minHeight: 48,
          },
          '& .MuiOutlinedInput-root': {
            backgroundColor: (theme.vars || theme).palette.background.paper,
            '& fieldset': {
              borderColor: 'rgba(13, 71, 161, 0.2)',
              borderWidth: 2,
            },
            '&:hover fieldset': {
              borderColor: 'rgba(13, 71, 161, 0.5)',
            },
            '&.Mui-focused fieldset': {
              borderColor: (theme.vars || theme).palette.secondary.main,
            },
            ...theme.applyStyles('dark', {
              '& fieldset': {
                borderColor: 'rgba(100, 181, 246, 0.28)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(100, 181, 246, 0.56)',
              },
            }),
          },
          '& .MuiInputLabel-root': {
            color: (theme.vars || theme).palette.text.secondary,
            fontWeight: 500,
          },
          '& .MuiInputBase-input': {
            color: (theme.vars || theme).palette.text.primary,
          },
        }),
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 48,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 48,
          minWidth: 48,
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 4px 12px rgba(13, 71, 161, 0.25)',
            transform: 'translateY(-2px)',
          },
          '&:active': {
            transform: 'translateY(0px)',
          },
        },
        outlined: {
          borderWidth: 2,
          '&:hover': {
            borderWidth: 2,
            transform: 'translateY(-1px)',
          },
        },
      },
      variants: [
        // Marketing CTA button variant - Action Blue with motion
        // (marketing pages commit to the light "Fresh Ice" look)
        {
          props: { variant: 'marketing' },
          style: {
            backgroundColor: '#1976D2',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '1rem',
            padding: '12px 32px',
            borderRadius: 8,
            textTransform: 'none',
            minHeight: '48px',
            boxShadow: '0px 4px 16px rgba(25, 118, 210, 0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              backgroundColor: '#1565C0',
              boxShadow: '0px 6px 24px rgba(25, 118, 210, 0.4)',
              transform: 'translateY(-3px)',
            },
            '&:active': {
              transform: 'translateY(-1px)',
            },
          },
        },
        // Marketing secondary button variant
        {
          props: { variant: 'marketingSecondary' },
          style: {
            backgroundColor: 'transparent',
            color: '#0D47A1',
            border: '2px solid #0D47A1',
            fontWeight: 700,
            fontSize: '1rem',
            padding: '10px 32px',
            borderRadius: 8,
            textTransform: 'none',
            minHeight: '48px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              backgroundColor: '#0D47A1',
              color: '#FFFFFF',
              borderColor: '#0D47A1',
              transform: 'translateY(-3px)',
            },
            '&:active': {
              transform: 'translateY(-1px)',
            },
          },
        },
      ],
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minHeight: 48,
          minWidth: 48,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'scale(1.05)',
          },
        },
      },
    },
    // Marketing-specific Card styles with subtle gradients
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0px 4px 24px rgba(13, 71, 161, 0.08)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          border: '1px solid rgba(13, 71, 161, 0.08)',
          '&:hover': {
            boxShadow: '0px 8px 32px rgba(13, 71, 161, 0.16)',
            transform: 'translateY(-4px)',
            borderColor: 'rgba(13, 71, 161, 0.15)',
          },
          // Blue-tinted shadows/borders vanish on dark surfaces; swap for
          // neutral shadows and a lightened-blue hairline in dark scheme.
          [DARK_SCHEME]: {
            boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(144, 202, 249, 0.12)',
            '&:hover': {
              boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.6)',
              borderColor: 'rgba(144, 202, 249, 0.24)',
            },
          },
        },
      },
      variants: [
        {
          props: { variant: 'marketing' },
          style: {
            padding: '40px',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFB 100%)',
            border: '2px solid rgba(25, 118, 210, 0.1)',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'linear-gradient(90deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%)',
            },
            '&:hover': {
              border: '2px solid rgba(25, 118, 210, 0.25)',
            },
          },
        },
      ],
    },
  },
});

// Apply responsive font sizing
const theme = responsiveFontSizes(baseTheme);

export default theme;
