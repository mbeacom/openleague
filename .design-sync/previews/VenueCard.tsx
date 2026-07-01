import { VenueCard } from 'openleague';

const iceVenue = {
  id: 'v1',
  name: 'Riverside Ice Arena',
  address: '1200 River Road',
  city: 'Riverside',
  state: 'MN',
  surfaceType: 'ICE',
  capacity: 1200,
  visibility: 'PUBLIC',
  isActive: true,
  team: null,
  league: { id: 'l1', name: 'Metro Hockey League' },
};

export const IceRink = () => (
  <div style={{ maxWidth: 380 }}>
    <VenueCard venue={iceVenue as any} />
  </div>
);

export const TurfField = () => (
  <div style={{ maxWidth: 380 }}>
    <VenueCard venue={{ ...iceVenue, id: 'v2', name: 'Lakeside Turf Complex', surfaceType: 'TURF', city: 'Lakeside', visibility: 'LEAGUE', capacity: 500 } as any} />
  </div>
);

export const Inactive = () => (
  <div style={{ maxWidth: 380 }}>
    <VenueCard venue={{ ...iceVenue, id: 'v3', name: 'Old Downtown Court', surfaceType: 'COURT', city: 'Downtown', visibility: 'TEAM', capacity: null, isActive: false, team: { id: 't1', name: 'Downtown Dribblers' }, league: null } as any} />
  </div>
);
