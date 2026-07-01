// Design-sync aggregate bundle entry. Re-exports the components/ui primitives
// plus the scoped feature components so every synced component lands on
// window.OpenLeague. This is the --entry the converter bundles; it never ships
// in the app (the app imports from '@/components/...' directly).
export * from '@/components/ui/index';

// Feature components (default exports → named for the global).
export { default as PlayerCard } from '@/components/features/roster/PlayerCard';
export { default as VenueCard } from '@/components/features/venues/VenueCard';
export { default as ConflictWarning } from '@/components/features/events/ConflictWarning';
export { default as EventCard } from '@/components/features/calendar/EventCard';
export { default as TeamCard } from '@/components/features/dashboard/TeamCard';
export { default as LeagueOverviewCard } from '@/components/features/dashboard/LeagueOverviewCard';

// Named exports.
export { RSVPButtons } from '@/components/features/events/RSVPButtons';
