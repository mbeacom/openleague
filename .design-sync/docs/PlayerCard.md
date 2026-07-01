---
category: Roster
---

PlayerCard renders a single roster entry: a jersey-number chip, the player's name, and contact rows (email, phone). When `isAdmin` is true it also shows edit/delete icon buttons and an admin-only section with emergency contact and USA Hockey ID — never expose those to non-admins.

Use it inside a responsive grid of team members. `player` is a Player record; `onEdit` should open your edit flow.

```tsx
<PlayerCard player={player} isAdmin teamId={teamId} onEdit={() => openEdit(player)} />
```
