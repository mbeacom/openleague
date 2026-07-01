---
category: Events
---

RSVPButtons is a three-way attendance toggle (Going / Maybe / Not Going) with success/warning/error colors and status icons. The selected status renders as a filled (contained) button; the others are outlined. Updates are optimistic.

```tsx
<RSVPButtons eventId={event.id} currentStatus={myStatus} onStatusChange={setMyStatus} />
```
