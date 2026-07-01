# OpenLeague Design System — how to build with it

OpenLeague is a sports-team-management UI built on **MUI (Material UI) v7 with Emotion**, themed with the **"Digital Playbook"** aesthetic. Components are the real shipped React components; you compose them with realistic props.

## Always wrap the tree in the provider

Every screen must be wrapped in **`<DesignSystemProvider>`** (exported on the bundle). It supplies the MUI `ThemeProvider` + `CssBaseline` with the OpenLeague theme. Without it, components fall back to MUI's default blue/gray theme and lose the brand — the League Blue palette, Cabinet Grotesk font, 8px radius, and touch-target sizing all come from that provider.

```tsx
<DesignSystemProvider>
  <Card>
    <Card.Content>
      <h3 style={{ color: 'var(--league-blue)' }}>Riverside Renegades</h3>
    </Card.Content>
    <Card.Actions>
      <Button variant="contained">Manage</Button>
    </Card.Actions>
  </Card>
</DesignSystemProvider>
```

## Styling idiom: MUI props + `sx`, not utility classes

There is **no utility-class system** (no Tailwind classes on these components). Style through:

- **Component props** — `variant`, `color`, `size`, `fullWidth`, `disabled`. Colors are theme roles: `primary` (League Blue `#0D47A1`), `secondary` (Action Blue `#1976D2`), `success` (Scoreboard Green), `error` (Penalty Red), `warning`, `info`.
- **The `sx` prop** for one-off layout/spacing on any MUI component (`sx={{ mt: 2, display: 'flex', gap: 1 }}`). Spacing is an 8px scale.
- **Brand CSS variables** for custom (non-MUI) markup, defined globally: `--league-blue`, `--action-blue`, `--fresh-ice`, `--scoreboard-green`, `--penalty-red`, `--font-primary` (Cabinet Grotesk).

### Brand-specific extensions to know
- **`Button`** adds two on-brand CTA variants beyond MUI's: `variant="marketing"` (filled Action Blue, lifts on hover) and `variant="marketingSecondary"` (outlined League Blue). Use these for landing/marketing CTAs.
- **`Card`** adds `variant="marketing"` (gradient surface with a blue accent bar). Compose card bodies with the **`Card.Content`** and **`Card.Actions`** subcomponents.
- **`Dialog`** composes with **`Dialog.Title`**, **`Dialog.Content`**, **`Dialog.Actions`**.
- **Toasts**: wrap in `<ToastProvider>` and call the **`useToast()`** hook (`showSuccess`, `showError`, `showWarning`, `showInfo`) — don't hand-roll Snackbars.

## Where the truth lives

- Each component's exact props are in its **`<Name>.d.ts`**; usage notes are in **`<Name>.prompt.md`**.
- The full styling closure (tokens, fonts, base styles) is reachable from **`styles.css`**. Cabinet Grotesk loads at runtime from Fontshare via that stylesheet.
- Feature cards (PlayerCard, TeamCard, VenueCard, EventCard, LeagueOverviewCard, ConflictWarning, RSVPButtons) take domain records as props and gate admin-only UI behind an `isAdmin`/`role` prop — respect that gating (never surface emergency-contact or admin controls to non-admins).

## Idiomatic example

```tsx
<DesignSystemProvider>
  <div style={{ display: 'grid', gap: 16, maxWidth: 380 }}>
    <TeamCard team={team} role="ADMIN" showLeagueInfo showStats />
    <Button variant="marketing" fullWidth>Start Your Season</Button>
  </div>
</DesignSystemProvider>
```
