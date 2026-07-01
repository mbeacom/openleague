---
category: Dashboard
---

TeamCard summarizes a team: an initials avatar, name, a sport chip and season, an optional league/division chip row (`showLeagueInfo`), an optional players/events stat grid (`showStats`), and a role badge. Admins get an extra Manage action.

```tsx
<TeamCard team={team} role="ADMIN" showLeagueInfo showStats />
```
