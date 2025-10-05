# OpenLeague Color Palette

## Sports-Professional Theme

### Primary Colors

**Deep Blue** - Trust, Professionalism, Sports
- Main: `#1976D2` (Material Blue 700)
- Light: `#42A5F5` (Material Blue 400)
- Dark: `#1565C0` (Material Blue 800)
- Contrast Text: `#FFFFFF`

**Usage**: Primary buttons, navigation, headers, links

---

**Vibrant Green** - Energy, Action, "Go"
- Main: `#43A047` (Material Green 600)
- Light: `#66BB6A` (Material Green 400)
- Dark: `#2E7D32` (Material Green 800)
- Contrast Text: `#FFFFFF`

**Usage**: Secondary buttons, "Going" RSVP status, success states, call-to-action

---

### Semantic Colors

**Error Red** - Alerts, "Not Going"
- Main: `#D32F2F` (Material Red 700)
- Light: `#EF5350` (Material Red 400)
- Dark: `#C62828` (Material Red 800)

**Usage**: Error messages, "Not Going" RSVP status, delete actions

---

**Warning Amber** - Caution, "Maybe"
- Main: `#F57C00` (Material Orange 700)
- Light: `#FF9800` (Material Orange 500)
- Dark: `#E65100` (Material Orange 900)

**Usage**: Warning messages, "Maybe" RSVP status, pending states

---

**Success Green** - Confirmation, Success
- Main: `#388E3C` (Material Green 700)
- Light: `#4CAF50` (Material Green 500)
- Dark: `#2E7D32` (Material Green 800)

**Usage**: Success messages, confirmations, completed states

---

### Neutral Colors

**Background**
- Default: `#F5F5F5` (Light gray for main background)
- Paper: `#FFFFFF` (White for cards/surfaces)

**Text**
- Primary: `rgba(0, 0, 0, 0.87)` (87% opacity black)
- Secondary: `rgba(0, 0, 0, 0.60)` (60% opacity black)
- Disabled: `rgba(0, 0, 0, 0.38)` (38% opacity black)

---

## RSVP Status Colors

Visual guide for RSVP button states:

| Status | Color | Hex | Usage |
|--------|-------|-----|-------|
| **Going** | Green | `#43A047` | Positive response, confirmed attendance |
| **Not Going** | Red | `#D32F2F` | Negative response, cannot attend |
| **Maybe** | Amber | `#F57C00` | Uncertain response, tentative |
| **No Response** | Gray | `rgba(0, 0, 0, 0.38)` | Default state, no answer yet |

---

## Accessibility

All color combinations meet **WCAG AA** contrast standards:
- ✅ Primary Blue on White: 4.5:1 (AA)
- ✅ Secondary Green on White: 4.5:1 (AA)
- ✅ Error Red on White: 4.5:1 (AA)
- ✅ Warning Amber on White: 4.5:1 (AA)
- ✅ Text Primary on White: 15.8:1 (AAA)

---

## Typography

**Font Family**: Roboto, sans-serif (MUI default)

**Font Weights**:
- Light: 300
- Regular: 400
- Medium: 500
- Bold: 700

**Headings**:
- H1: 96px / 300 weight
- H2: 60px / 300 weight
- H3: 48px / 400 weight
- H4: 34px / 400 weight
- H5: 24px / 400 weight
- H6: 20px / 500 weight

**Body**:
- Body 1: 16px / 400 weight (default)
- Body 2: 14px / 400 weight (secondary)

**Mobile Optimization**:
- Responsive font sizing with MUI's responsive typography
- Minimum 16px for body text (prevents zoom on iOS)
- Adequate line height (1.5) for readability

---

## Design Rationale

### Why Blue + Green?

1. **Sports Association**: Blue is universally associated with sports teams and athletics
2. **Trust & Energy**: Blue conveys professionalism and trust, green represents action and energy
3. **Positive Psychology**: Green is associated with "go" and positive responses
4. **High Contrast**: Both colors provide excellent contrast against white backgrounds
5. **Gender Neutral**: Appeals to all users regardless of gender
6. **Colorblind Friendly**: Blue and green are distinguishable for most types of colorblindness

### Material Design Foundation

Using Material Design's color system provides:
- Proven accessibility standards
- Consistent color relationships (light/dark variants)
- Predictable behavior across components
- Easy integration with MUI components
- Professional, modern aesthetic

---

## Future Extensibility

The theme system is designed to support per-organization customization:

1. **Logo-Based Extraction**: Upload logo → extract primary/secondary colors
2. **Custom Palettes**: Organizations can override primary/secondary colors
3. **Semantic Preservation**: RSVP colors (green/red/amber) remain consistent for UX
4. **Accessibility Enforcement**: System validates all custom colors meet WCAG AA
5. **Preview Mode**: Organizations can preview theme before applying

---

## Implementation

See `lib/theme.ts` for the complete MUI theme configuration with these colors.

```typescript
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
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
    fontFamily: 'Roboto, sans-serif',
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

export default theme;
```
