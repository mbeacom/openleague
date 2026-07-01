---
category: Events
---

EventCard is a clickable card for a game or practice: a type badge (GAME = primary, PRACTICE = secondary), the title (or "Home vs Away" when both teams are provided), and date/time/location rows. Clicking navigates to the event detail page (league-scoped when `leagueId` is set).

```tsx
<EventCard id={e.id} type="GAME" title={e.title} startAt={e.startAt} location={e.location} opponent={e.opponent} />
```
