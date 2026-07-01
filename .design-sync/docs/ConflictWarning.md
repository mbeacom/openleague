---
category: Events
---

ConflictWarning is a warning Alert shown when a new event overlaps existing team events. It lists each conflicting team + event, optionally renders clickable suggested-alternative-time chips, and — for league admins (`canOverride`) — an Override Conflicts button. Non-admins see guidance to pick a different time.

```tsx
<ConflictWarning
  conflicts={conflicts}
  suggestions={suggestions}
  canOverride={isLeagueAdmin}
  onSuggestionSelect={applyTime}
  onOverrideConflicts={override}
/>
```
