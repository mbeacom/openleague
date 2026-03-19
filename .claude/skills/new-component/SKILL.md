---
name: new-component
description: "Scaffold a new MUI component with Digital Playbook theme, proper client/server boundary, and project conventions"
disable-model-invocation: true
---

# New Component

Scaffolds a React component following the project's MUI v7 + Digital Playbook aesthetic conventions.

## Arguments

Accepts a name and location (e.g., `/new-component PlayerStatCard components/features/roster/`).

## Steps

1. **Determine if Client or Server** — Only add `'use client'` if the component needs interactivity, hooks, or browser APIs. Default to Server Component.
2. **Check existing patterns** — Read 1-2 similar components in the target directory for style reference
3. **Create the component** following the conventions below
4. **Type-check** — Run `bun run type-check`

## Conventions

### File Structure
- Feature components: `components/features/<domain>/<ComponentName>.tsx`
- UI primitives: `components/ui/<ComponentName>.tsx`
- Providers: `components/providers/<ProviderName>.tsx`

### Digital Playbook Theme Tokens
- Primary (League Blue): use `primary.main` from MUI theme
- Secondary (Action Blue): use `secondary.main` for links, CTAs, active states
- Backgrounds: use `background.default` (Fresh Ice white) and `background.paper`
- Success: Scoreboard Green via `success.main`
- Error: Penalty Box Red via `error.main`
- Typography: use theme typography variants, not arbitrary font sizes

### MUI Patterns
- Use `Box`, `Stack`, `Grid` for layout (not raw divs with Tailwind flex)
- Use `Typography` with theme variants for text
- Use `Card`/`CardContent` for data containers
- Use `sx` prop for one-off styling, Tailwind only for utility classes MUI doesn't cover
- Use `useTheme()` and `useMediaQuery()` for responsive behavior in client components

### Mobile-First
- Always design mobile layout first
- Touch targets: minimum 44x44px
- Use MUI breakpoints: `xs` (<600px), `sm` (600-960px), `md` (>960px)
- Tables should convert to card layouts on mobile

### Template (Client Component)

```tsx
'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
} from '@mui/material';

interface ComponentNameProps {
  title: string;
}

export function ComponentName({ title }: ComponentNameProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {expanded && (
          <Typography variant="body2" color="text.secondary">
            {/* Expanded content */}
          </Typography>
        )}
        <Button size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Less' : 'More'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

### Template (Server Component)

```tsx
import {
  Card,
  CardContent,
  Typography,
} from '@mui/material';

interface ComponentNameProps {
  // Define typed props — data passed from page.tsx
  title: string;
  items: Array<{ id: string; label: string }>;
}

export function ComponentName({ title, items }: ComponentNameProps) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {items.map((item) => (
          <Typography key={item.id} variant="body2">
            {item.label}
          </Typography>
        ))}
      </CardContent>
    </Card>
  );
}
```
