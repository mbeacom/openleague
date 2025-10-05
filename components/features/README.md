# Feature Components

This directory contains feature-specific components organized by domain.

## Structure

```
features/
├── team/
│   └── CreateTeamForm.tsx
├── roster/
│   ├── RosterList.tsx
│   ├── PlayerCard.tsx
│   ├── AddPlayerDialog.tsx
│   └── InvitationManager.tsx
├── calendar/
│   ├── EventCard.tsx
│   └── EventList.tsx
└── events/
    ├── EventForm.tsx
    ├── RSVPButtons.tsx
    └── AttendanceView.tsx
```

## Pattern

Feature components:
1. Are grouped by domain (roster, calendar, events, etc.)
2. Can be Server Components or Client Components
3. Use `'use client'` directive only when needed (interactivity, hooks)
4. Import UI components from `@/components/ui`
5. Call Server Actions for mutations

## Example Server Component

```typescript
// components/features/roster/RosterList.tsx
import { prisma } from '@/lib/db/prisma';
import { PlayerCard } from './PlayerCard';

export async function RosterList({ teamId }: { teamId: string }) {
  const players = await prisma.player.findMany({
    where: { teamId },
  });

  return (
    <div>
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </div>
  );
}
```

## Example Client Component

```typescript
'use client'

// components/features/events/RSVPButtons.tsx
import { useOptimistic } from 'react';
import { updateRSVP } from '@/lib/actions/rsvp';
import { Button } from '@/components/ui/Button';

export function RSVPButtons({ eventId, currentStatus }: Props) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(currentStatus);

  async function handleRSVP(status: RSVPStatus) {
    setOptimisticStatus(status);
    await updateRSVP(eventId, status);
  }

  return (
    <>
      <Button onClick={() => handleRSVP('GOING')}>Going</Button>
      <Button onClick={() => handleRSVP('NOT_GOING')}>Not Going</Button>
      <Button onClick={() => handleRSVP('MAYBE')}>Maybe</Button>
    </>
  );
}
```
