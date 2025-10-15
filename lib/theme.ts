import { createTheme, responsiveFontSizes } from '@mui/material/styles';
import type { CSSProperties } from 'react';

// OpenLeague MVP Theme
// Primary: Deep Blue (#1976D2 - Material Blue 700)
// Secondary: Vibrant Green (#43A047 - Material Green 600)
// Marketing: Energetic Orange (#FF9800) for CTAs and highlights
// WCAG AA contrast compliant

// Custom typography style type for marketing variants
type TypographyStyleOptions = CSSProperties & {
  '@media (max-width:600px)'?: CSSProperties;
};

// Extend MUI theme interface for marketing colors
declare module '@mui/material/styles' {
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
    // Marketing-specific colors
    marketing: {
      primary: '#1976D2', // Sports-inspired blue
      secondary: '#FF9800', // Energetic orange for CTAs
      accent: '#43A047', // Success green for highlights
      gradient: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
      hero: '#F8FAFC', // Light background for hero sections
    },
  },
  typography: {
    fontFamily: 'var(--font-roboto), Roboto, "Helvetica Neue", Arial, sans-serif',
    // Marketing-specific typography variants
    heroTitle: {
      fontSize: '3.5rem',
      fontWeight: 800,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
      '@media (max-width:600px)': {
        fontSize: '2.5rem',
      },
    },
    heroSubtitle: {
      fontSize: '1.25rem',
      fontWeight: 400,
      lineHeight: 1.5,
      color: 'rgba(0, 0, 0, 0.70)',
      '@media (max-width:600px)': {
        fontSize: '1.125rem',
      },
    },
    sectionTitle: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.01em',
      '@media (max-width:600px)': {
        fontSize: '2rem',
      },
    },
    featureTitle: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.3,
      '@media (max-width:600px)': {
        fontSize: '1.25rem',
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
  // Marketing-specific spacing
  spacing: 8, // Base spacing unit (8px)
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
      variants: [
        // Marketing CTA button variant
        {
          props: { variant: 'marketing' },
          style: {
            backgroundColor: '#FF9800',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '0.9375rem',
            padding: '8px 24px',
            borderRadius: 8,
            textTransform: 'none',
            minHeight: '40px',
            boxShadow: '0px 2px 8px rgba(255, 152, 0, 0.3)',
            '&:hover': {
              backgroundColor: '#F57C00',
              boxShadow: '0px 4px 12px rgba(255, 152, 0, 0.4)',
              transform: 'translateY(-1px)',
            },
            '&:active': {
              transform: 'translateY(0px)',
            },
          },
        },
        // Marketing secondary button variant
        {
          props: { variant: 'marketingSecondary' },
          style: {
            backgroundColor: 'transparent',
            color: '#1976D2',
            border: '2px solid #1976D2',
            fontWeight: 600,
            fontSize: '0.9375rem',
            padding: '6px 24px',
            borderRadius: 8,
            textTransform: 'none',
            minHeight: '40px',
            '&:hover': {
              backgroundColor: '#1976D2',
              color: '#FFFFFF',
              transform: 'translateY(-1px)',
            },
            '&:active': {
              transform: 'translateY(0px)',
            },
          },
        },
      ],
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
    // Marketing-specific Card styles
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.3s ease-in-out',
          '&:hover': {
            boxShadow: '0px 8px 30px rgba(0, 0, 0, 0.12)',
            transform: 'translateY(-2px)',
          },
        },
      },
      variants: [
        {
          props: { variant: 'marketing' },
          style: {
            padding: '32px',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            border: '1px solid rgba(25, 118, 210, 0.1)',
            '&:hover': {
              border: '1px solid rgba(25, 118, 210, 0.2)',
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
